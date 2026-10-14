import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  ATTACHMENT_IMAGE_MAXIMUM_DIMENSION,
  ATTACHMENT_IMAGE_MAXIMUM_PIXELS,
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
import { grayscalePng } from '../helpers/attachment-images.js';

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

  it('rejects highly compressed real PNGs beyond the pixel budget and accepts both exact limits', () => {
    const large = grayscalePng(6144, 4096);
    expect(large.length).toBeLessThan(100_000);
    expect(() => validateStrategyAttachmentBytes(large, 'image/png')).toThrowError(
      expect.objectContaining({ status: 413, code: 'IMAGE_DIMENSIONS_EXCEEDED' }),
    );
    const boundary = grayscalePng(
      ATTACHMENT_IMAGE_MAXIMUM_DIMENSION,
      ATTACHMENT_IMAGE_MAXIMUM_PIXELS / ATTACHMENT_IMAGE_MAXIMUM_DIMENSION,
    );
    expect(validateStrategyAttachmentBytes(boundary, 'image/png')).toBe('image/png');
    expect(() =>
      validateStrategyAttachmentBytes(
        grayscalePng(ATTACHMENT_IMAGE_MAXIMUM_DIMENSION + 1, 1),
        'image/png',
      ),
    ).toThrowError(expect.objectContaining({ code: 'IMAGE_DIMENSIONS_EXCEEDED' }));
  });

  it('bounds JPEG frame dimensions and both WebP bitstream and extended canvas dimensions', () => {
    const frame = Buffer.from([
      255, 216, 255, 192, 0, 11, 8, 255, 255, 255, 255, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63,
      0, 0, 255, 217,
    ]);
    expect(() => validateStrategyAttachmentBytes(frame, 'image/jpeg')).toThrowError(
      expect.objectContaining({ code: 'IMAGE_DIMENSIONS_EXCEEDED' }),
    );
    function webpChunk(type: string, payload: Buffer): Buffer {
      const chunk = Buffer.alloc(8);
      chunk.write(type, 0, 'ascii');
      chunk.writeUInt32LE(payload.length, 4);
      return Buffer.concat([chunk, payload, Buffer.alloc(payload.length % 2)]);
    }
    function webp(...chunks: Buffer[]): Buffer {
      const header = Buffer.alloc(12);
      header.write('RIFF', 0, 'ascii');
      header.writeUInt32LE(4 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
      header.write('WEBP', 8, 'ascii');
      return Buffer.concat([header, ...chunks]);
    }
    const vp8 = Buffer.from([0, 0, 0, 157, 1, 42, 255, 63, 255, 63]);
    const vp8l = Buffer.alloc(5);
    vp8l[0] = 47;
    vp8l.writeUInt32LE(16382 | (16382 << 14), 1);
    const canvas = Buffer.alloc(10);
    canvas.writeUIntLE(65534, 4, 3);
    canvas.writeUIntLE(65534, 7, 3);
    const smallVp8 = Buffer.from([0, 0, 0, 157, 1, 42, 1, 0, 1, 0]);
    for (const body of [
      webp(webpChunk('VP8 ', vp8)),
      webp(webpChunk('VP8L', vp8l)),
      webp(webpChunk('VP8X', canvas), webpChunk('VP8 ', smallVp8)),
    ])
      expect(() => validateStrategyAttachmentBytes(body, 'image/webp')).toThrowError(
        expect.objectContaining({ code: 'IMAGE_DIMENSIONS_EXCEEDED' }),
      );
    const zeroVp8 = Buffer.from([0, 0, 0, 157, 1, 42, 0, 0, 1, 0]);
    expect(() =>
      validateStrategyAttachmentBytes(webp(webpChunk('VP8 ', zeroVp8)), 'image/webp'),
    ).toThrowError(expect.objectContaining({ status: 415, code: 'INVALID_ATTACHMENT_CONTENT' }));
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

  it('snapshots reusable fragmented stream buffers exactly across multiple bounded blocks', async () => {
    const expected = Buffer.alloc(3 * 64 * 1024 + 17);
    for (let index = 0; index < expected.length; index += 1) expected[index] = index % 251;
    const shared = Buffer.alloc(257);
    let offset = 0;
    let empty = true;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (offset === expected.length) {
            controller.close();
            return;
          }
          if (empty) {
            controller.enqueue(new Uint8Array(0));
            empty = false;
            return;
          }
          const length = Math.min(shared.length, expected.length - offset);
          expected.copy(shared, 0, offset, offset + length);
          controller.enqueue(shared.subarray(0, length));
          offset += length;
          empty = true;
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request('http://localhost/upload', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    const bytes = await readStrategyAttachmentBody(request);
    expect(bytes.byteLength).toBe(expected.byteLength);
    expect(Buffer.from(bytes)).toEqual(expected);
    expect(stream.locked).toBe(false);
  });

  it('ignores many empty chunks and preserves a tiny file fragmented into single bytes', async () => {
    let empty = 32_768;
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (empty-- > 0) controller.enqueue(new Uint8Array(0));
          else if (offset < png.length) controller.enqueue(png.subarray(offset, ++offset));
          else controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request('http://localhost/upload', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect(Buffer.from(await readStrategyAttachmentBody(request))).toEqual(png);
    expect(stream.locked).toBe(false);
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
