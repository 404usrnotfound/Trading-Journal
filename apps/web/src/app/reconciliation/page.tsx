import { ApplicationShell, WorkspaceAccessNotice } from '@/components/application-shell';
import { ReconciliationWorkspace } from '@/components/reconciliation/reconciliation-workspace';
import { loadWorkspacePage } from '@/lib/workspace-page';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const parameters = await searchParams;
  const { workspace, workspaces, displayName } = await loadWorkspacePage(parameters.workspace);
  return (
    <ApplicationShell workspace={workspace} displayName={displayName} active="reconciliation">
      {workspace ? (
        <ReconciliationWorkspace key={workspace.id} workspace={workspace} workspaces={workspaces} />
      ) : (
        <WorkspaceAccessNotice title="Statement reconciliation" />
      )}
    </ApplicationShell>
  );
}
