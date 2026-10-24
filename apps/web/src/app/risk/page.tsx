import { ApplicationShell, WorkspaceAccessNotice } from '@/components/application-shell';
import { RiskWorkspace } from '@/components/risk/risk-workspace';
import { loadWorkspacePage } from '@/lib/workspace-page';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export default async function RiskPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const parameters = await searchParams;
  const { workspace, displayName } = await loadWorkspacePage(parameters.workspace);
  return (
    <ApplicationShell workspace={workspace} displayName={displayName} active="risk">
      {workspace ? (
        <RiskWorkspace key={workspace.id} workspace={workspace} />
      ) : (
        <WorkspaceAccessNotice title="Risk policies & sizing" />
      )}
    </ApplicationShell>
  );
}
