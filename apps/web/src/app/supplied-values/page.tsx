import { ApplicationShell, WorkspaceAccessNotice } from '@/components/application-shell';
import { SuppliedValuesWorkspace } from '@/components/supplied/supplied-values-workspace';
import { loadWorkspacePage } from '@/lib/workspace-page';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function SuppliedValuesPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const parameters = await searchParams;
  const { workspace, workspaces, displayName } = await loadWorkspacePage(parameters.workspace);
  return (
    <ApplicationShell workspace={workspace} displayName={displayName} active="supplied-values">
      {workspace ? (
        <SuppliedValuesWorkspace key={workspace.id} workspace={workspace} workspaces={workspaces} />
      ) : (
        <WorkspaceAccessNotice title="Supplied component values" />
      )}
    </ApplicationShell>
  );
}
