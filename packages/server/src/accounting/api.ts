import * as contract from '@journal/contracts';
import { ApplicationError, inaccessible } from '../errors.js';
import { readBoundedJson } from '../security.js';
import type { ServerServices } from '../services.js';
import { createAccountingServices } from './service.js';
import { createAccountingReports } from './report.js';

export function createAccountingApi(
  platform: Pick<
    ServerServices,
    'authorizeWorkspace' | 'requireMutationSession' | 'withWorkspaceContext'
  >,
) {
  const accounting = createAccountingServices(platform);
  const reports = createAccountingReports(platform);
  return async function handleAccountingRequest(
    request: Request,
    workspaceId: string,
    path: readonly string[],
  ): Promise<Response> {
    if (!['GET', 'POST'].includes(request.method))
      throw new ApplicationError(
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        'Use GET or POST for accounting resources.',
      );
    // A report is a bounded, read-only query. It never creates commands or advances revisions.
    const reporting = request.method === 'POST' && path.length === 1 && path[0] === 'reports';
    const writing = request.method === 'POST' && !reporting;
    if (writing) await platform.requireMutationSession(request);
    const context = await platform.authorizeWorkspace(
      request,
      contract.financialIdSchema.parse(workspaceId).toLowerCase(),
      writing ? 'editor' : 'viewer',
    );
    const query = () => Object.fromEntries(new URL(request.url).searchParams);
    const commandId = () =>
      contract.financialIdSchema.parse(request.headers.get('idempotency-key')).toLowerCase();
    const body = () => readBoundedJson(request, 262_144);
    let value: unknown;
    if (reporting)
      value = contract.accountingReportResponseSchema.parse(
        await reports.report(context, contract.accountingReportRequestSchema.parse(await body())),
      );
    else if (path.length === 1 && path[0] === 'portfolios') {
      if (request.method === 'GET')
        value = contract.portfolioListResponseSchema.parse(
          await accounting.portfolios(context, contract.portfolioListQuerySchema.parse(query())),
        );
      else
        value = contract.portfolioMutationResponseSchema.parse(
          await accounting.createPortfolio(context, {
            ...contract.createPortfolioRequestSchema.parse(await body()),
            commandId: commandId(),
          }),
        );
    } else if (path[0] === 'portfolios' && (path.length === 2 || path.length === 3)) {
      const id = contract.financialIdSchema.parse(path[1]).toLowerCase();
      if (path.length === 2 && request.method === 'GET')
        value = contract.portfolioResponseSchema.parse(await accounting.portfolio(context, id));
      else if (path.length === 2 && request.method === 'POST')
        value = contract.portfolioMutationResponseSchema.parse(
          await accounting.updatePortfolio(context, id, {
            ...contract.updatePortfolioRequestSchema.parse(await body()),
            commandId: commandId(),
          }),
        );
      else if (path[2] === 'versions' && request.method === 'GET')
        value = contract.portfolioVersionListResponseSchema.parse(
          await accounting.portfolioVersions(
            context,
            id,
            contract.portfolioVersionsQuerySchema.parse(query()),
          ),
        );
      else if (path[2] === 'archive' && request.method === 'POST')
        value = contract.portfolioMutationResponseSchema.parse(
          await accounting.archivePortfolio(context, id, {
            ...contract.archivePortfolioRequestSchema.parse(await body()),
            commandId: commandId(),
          }),
        );
      else throw inaccessible();
    } else if (path.length === 1 && path[0] === 'income' && writing)
      value = contract.accountingMutationResponseSchema.parse(
        await accounting.recordIncome(context, {
          ...contract.recordIncomeRequestSchema.parse(await body()),
          commandId: commandId(),
        }),
      );
    else if (path.length === 1 && path[0] === 'taxes' && writing)
      value = contract.accountingMutationResponseSchema.parse(
        await accounting.recordTax(context, {
          ...contract.recordTaxRequestSchema.parse(await body()),
          commandId: commandId(),
        }),
      );
    else if (path.length === 1 && path[0] === 'expenses' && writing)
      value = contract.accountingMutationResponseSchema.parse(
        await accounting.recordExpense(context, {
          ...contract.recordExpenseRequestSchema.parse(await body()),
          commandId: commandId(),
        }),
      );
    else if (path.length === 1 && path[0] === 'transfers') {
      if (request.method === 'GET')
        value = contract.cashTransferListResponseSchema.parse(
          await accounting.cashTransfers(
            context,
            contract.cashTransferListQuerySchema.parse(query()),
          ),
        );
      else
        value = contract.accountingMutationResponseSchema.parse(
          await accounting.createCashTransfer(context, {
            ...contract.createCashTransferRequestSchema.parse(await body()),
            commandId: commandId(),
          }),
        );
    } else if (path.length === 3 && path[0] === 'transfers' && path[2] === 'receipt' && writing)
      value = contract.accountingMutationResponseSchema.parse(
        await accounting.receiveCashTransfer(context, contract.financialIdSchema.parse(path[1]), {
          ...contract.receiveCashTransferRequestSchema.parse(await body()),
          commandId: commandId(),
        }),
      );
    else throw inaccessible();
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
    });
  };
}
