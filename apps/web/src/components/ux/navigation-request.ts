'use client';

export const WORKSPACE_NAVIGATION_REQUEST = 'journal:navigation-request';

export type WorkspaceNavigationRequestDetail = {
  destination: string;
  continue: (() => void) | undefined;
  /** A draft guard owns the continuation confirmation UI. */
  handled: boolean;
};

/** Programmatic navigation (such as sign-out) participates in active draft guards. */
export function requestWorkspaceNavigation(
  destination: string,
  continuation?: () => void,
  onBlocked?: () => void,
): boolean {
  const detail: WorkspaceNavigationRequestDetail = {
    destination,
    continue: continuation,
    handled: false,
  };
  const allowed = window.dispatchEvent(
    new CustomEvent<WorkspaceNavigationRequestDetail>(WORKSPACE_NAVIGATION_REQUEST, {
      cancelable: true,
      detail,
    }),
  );
  if (!allowed && !detail.handled) onBlocked?.();
  return allowed;
}
