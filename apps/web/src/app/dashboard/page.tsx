import { ApplicationShell, WorkspaceAccessNotice } from '@/components/application-shell';
import { DashboardWorkspace } from '@/components/dashboard/dashboard-workspace';
import { loadWorkspacePage } from '@/lib/workspace-page';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const parameters = await searchParams;
  const { workspace, workspaces, displayName } = await loadWorkspacePage(parameters.workspace);

  return (
    <ApplicationShell
      workspace={workspace}
      displayName={displayName}
      active="dashboard"
      className="dashboard-main"
    >
      {workspace ? (
        <DashboardWorkspace key={workspace.id} workspace={workspace} workspaces={workspaces} />
      ) : (
        <WorkspaceAccessNotice title="Dashboard" />
      )}
    </ApplicationShell>
  );
}
