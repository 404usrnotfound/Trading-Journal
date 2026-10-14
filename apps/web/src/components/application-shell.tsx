import type { ReactNode } from 'react';
import type { WorkspaceResponse } from '@journal/contracts';
import { Brand } from '@journal/ui';
import {
  BookOpen,
  ChevronRight,
  FileInput,
  Layers,
  LayoutDashboard,
  PenLine,
  Wallet,
} from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { SignOutButton } from './sign-out-button';

const destinations = [
  { id: 'overview', path: '/', label: 'Overview', icon: LayoutDashboard },
  { id: 'record', path: '/record', label: 'Record trade', icon: PenLine },
  { id: 'journal', path: '/journal', label: 'Trade journal', icon: BookOpen },
  { id: 'imports', path: '/imports', label: 'Imports', icon: FileInput },
  { id: 'strategies', path: '/strategies', label: 'Strategies', icon: Layers },
  { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'accounts', path: '/accounts', label: 'Accounts', icon: Wallet },
] as const;
export type ApplicationDestination = (typeof destinations)[number]['id'];

export function workspaceHref(path: string, workspaceId?: string | null): string {
  return workspaceId ? `${path}?workspace=${encodeURIComponent(workspaceId)}` : path;
}

export function ApplicationShell({
  children,
  workspace,
  displayName,
  active,
  className = '',
}: {
  children: ReactNode;
  workspace: WorkspaceResponse | null;
  displayName: string;
  active: ApplicationDestination;
  className?: string;
}) {
  const title = destinations.find((item) => item.id === active)!.label;
  const navigation = destinations.map(({ id, path, label, icon: Icon }) => (
    <a
      key={id}
      className={`nav-item${id === active ? ' active' : ''}`}
      href={workspaceHref(path, workspace?.id)}
      aria-current={id === active ? 'page' : undefined}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
    </a>
  ));
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
          {navigation}
        </nav>
        <div className="sidebar-bottom">
          <p>
            Record carefully.
            <br />
            Review consistently.
          </p>
        </div>
      </aside>
      <div className="workspace-layout">
        <header className="workspace-header">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={15} aria-hidden="true" />
            <strong>{title}</strong>
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
        <main id="main-content" className={`overview-main ${className}`} tabIndex={-1}>
          <nav
            aria-label="Mobile page navigation"
            className="journal-mobile-nav app-mobile-navigation"
          >
            {navigation}
          </nav>
          {workspace?.isDemo && (
            <p className="demo-notice" role="note">
              Demo workspace · Activity here is separate from real accounts.
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

export function WorkspaceAccessNotice({ title }: { title: string }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>
          No workspace has been assigned. Contact your workspace administrator to request access.
        </p>
      </div>
    </div>
  );
}
