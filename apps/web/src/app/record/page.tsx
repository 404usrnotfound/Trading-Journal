import { ApplicationShell, WorkspaceAccessNotice } from '@/components/application-shell';
import { ManualRecordWorkspace } from '@/components/record/manual-record-workspace';
import { loadWorkspacePage } from '@/lib/workspace-page';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function RecordPage({
  searchParams,
}: {
  searchParams: Promise<{
    workspace?: string | string[];
    trade?: string | string[];
    mode?: string | string[];
  }>;
}) {
  const parameters = await searchParams;
  const { workspace, workspaces, displayName } = await loadWorkspacePage(parameters.workspace);
  if (Array.isArray(parameters.trade)) notFound();
  if (
    Array.isArray(parameters.mode) ||
    (parameters.mode && !['record', 'existing'].includes(parameters.mode))
  )
    notFound();
  return (
    <ApplicationShell
      workspace={workspace}
      displayName={displayName}
      active="record"
      className="record-main"
    >
      {workspace ? (
        <ManualRecordWorkspace
          key={workspace.id}
          workspace={workspace}
          workspaces={workspaces}
          initialTradeId={parameters.trade ?? null}
          initialMode={parameters.mode === 'existing' ? 'existing' : 'record'}
        />
      ) : (
        <WorkspaceAccessNotice title="Record trade" />
      )}
    </ApplicationShell>
  );
}
