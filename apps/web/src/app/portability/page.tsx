import { ApplicationShell, WorkspaceAccessNotice } from '@/components/application-shell';
import { PortabilityWorkspace } from '@/components/portability/portability-workspace';
import { loadWorkspacePage } from '@/lib/workspace-page';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export default async function PortabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const parameters = await searchParams;
  const { workspace, displayName } = await loadWorkspacePage(parameters.workspace);
  return (
    <ApplicationShell workspace={workspace} displayName={displayName} active="portability">
      {workspace ? (
        <PortabilityWorkspace key={workspace.id} workspace={workspace} />
      ) : (
        <WorkspaceAccessNotice title="Data portability" />
      )}
    </ApplicationShell>
  );
}
