'use client';

import { Button } from '@journal/ui';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';
const storageKey = 'trading-journal-display-theme';
const eventName = 'journal-theme-change';

function readTheme(): Theme {
  const saved = window.localStorage.getItem(storageKey);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function subscribe(listener: () => void) {
  window.addEventListener(eventName, listener);
  window.addEventListener('storage', listener);
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  preference.addEventListener('change', listener);
  return () => {
    window.removeEventListener(eventName, listener);
    window.removeEventListener('storage', listener);
    preference.removeEventListener('change', listener);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function toggle() {
    window.localStorage.setItem(storageKey, theme === 'light' ? 'dark' : 'light');
    window.dispatchEvent(new Event(eventName));
  }

  return (
    <Button
      variant="quiet"
      className="icon-button"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
    >
      {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
    </Button>
  );
}
