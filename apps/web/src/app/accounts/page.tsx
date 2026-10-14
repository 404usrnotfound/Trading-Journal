import { ApplicationShell, WorkspaceAccessNotice } from '@/components/application-shell';
import { AccountWorkspace } from '@/components/accounts/account-workspace';
import { loadWorkspacePage } from '@/lib/workspace-page';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AccountsPage({
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
      active="accounts"
      className="account-main"
    >
      {workspace ? (
        <AccountWorkspace key={workspace.id} workspace={workspace} workspaces={workspaces} />
      ) : (
        <WorkspaceAccessNotice title="Accounts" />
      )}
    </ApplicationShell>
  );
}
