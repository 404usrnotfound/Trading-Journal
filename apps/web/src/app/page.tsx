import { getSafeSession, getWorkspace, getWorkspaces } from '@journal/server';
import { Badge, Brand, Button, Panel } from '@journal/ui';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  FolderClosed,
  LayoutDashboard,
  Layers,
  LockKeyhole,
  Settings2,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { WorkspaceSwitcher } from '@/components/workspace-switcher';
import { WorkspacePreferences } from '@/components/workspace-preferences';
import { serverRequest } from '@/lib/server-request';
import { safeServerQuery } from '@/lib/server-query';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const upcomingNavigation = [
  { label: 'Trades', icon: Activity },
  { label: 'Portfolio & accounts', icon: Wallet },
  { label: 'Settings', icon: Settings2 },
];

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const request = await serverRequest();
  const session = await safeServerQuery('session.read', () => getSafeSession(request));
  if (!session) redirect('/sign-in');
  const workspaces = await safeServerQuery('workspace.list', () => getWorkspaces(request));
  const selection = (await searchParams).workspace;
  if (Array.isArray(selection)) notFound();
  const selected = selection
    ? workspaces.find((workspace) => workspace.id === selection)
    : (workspaces.find((workspace) => !workspace.isDemo) ?? workspaces[0]);
  if (selection && !selected) notFound();
  const workspace = selected
    ? await safeServerQuery('workspace.read', () => getWorkspace(request, selected.id))
    : null;
  const displayName = session.user.name.trim() || session.user.email;

  return (
    <div className="app-layout">
      <aside className="sidebar" aria-label="Application sidebar">
        <div className="sidebar-brand">
          <Brand />
        </div>
        <div className="sidebar-workspace">
          <span className="workspace-symbol" aria-hidden="true">
            <FolderClosed size={18} />
          </span>
          <div>
            <strong>{workspace?.name ?? 'No workspace assigned'}</strong>
            <span>{workspace?.isDemo ? 'Demo workspace' : 'Private workspace'}</span>
          </div>
        </div>
        <nav aria-label="Main navigation" className="main-navigation">
          <a
            className="nav-item"
            href={
              workspace ? `/dashboard?workspace=${encodeURIComponent(workspace.id)}` : '/dashboard'
            }
          >
            <LayoutDashboard size={18} aria-hidden="true" />
            <span>Dashboard</span>
          </a>
          <a
            href={workspace ? `/?workspace=${encodeURIComponent(workspace.id)}` : '/'}
            className="nav-item active"
            aria-current="page"
          >
            <LayoutDashboard size={18} aria-hidden="true" />
            <span>Overview</span>
          </a>
          {workspace && (
            <a
              href={`/strategies?workspace=${encodeURIComponent(workspace.id)}`}
              className="nav-item"
            >
              <Layers size={18} aria-hidden="true" />
              <span>Strategies</span>
            </a>
          )}
          {workspace && (
            <a href={`/journal?workspace=${encodeURIComponent(workspace.id)}`} className="nav-item">
              <BookOpen size={18} aria-hidden="true" />
              <span>Trade journal</span>
            </a>
          )}
          {upcomingNavigation.map(({ label, icon: Icon }) => (
            <button key={label} className="nav-item" disabled aria-describedby="navigation-note">
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
              <span className="nav-later">Later</span>
            </button>
          ))}
          <a
            className="nav-item"
            href={workspace ? `/imports?workspace=${encodeURIComponent(workspace.id)}` : '/imports'}
          >
            <span>Imports</span>
          </a>
        </nav>
        <p id="navigation-note" className="navigation-note">
          Use Strategies for your playbook and Trade journal for planning and review.
        </p>
        <div className="sidebar-bottom">
          <Badge>Foundation release</Badge>
          <p>
            A secure starting point.
            <br />
            Trading workflows come next.
          </p>
        </div>
      </aside>
      <div className="workspace-layout">
        <header className="workspace-header">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={15} aria-hidden="true" />
            <strong>Overview</strong>
          </div>
          <div className="header-actions">
            <ThemeToggle />
            <span className="header-divider" />
            <span className="user-avatar" aria-hidden="true">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="user-name">{displayName}</span>
            <SignOutButton />
          </div>
        </header>
        <main id="main-content" className="overview-main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR JOURNAL</div>
              <h1>Overview</h1>
              <a
                className="button button-secondary"
                href={workspace ? `/dashboard?workspace=${workspace.id}` : '/dashboard'}
              >
                Open analytics dashboard
              </a>
              <a
                className="button button-secondary"
                href={workspace ? `/imports?workspace=${workspace.id}` : '/imports'}
              >
                Import broker activity
              </a>
              <p>A clean starting point for your trading practice.</p>
            </div>
            <Badge variant="success">
              <span className="status-dot" /> Signed in
            </Badge>
          </div>
          {workspace?.isDemo && (
            <p className="demo-notice" role="note">
              This is a clearly labeled demo workspace, separate from real workspace data.
            </p>
          )}
          {workspaces.length > 1 && workspace && (
            <WorkspaceSwitcher workspaces={workspaces} selected={workspace.id} />
          )}
          <div className="overview-grid">
            <Panel className="journal-empty">
              <div className="empty-art" aria-hidden="true">
                <div className="empty-art-line" />
                <BookOpen size={40} strokeWidth={1.25} />
                <div className="empty-art-line" />
              </div>
              <Badge>{workspace ? 'Workspace ready' : 'Workspace access needed'}</Badge>
              <h2>{workspace ? 'Your journal starts here.' : 'You’re signed in.'}</h2>
              <p>
                {workspace
                  ? 'Plan a trade, review its ledger actuals and record the decisions and lessons in your private journal.'
                  : 'No workspace has been assigned to your account. Contact your workspace administrator to request access.'}
              </p>
              {workspace ? (
                <a
                  className="button button-primary"
                  href={`/journal?workspace=${encodeURIComponent(workspace.id)}`}
                >
                  <BookOpen size={17} aria-hidden="true" /> Open trade journal
                </a>
              ) : (
                <Button disabled>Workspace access needed</Button>
              )}
              <span id="recording-note" className="empty-note">
                {workspace
                  ? 'Financial facts and manual observations stay distinct.'
                  : 'Your administrator can assign workspace access.'}
              </span>
            </Panel>
            <Panel className="foundation-panel">
              <div className="panel-heading">
                <ShieldCheck size={20} aria-hidden="true" />
                <h2>Your foundation</h2>
              </div>
              <p className="muted foundation-description">
                The essentials for a private, persistent workspace.
              </p>
              <ul className="foundation-list">
                <li>
                  <span className="foundation-check">
                    <Check size={15} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>Account access</strong>
                    <span>You’re securely signed in.</span>
                  </div>
                </li>
                <li>
                  <span className={workspace ? 'foundation-check' : 'foundation-pending'}>
                    {workspace ? (
                      <Check size={15} aria-hidden="true" />
                    ) : (
                      <LockKeyhole size={15} aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <strong>Workspace membership</strong>
                    <span>
                      {workspace
                        ? `${workspace.role[0]?.toUpperCase()}${workspace.role.slice(1)} access · ${workspace.name}`
                        : 'Awaiting workspace assignment'}
                    </span>
                  </div>
                </li>
                <li>
                  <span className="foundation-pending">
                    <Activity size={15} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>Trading workflows</strong>
                    <span>Not available in this release</span>
                  </div>
                </li>
              </ul>
              <div className="foundation-note">
                <LockKeyhole size={17} aria-hidden="true" />
                <p>No broker connection is needed for your workspace.</p>
              </div>
            </Panel>
          </div>
          {workspace && <WorkspacePreferences workspace={workspace} />}
          <Panel className="next-steps-panel">
            <div className="next-steps-icon" aria-hidden="true">
              <Layers size={22} />
            </div>
            <div>
              <h2>Built in thoughtful steps</h2>
              <p>
                Your financial foundation and versioned strategy playbook are ready. Recording
                screens, reviews and analytics will follow in later releases.
              </p>
            </div>
            <ArrowRight size={20} className="next-steps-arrow" aria-hidden="true" />
          </Panel>
          <footer className="workspace-footer">
            <span>Trading Journal · Platform foundation</span>
            <span>Versioned strategies and the core financial API are available.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
