import * as contract from '@journal/contracts';
import type { ServerServices } from '../services.js';
import { ApplicationError, inaccessible } from '../errors.js';
import { readBoundedJson } from '../security.js';
import { createStrategyServices } from './service.js';

export function createStrategyApi(
  platform: Pick<
    ServerServices,
    'authorizeWorkspace' | 'requireMutationSession' | 'withWorkspaceContext'
  >,
) {
  const strategies = createStrategyServices(platform);
  return async function handleStrategyRequest(
    request: Request,
    workspaceId: string,
    path: readonly string[],
  ): Promise<Response> {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(request.method))
      throw new ApplicationError(
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        'Use GET, POST, PUT or DELETE for strategy resources.',
      );
    const writing = request.method !== 'GET';
    if (writing) await platform.requireMutationSession(request);
    const context = await platform.authorizeWorkspace(
      request,
      contract.financialIdSchema.parse(workspaceId).toLowerCase(),
      writing ? 'editor' : 'viewer',
    );
    let value: unknown;
    const query = () => Object.fromEntries(new URL(request.url).searchParams);
    const commandId = () =>
      contract.financialIdSchema.parse(request.headers.get('idempotency-key'));
    const body = () => readBoundedJson(request, 262_144);
    if (path.length === 0 && request.method === 'GET')
      value = contract.strategyListResponseSchema.parse(
        await strategies.list(context, contract.strategyListQuerySchema.parse(query())),
      );
    else if (path.length === 0 && request.method === 'POST')
      value = contract.strategyResponseSchema.parse(
        await strategies.create(
          context,
          contract.strategyCreateSchema.parse(await body()),
          commandId(),
        ),
      );
    else if (path.length === 1) {
      const id = contract.financialIdSchema.parse(path[0]);
      if (request.method === 'GET')
        value = contract.strategyResponseSchema.parse(await strategies.get(context, id));
      else if (request.method === 'PUT')
        value = contract.strategyResponseSchema.parse(
          await strategies.update(
            context,
            id,
            contract.strategyUpdateSchema.parse(await body()),
            commandId(),
          ),
        );
      else if (request.method === 'DELETE')
        value = contract.strategyResponseSchema.parse(
          await strategies.archive(
            context,
            id,
            contract.strategyArchiveSchema.parse(await body()),
            commandId(),
          ),
        );
      else throw inaccessible();
    } else if (path.length === 2) {
      const id = contract.financialIdSchema.parse(path[0]);
      if (path[1] === 'versions' && request.method === 'GET')
        value = contract.strategyVersionListResponseSchema.parse(
          await strategies.versions(
            context,
            id,
            contract.strategyVersionsQuerySchema.parse(query()),
          ),
        );
      else if ((path[1] === 'trades' || path[1] === 'trade-links') && request.method === 'GET')
        value = contract.strategyTradesResponseSchema.parse(
          await strategies.linkedTrades(
            context,
            id,
            contract.strategyTradesQuerySchema.parse(query()),
          ),
        );
      else if (path[1] === 'trade-links' && request.method === 'POST')
        value = contract.strategyTradeLinkResponseSchema.parse(
          await strategies.linkTrade(
            context,
            id,
            contract.strategyTradeLinkCreateSchema.parse(await body()),
            commandId(),
          ),
        );
      else throw inaccessible();
    } else if (path.length === 3 && path[1] === 'versions' && request.method === 'GET')
      value = contract.strategyVersionResponseSchema.parse(
        await strategies.getVersion(
          context,
          contract.financialIdSchema.parse(path[0]),
          contract.financialIdSchema.parse(path[2]),
        ),
      );
    else throw inaccessible();
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
    });
  };
}
