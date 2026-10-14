import { ApplicationShell, WorkspaceAccessNotice } from '@/components/application-shell';
import { ImportWorkspace } from '@/components/imports/import-workspace';
import { loadWorkspacePage } from '@/lib/workspace-page';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ImportsPage({
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
      active="imports"
      className="import-main"
    >
      {workspace ? (
        <ImportWorkspace key={workspace.id} workspace={workspace} workspaces={workspaces} />
      ) : (
        <WorkspaceAccessNotice title="Imports" />
      )}
    </ApplicationShell>
  );
}
