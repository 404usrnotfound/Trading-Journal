import * as contract from '@journal/contracts';
import { ApplicationError, inaccessible } from '../errors.js';
import { readBoundedJson } from '../security.js';
import type { ServerServices } from '../services.js';
import { createReconciliationServices } from './service.js';

export function createReconciliationApi(
  platform: Pick<
    ServerServices,
    'authorizeWorkspace' | 'requireMutationSession' | 'withWorkspaceContext'
  >,
) {
  const services = createReconciliationServices(platform);
  return async (
    request: Request,
    workspaceId: string,
    path: readonly string[],
  ): Promise<Response> => {
    if (!['GET', 'POST'].includes(request.method))
      throw new ApplicationError(
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        'Use GET or POST for statement evidence.',
      );
    const writing = request.method === 'POST';
    if (writing) await platform.requireMutationSession(request);
    const context = await platform.authorizeWorkspace(
      request,
      contract.financialIdSchema.parse(workspaceId).toLowerCase(),
      writing ? 'editor' : 'viewer',
    );
    const commandId = () =>
      contract.financialIdSchema.parse(request.headers.get('idempotency-key')).toLowerCase();
    const body = () => readBoundedJson(request, 131072);
    const query = () =>
      contract.statementListQuerySchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
    let result: unknown;
    if (path.length === 1 && path[0] === 'statements') {
      result = writing
        ? contract.statementResponseSchema.parse(
            await services.create(
              context,
              contract.createStatementRequestSchema.parse(await body()),
              commandId(),
            ),
          )
        : contract.statementListResponseSchema.parse(await services.list(context, query()));
    } else if (path[0] === 'statements' && path.length === 2 && !writing)
      result = contract.statementResponseSchema.parse(
        await services.get(context, contract.financialIdSchema.parse(path[1])),
      );
    else if (path[0] === 'statements' && path.length === 3 && path[2] === 'evaluations') {
      const id = contract.financialIdSchema.parse(path[1]);
      result = writing
        ? contract.statementReconciliationResponseSchema.parse(
            await services.evaluate(
              context,
              id,
              contract.evaluateStatementRequestSchema.parse(await body()),
              commandId(),
            ),
          )
        : contract.statementEvaluationListResponseSchema.parse(
            await services.evaluations(context, id, query()),
          );
    } else if (path[0] === 'evaluations' && path.length === 2 && !writing)
      result = contract.statementReconciliationResponseSchema.parse(
        await services.evaluation(context, contract.financialIdSchema.parse(path[1])),
      );
    else throw inaccessible();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
    });
  };
}
