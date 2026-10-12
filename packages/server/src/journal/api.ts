import * as contract from '@journal/contracts';
import type { ServerServices } from '../services.js';
import { ApplicationError, inaccessible } from '../errors.js';
import { readBoundedJson } from '../security.js';
import { createJournalServices } from './service.js';

export function createJournalApi(
  platform: Pick<
    ServerServices,
    'authorizeWorkspace' | 'requireMutationSession' | 'withWorkspaceContext'
  >,
) {
  const journal = createJournalServices(platform);
  return async (
    request: Request,
    workspaceId: string,
    path: readonly string[],
  ): Promise<Response> => {
    if (!['GET', 'POST', 'PUT'].includes(request.method))
      throw new ApplicationError(
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        'Use GET, POST or PUT for journal resources.',
      );
    const writing = request.method !== 'GET';
    if (writing) await platform.requireMutationSession(request);
    const context = await platform.authorizeWorkspace(
      request,
      contract.financialIdSchema.parse(workspaceId).toLowerCase(),
      writing ? 'editor' : 'viewer',
    );
    const query = () => Object.fromEntries(new URL(request.url).searchParams);
    const commandId = () =>
      contract.financialIdSchema.parse(request.headers.get('idempotency-key'));
    const body = () => readBoundedJson(request, 262_144);
    let result: unknown;
    if (path.length === 0 && request.method === 'GET')
      result = contract.journalListResponseSchema.parse(
        await journal.list(context, contract.journalListQuerySchema.parse(query())),
      );
    else if (path.length === 0 && request.method === 'POST')
      result = contract.journalDetailResponseSchema.parse(
        await journal.create(
          context,
          contract.journalCreateSchema.parse(await body()),
          commandId(),
        ),
      );
    else if (path.length === 1) {
      const tradeId = contract.financialIdSchema.parse(path[0]);
      if (request.method === 'GET')
        result = contract.journalDetailResponseSchema.parse(await journal.get(context, tradeId));
      else if (request.method === 'PUT')
        result = contract.journalEntryResponseSchema.parse(
          await journal.save(
            context,
            tradeId,
            contract.journalSaveSchema.parse(await body()),
            commandId(),
          ),
        );
      else throw inaccessible();
    } else if (path.length === 2) {
      const tradeId = contract.financialIdSchema.parse(path[0]);
      if (path[1] === 'plans' && request.method === 'GET')
        result = contract.journalPlansResponseSchema.parse(
          await journal.plans(context, tradeId, contract.journalPlansQuerySchema.parse(query())),
        );
      else if (path[1] === 'plans' && request.method === 'POST')
        result = contract.journalPlanVersionResponseSchema.parse(
          await journal.publishPlan(
            context,
            tradeId,
            contract.journalPublishPlanSchema.parse(await body()),
            commandId(),
          ),
        );
      else if (path[1] === 'revisions' && request.method === 'GET')
        result = contract.journalRevisionsResponseSchema.parse(
          await journal.revisions(
            context,
            tradeId,
            contract.journalRevisionsQuerySchema.parse(query()),
          ),
        );
      else if (path[1] === 'risk-additions' && request.method === 'GET')
        result = contract.journalRiskAdditionsResponseSchema.parse(
          await journal.riskAdditions(
            context,
            tradeId,
            contract.journalRiskAdditionsQuerySchema.parse(query()),
          ),
        );
      else if (path[1] === 'risk-additions' && request.method === 'POST')
        result = contract.journalRiskAdditionResponseSchema.parse(
          await journal.addRisk(
            context,
            tradeId,
            contract.journalRiskAdditionSchema.parse(await body()),
            commandId(),
          ),
        );
      else throw inaccessible();
    } else if (path.length === 3 && path[1] === 'revisions' && request.method === 'GET')
      result = contract.journalRevisionResponseSchema.parse(
        await journal.getRevision(
          context,
          contract.financialIdSchema.parse(path[0]),
          contract.financialIdSchema.parse(path[2]),
        ),
      );
    else throw inaccessible();
    return Response.json(result, {
      status: 200,
      headers: { 'cache-control': 'private, no-store' },
    });
  };
}
