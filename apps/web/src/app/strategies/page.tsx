import { ApplicationShell, WorkspaceAccessNotice } from '@/components/application-shell';
import { StrategyWorkspace } from '@/components/strategies/strategy-workspace';
import { loadWorkspacePage } from '@/lib/workspace-page';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function StrategiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    workspace?: string | string[];
    strategy?: string | string[];
    version?: string | string[];
    trade?: string | string[];
  }>;
}) {
  const parameters = await searchParams;
  const { workspace, workspaces, displayName } = await loadWorkspacePage(parameters.workspace);
  if (Array.isArray(parameters.strategy)) notFound();
  if (Array.isArray(parameters.version)) notFound();
  if (Array.isArray(parameters.trade)) notFound();
  return (
    <ApplicationShell
      workspace={workspace}
      displayName={displayName}
      active="strategies"
      className="strategies-main"
    >
      {workspace ? (
        <StrategyWorkspace
          key={workspace.id}
          workspace={workspace}
          workspaces={workspaces}
          initialStrategyId={parameters.strategy ?? null}
          initialVersionId={parameters.version ?? null}
          initialTradeId={parameters.trade ?? null}
        />
      ) : (
        <WorkspaceAccessNotice title="Strategies" />
      )}
    </ApplicationShell>
  );
}
