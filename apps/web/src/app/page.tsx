import { Badge, Panel } from '@journal/ui';
import { ArrowRight, BookOpen, FileInput, Layers, PenLine, Wallet } from 'lucide-react';
import {
  ApplicationShell,
  workspaceHref,
  WorkspaceAccessNotice,
} from '@/components/application-shell';
import { WorkspacePreferences } from '@/components/workspace-preferences';
import { WorkspaceSwitcher } from '@/components/workspace-switcher';
import { loadWorkspacePage } from '@/lib/workspace-page';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const { workspace, workspaces, displayName } = await loadWorkspacePage(
    (await searchParams).workspace,
  );
  const href = (path: string) => workspaceHref(path, workspace?.id);
  return (
    <ApplicationShell workspace={workspace} displayName={displayName} active="overview">
      {workspace ? (
        <>
          <div className="page-heading">
            <div>
              <span className="journal-eyebrow">YOUR TRADING WORKSPACE</span>
              <h1>Overview</h1>
              <p>Record activity, review decisions and follow your account.</p>
            </div>
            <Badge variant="success">Signed in</Badge>
          </div>
          {workspaces.length > 1 && (
            <WorkspaceSwitcher workspaces={workspaces} selected={workspace.id} />
          )}
          <Panel className="ux-welcome">
            <div>
              <h2>Your journal starts here.</h2>
              <p>
                Choose the next step in your trading routine. Recorded fills, journal observations
                and calculated results remain distinct.
              </p>
            </div>
            <a className="button button-primary" href={href('/record')}>
              <PenLine size={17} aria-hidden="true" />
              Record manual trade
            </a>
            <a className="button button-secondary" href={href('/imports')}>
              <FileInput size={17} aria-hidden="true" />
              Import broker activity
            </a>
          </Panel>
          <section aria-labelledby="routine-heading" className="ux-routine">
            <h2 id="routine-heading">Your review routine</h2>
            <div className="ux-workflow-grid">
              <Panel className="ux-workflow-card">
                <BookOpen aria-hidden="true" size={21} />
                <h3>Review your trades</h3>
                <p>Today's activity, historical trades and saved reviews in one journal.</p>
                <div className="workflow-actions">
                  <a className="button button-secondary" href={`${href('/journal')}&period=today`}>
                    Today's trades
                  </a>
                  <a className="ux-text-link" href={href('/journal')}>
                    Open trade journal <ArrowRight size={15} aria-hidden="true" />
                  </a>
                </div>
              </Panel>
              <Panel className="ux-workflow-card">
                <BookOpen aria-hidden="true" size={21} />
                <h3>Weekly trading review</h3>
                <p>
                  Review the week's decisions, mistakes and lessons. Save observations with each
                  trade.
                </p>
                <a className="button button-secondary" href={`${href('/journal')}&period=week`}>
                  Review this week
                </a>
              </Panel>
              <Panel className="ux-workflow-card">
                <Layers aria-hidden="true" size={21} />
                <h3>Strategy playbook</h3>
                <p>Write rules, keep immutable versions and compare the version actually used.</p>
                <a className="button button-secondary" href={href('/strategies')}>
                  Manage strategies
                </a>
              </Panel>
              <Panel className="ux-workflow-card">
                <Wallet aria-hidden="true" size={21} />
                <h3>Account performance</h3>
                <p>Separate trading results, funding, income, costs and currency effects.</p>
                <div className="workflow-actions">
                  <a className="button button-secondary" href={href('/accounts')}>
                    Review accounts
                  </a>
                  <a className="ux-text-link" href={href('/dashboard')}>
                    Open analytics dashboard <ArrowRight size={15} aria-hidden="true" />
                  </a>
                </div>
              </Panel>
            </div>
          </section>
          <WorkspacePreferences workspace={workspace} />
          <footer className="workspace-footer">
            <span>Trading Journal · Private workspace</span>
            <span>No broker connection is required.</span>
          </footer>
        </>
      ) : (
        <WorkspaceAccessNotice title="Overview" />
      )}
    </ApplicationShell>
  );
}
