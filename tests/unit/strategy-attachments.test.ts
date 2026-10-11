import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  STRATEGY_ATTACHMENT_MAXIMUM_BYTES,
  strategyAttachmentResponseSchema,
} from '@journal/contracts';
import { ApplicationError, type ServerServices } from '@journal/server';
import { validateStrategyAttachmentBytes } from '../../packages/server/src/strategies/attachments.js';
import {
  createStrategyAttachmentApi,
  readStrategyAttachmentBody,
  strategyAttachmentDisposition,
} from '../../packages/server/src/strategies/attachment-api.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lVYAAAAASUVORK5CYII=',
  'base64',
);

describe('strategy attachment binary boundary', () => {
  it('accepts a real PNG signature/container and a PDF envelope, independently of filename extensions', () => {
    expect(validateStrategyAttachmentBytes(png, 'image/png')).toBe('image/png');
    expect(
      validateStrategyAttachmentBytes(
        Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n'),
        'application/pdf',
      ),
    ).toBe('application/pdf');
  });

  it('accepts genuine JPEG and WebP containers and rejects bare magic-byte stubs', () => {
    const jpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDx2iiiu04z/9k=',
      'base64',
    );
    const webp = Buffer.from(
      'UklGRjAAAABXRUJQVlA4ICQAAABQAQCdASoBAAEAAUAmJQBOgC6gAP77LkvF3YjjJ4dVU9ffoAA=',
      'base64',
    );
    expect(validateStrategyAttachmentBytes(jpeg, 'image/jpeg')).toBe('image/jpeg');
    expect(validateStrategyAttachmentBytes(webp, 'image/webp')).toBe('image/webp');
    expect(() =>
      validateStrategyAttachmentBytes(Buffer.from([255, 216, 255, 217]), 'image/jpeg'),
    ).toThrow();
    const emptyWebp = Buffer.alloc(20);
    emptyWebp.write('RIFF');
    emptyWebp.writeUInt32LE(12, 4);
    emptyWebp.write('WEBPVP8 ', 8);
    expect(() => validateStrategyAttachmentBytes(emptyWebp, 'image/webp')).toThrow();
  });

  it('rejects MIME spoofing, active content, truncated containers and oversized files', () => {
    for (const [bytes, mime] of [
      [png, 'image/jpeg'],
      [Buffer.from('<svg><script>alert(1)</script></svg>'), 'image/png'],
      [png.subarray(0, -1), 'image/png'],
      [Buffer.from('%PDF-1.7\n<script>'), 'application/pdf'],
      [Buffer.from('plain content'), 'image/webp'],
      [Buffer.alloc(0), 'image/png'],
      [Buffer.alloc(STRATEGY_ATTACHMENT_MAXIMUM_BYTES + 1), 'image/png'],
    ] as const)
      expect(() => validateStrategyAttachmentBytes(bytes, mime)).toThrow();
    expect(() => validateStrategyAttachmentBytes(png, 'image/svg+xml')).toThrow();
  });

  it('bounds a chunked body independently of Content-Length and cancels overflow', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.alloc(STRATEGY_ATTACHMENT_MAXIMUM_BYTES));
        controller.enqueue(Buffer.from([1]));
      },
      cancel,
    });
    const request = new Request('http://localhost/upload', {
      method: 'POST',
      headers: { 'content-length': '1' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    await expect(readStrategyAttachmentBody(request)).rejects.toMatchObject({
      status: 413,
      code: 'INPUT_TOO_LARGE',
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects oversized declared length before consuming and reconstructs accepted chunks exactly', async () => {
    await expect(
      readStrategyAttachmentBody(
        new Request('http://localhost/upload', {
          method: 'POST',
          headers: { 'content-length': String(STRATEGY_ATTACHMENT_MAXIMUM_BYTES + 1) },
          body: png,
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(png.subarray(0, 15));
        controller.enqueue(png.subarray(15));
        controller.close();
      },
    });
    const request = new Request('http://localhost/upload', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect(Buffer.from(await readStrategyAttachmentBody(request))).toEqual(png);
  });

  it('uses safe RFC 5987 Unicode names and always downloads PDFs', () => {
    const disposition = strategyAttachmentDisposition('RSI été "entry".png', 'image/png');
    expect(disposition).toContain('inline; filename="RSI _t_ _entry_.png"');
    expect(disposition).toContain("filename*=UTF-8''RSI%20%C3%A9t%C3%A9%20%22entry%22.png");
    expect(strategyAttachmentDisposition('playbook.pdf', 'application/pdf')).toMatch(
      /^attachment;/u,
    );
    for (const name of ['../secret.png', 'path\\secret.png', 'unsafe\r\nX: 1.png'])
      expect(() => strategyAttachmentDisposition(name, 'image/png')).toThrow();
  });

  it('serializes public metadata without arbitrary URLs, file paths or mutable storage internals', () => {
    const metadata = {
      id: randomUUID(),
      workspaceId: randomUUID(),
      name: 'entry.png',
      mediaType: 'image/png',
      size: png.length,
      sha256: 'a'.repeat(64),
      createdAt: '2026-10-11T00:00:00Z',
    };
    expect(strategyAttachmentResponseSchema.parse(metadata)).toEqual(metadata);
    for (const extra of [
      { url: 'https://attacker.example' },
      { storageKey: '/private/file' },
      { state: 'pending' },
    ])
      expect(strategyAttachmentResponseSchema.safeParse({ ...metadata, ...extra }).success).toBe(
        false,
      );
  });

  it('does not initialize private storage or consume a body before session/role authorization', async () => {
    const read = vi.fn();
    const platform = {
      requireMutationSession: vi
        .fn()
        .mockRejectedValue(
          new ApplicationError(401, 'UNAUTHENTICATED', 'Sign in required', 'Sign in.'),
        ),
      authorizeWorkspace: vi.fn(),
      withWorkspaceContext: vi.fn(),
    } as unknown as Pick<
      ServerServices,
      'requireMutationSession' | 'authorizeWorkspace' | 'withWorkspaceContext'
    >;
    const api = createStrategyAttachmentApi(platform);
    const request = new Request('http://localhost/upload', { method: 'POST', body: png });
    Object.defineProperty(request, 'body', { get: read });
    await expect(api(request, randomUUID())).rejects.toMatchObject({ status: 401 });
    expect(read).not.toHaveBeenCalled();
    expect(platform.authorizeWorkspace).not.toHaveBeenCalled();
    expect(platform.withWorkspaceContext).not.toHaveBeenCalled();
  });
});
