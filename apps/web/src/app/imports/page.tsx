import { getSafeSession, getWorkspace, getWorkspaces } from '@journal/server';
import { Badge, Brand } from '@journal/ui';
import { BookOpen, ChevronRight, Layers, LayoutDashboard } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { ImportWorkspace } from '@/components/imports/import-workspace';
import { serverRequest } from '@/lib/server-request';
import { safeServerQuery } from '@/lib/server-query';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const request = await serverRequest();
  const session = await safeServerQuery('session.read', () => getSafeSession(request));
  if (!session) redirect('/sign-in');
  const workspaces = await safeServerQuery('workspace.list', () => getWorkspaces(request));
  const parameters = await searchParams;
  if (Array.isArray(parameters.workspace)) notFound();
  const selected = parameters.workspace
    ? workspaces.find((workspace) => workspace.id === parameters.workspace)
    : (workspaces.find((workspace) => !workspace.isDemo) ?? workspaces[0]);
  if (parameters.workspace && !selected) notFound();
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
          <div>
            <strong>{workspace?.name ?? 'No workspace assigned'}</strong>
            <span>{workspace?.isDemo ? 'Demo workspace' : 'Private workspace'}</span>
          </div>
        </div>
        <nav aria-label="Main navigation" className="main-navigation">
          <a
            className="nav-item"
            href={workspace ? `/strategies?workspace=${workspace.id}` : '/strategies'}
          >
            <Layers size={18} aria-hidden="true" />
            <span>Strategies</span>
          </a>
          <a
            className="nav-item"
            href={workspace ? `/?workspace=${encodeURIComponent(workspace.id)}` : '/'}
          >
            <LayoutDashboard size={18} aria-hidden="true" />
            <span>Overview</span>
          </a>
          <a
            className="nav-item active"
            aria-current="page"
            href={workspace ? `/imports?workspace=${encodeURIComponent(workspace.id)}` : '/imports'}
          >
            <Layers size={18} aria-hidden="true" />
            <span>Imports</span>
          </a>
          <a
            className="nav-item"
            href={workspace ? `/journal?workspace=${encodeURIComponent(workspace.id)}` : '/journal'}
          >
            <BookOpen size={18} aria-hidden="true" />
            <span>Trade journal</span>
          </a>
          <a
            className="nav-item"
            href={
              workspace ? `/dashboard?workspace=${encodeURIComponent(workspace.id)}` : '/dashboard'
            }
          >
            <span>Dashboard</span>
          </a>
        </nav>
        <div className="sidebar-bottom">
          <Badge>Imports & reconciliation</Badge>
          <p>
            Review your sources.
            <br />
            Post only reviewed activity.
          </p>
        </div>
      </aside>
      <div className="workspace-layout">
        <header className="workspace-header">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={15} aria-hidden="true" />
            <strong>Imports</strong>
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
        <main id="main-content" className="overview-main import-main" tabIndex={-1}>
          {workspace ? (
            <ImportWorkspace key={workspace.id} workspace={workspace} workspaces={workspaces} />
          ) : (
            <div className="page-heading">
              <div>
                <h1>Imports & reconciliation</h1>
                <p>
                  No workspace has been assigned. Contact your workspace administrator to request
                  access.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
