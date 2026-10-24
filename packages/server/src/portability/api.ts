import { z } from 'zod';
import { PORTABLE_MAXIMUM_BYTES } from '@journal/contracts';
import type { ServerServices } from '../services.js';
import { ApplicationError, inaccessible } from '../errors.js';
import { readBoundedJson } from '../security.js';
import { getServerConfig } from '../config.js';
import { createPrivateFileStore, type PrivateFileStore } from '../storage.js';
import { createPortabilityServices } from './service.js';

type Platform = Pick<
  ServerServices,
  'authorizeWorkspace' | 'requireMutationSession' | 'withWorkspaceContext'
>;
export function createPortabilityApi(
  platform: Platform,
  options: { store?: PrivateFileStore } = {},
) {
  let service: ReturnType<typeof createPortabilityServices> | undefined;
  const getService = () =>
    (service ??= createPortabilityServices(
      platform,
      options.store ??
        createPrivateFileStore(getServerConfig().storageRoot, { maximumBytes: 10 * 1024 * 1024 }),
    ));
  return async (
    request: Request,
    workspaceId: string,
    path: readonly string[],
  ): Promise<Response> => {
    const id = z.uuidv4().parse(workspaceId).toLowerCase();
    if (!['GET', 'POST'].includes(request.method))
      throw new ApplicationError(
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        'Use GET for backups and POST for restore or filtered exports.',
      );
    if (path.length !== 1) throw inaccessible();
    const operation = path[0];
    if (request.method === 'POST') await platform.requireMutationSession(request);
    const context = await platform.authorizeWorkspace(
      request,
      id,
      operation === 'restore' || operation === 'backup' ? 'owner' : 'viewer',
    );
    const headers = {
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    };
    if (request.method === 'GET' && operation === 'backup') {
      if (new URL(request.url).searchParams.size)
        throw new ApplicationError(
          400,
          'INVALID_REQUEST',
          'Invalid request',
          'Workspace backups do not accept filters. Use filtered exports for a record selection.',
        );
      const archive = await getService().backup(context);
      return new Response(JSON.stringify(archive), {
        headers: {
          ...headers,
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': `attachment; filename="workspace-${id}.journal.json"`,
          'x-archive-sha256': archive.sha256,
        },
      });
    }
    if (request.method === 'POST' && operation === 'restore') {
      const commandId = z.uuidv4().parse(request.headers.get('idempotency-key'));
      const result = await getService().restore(
        context,
        await readBoundedJson(request, PORTABLE_MAXIMUM_BYTES),
        commandId,
      );
      return Response.json(result, { status: 201, headers });
    }
    if (request.method === 'POST' && operation === 'export') {
      const result = await getService().exportRecords(
        context,
        await readBoundedJson(request, 65536),
      );
      return new Response(result.body, {
        headers: {
          ...headers,
          'content-type': result.mediaType,
          'content-disposition': `attachment; filename="${result.filename}"`,
        },
      });
    }
    throw inaccessible();
  };
}
