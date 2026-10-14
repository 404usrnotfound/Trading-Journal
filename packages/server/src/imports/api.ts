import { financialIdSchema } from '@journal/contracts';
import type { ServerServices } from '../services.js';
import { ApplicationError, inaccessible } from '../errors.js';
import { readBoundedJson } from '../security.js';
import { createImportServices } from './service.js';
import { createImportTemplates } from './templates.js';
import { ImportAdapterRegistry } from './adapters/registry.js';
export function createImportApi(
  platform: Pick<
    ServerServices,
    'authorizeWorkspace' | 'requireMutationSession' | 'withWorkspaceContext'
  >,
  registry = new ImportAdapterRegistry(),
) {
  const services = createImportServices(platform, registry),
    templates = createImportTemplates(platform, registry);
  return async (
    request: Request,
    workspaceId: string,
    path: readonly string[],
  ): Promise<Response> => {
    const writing = request.method !== 'GET';
    if (writing) await platform.requireMutationSession(request);
    const context = await platform.authorizeWorkspace(
      request,
      financialIdSchema.parse(workspaceId),
      writing ? 'editor' : 'viewer',
    );
    if (!['GET', 'POST'].includes(request.method))
      throw new ApplicationError(
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        'Use the documented import method.',
      );
    const key = writing ? financialIdSchema.parse(request.headers.get('idempotency-key')) : '';
    const url = new URL(request.url);
    let result: unknown;
    if (!writing && path.length === 1 && path[0] === 'catalog')
      result = await templates.catalog(context);
    else if (!writing && path.length === 1 && path[0] === 'templates')
      result = await templates.list(context);
    else if (
      writing &&
      path[0] === 'templates' &&
      (path.length === 1 || (path.length === 3 && path[2] === 'versions'))
    )
      result = await templates.save(
        context,
        await readBoundedJson(request, 131072),
        key,
        path.length === 3 ? path[1] : undefined,
      );
    else if (path[0] === 'batches' && path.length === 1)
      result = writing
        ? await services.stage(context, await readBoundedJson(request, 4_194_304), key)
        : await services.history(context, url.searchParams.get('cursor') ?? undefined);
    else if (path[0] === 'batches' && path.length >= 2) {
      const id = financialIdSchema.parse(path[1]);
      if (!writing && path.length === 2)
        result = await services.detail(context, id, Number(url.searchParams.get('cursor') ?? 0));
      else if (!writing && path.length === 3 && path[2] === 'source') {
        const source = await services.source(context, id);
        return new Response(source.content, {
          headers: {
            // Preserve evidence bytes, but do not associate raw, attacker-supplied formulas
            // or names with a spreadsheet/executable file handler on download.
            'content-type': 'text/plain; charset=utf-8',
            'content-disposition': `attachment; filename="import-${id}.source.txt"`,
            'cache-control': 'private, no-store',
            'x-content-type-options': 'nosniff',
            'x-source-sha256': source.fileHash,
          },
        });
      } else if (writing && path.length === 3) {
        const body = await readBoundedJson(request, 65536);
        if (path[2] === 'preview') result = await services.preview(context, id, body);
        else if (path[2] === 'commit') result = await services.commit(context, id, body, key);
        else if (path[2] === 'reverse') result = await services.reverse(context, id, body, key);
        else throw inaccessible();
      } else throw inaccessible();
    } else throw inaccessible();
    return new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
    });
  };
}
