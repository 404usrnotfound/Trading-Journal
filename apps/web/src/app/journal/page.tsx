import { ApplicationShell, WorkspaceAccessNotice } from '@/components/application-shell';
import { JournalWorkspace } from '@/components/journal/journal-workspace';
import { loadWorkspacePage } from '@/lib/workspace-page';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{
    workspace?: string | string[];
    trade?: string | string[];
    period?: string | string[];
    from?: string | string[];
    to?: string | string[];
    accountId?: string | string[];
    search?: string | string[];
    status?: string | string[];
    includeArchived?: string | string[];
    [key: string]: string | string[] | undefined;
  }>;
}) {
  const parameters = await searchParams;
  const { workspace, workspaces, displayName } = await loadWorkspacePage(parameters.workspace);
  if (Array.isArray(parameters.trade)) notFound();
  if (Array.isArray(parameters.period)) notFound();
  if (Array.isArray(parameters.from)) notFound();
  if (Array.isArray(parameters.to)) notFound();
  if (Array.isArray(parameters.accountId)) notFound();
  if (Array.isArray(parameters.search)) notFound();
  if (Array.isArray(parameters.status)) notFound();
  if (Array.isArray(parameters.includeArchived)) notFound();
  return (
    <ApplicationShell
      workspace={workspace}
      displayName={displayName}
      active="journal"
      className="journal-main"
    >
      {workspace ? (
        <JournalWorkspace
          key={workspace.id}
          workspace={workspace}
          workspaces={workspaces}
          initialTradeId={parameters.trade ?? null}
          initialFilters={Object.fromEntries(
            ['period', 'from', 'to', 'accountId', 'search', 'status', 'includeArchived'].flatMap(
              (key) => (typeof parameters[key] === 'string' ? [[key, parameters[key]]] : []),
            ),
          )}
        />
      ) : (
        <WorkspaceAccessNotice title="Trade journal" />
      )}
    </ApplicationShell>
  );
}
