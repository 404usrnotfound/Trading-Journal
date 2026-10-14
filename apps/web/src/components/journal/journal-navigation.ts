import { useEffect } from 'react';
import { WORKSPACE_NAVIGATION_REQUEST } from '../ux/navigation-request';

/** Preserve an unsaved journal across ordinary page links as well as reloads. */
export function useJournalNavigationGuard(hasUnsavedChanges: () => boolean, onBlocked: () => void) {
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) event.preventDefault();
    };
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      )
        return;
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.hasAttribute('download') || anchor.target === '_blank') return;
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search &&
        destination.hash
      )
        return;
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.stopPropagation();
      onBlocked();
    };
    const programmatic = (event: Event) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      onBlocked();
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', navigate, true);
    window.addEventListener(WORKSPACE_NAVIGATION_REQUEST, programmatic);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', navigate, true);
      window.removeEventListener(WORKSPACE_NAVIGATION_REQUEST, programmatic);
    };
  }, [hasUnsavedChanges, onBlocked]);
}
