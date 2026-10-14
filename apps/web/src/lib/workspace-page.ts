import { getSafeSession, getWorkspace, getWorkspaces } from '@journal/server';
import { notFound, redirect } from 'next/navigation';
import { serverRequest } from './server-request';
import { safeServerQuery } from './server-query';

/** The same authenticated workspace selection applies to every application surface. */
export async function loadWorkspacePage(selection?: string | string[]) {
  const request = await serverRequest();
  const session = await safeServerQuery('session.read', () => getSafeSession(request));
  if (!session) redirect('/sign-in');
  const workspaces = await safeServerQuery('workspace.list', () => getWorkspaces(request));
  if (Array.isArray(selection)) notFound();
  const selected = selection
    ? workspaces.find((workspace) => workspace.id === selection)
    : (workspaces.find((workspace) => !workspace.isDemo) ?? workspaces[0]);
  if (selection && !selected) notFound();
  const workspace = selected
    ? await safeServerQuery('workspace.read', () => getWorkspace(request, selected.id))
    : null;
  return { workspace, workspaces, displayName: session.user.name.trim() || session.user.email };
}
