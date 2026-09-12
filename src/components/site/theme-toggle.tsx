'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Mode = 'light' | 'dark' | 'auto';
const KEY = 'tsk_color_mode';

function readStoredMode(): Mode {
  try {
    const value = window.localStorage.getItem(KEY);
    if (value === 'light' || value === 'dark' || value === 'auto') return value;
  } catch {
    // Private browsing / blocked storage: follow the system theme.
  }
  return 'auto';
}

function systemDark() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

function apply(mode: Mode) {
  const dark = mode === 'dark' || (mode === 'auto' && systemDark());
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  return dark;
}

function persist(mode: Mode) {
  try { window.localStorage.setItem(KEY, mode); } catch {
    // Theme still works for this tab when storage is unavailable.
  }
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('auto');
  const [dark, setDark] = useState(false);

  // Hydrate from the value applied by the inline pre-paint script in layout.tsx.
  useEffect(() => {
    const stored = readStoredMode();
    setMode(stored);
    setDark(apply(stored));
  }, []);

  // Follow operating-system changes only while the current mode is still auto.
  // This intentionally depends on `mode`; the previous port captured the mode
  // from mount and could switch a user back after they had explicitly picked a
  // theme if the OS schedule changed later in the same tab.
  useEffect(() => {
    if (mode !== 'auto') return;
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => setDark(apply('auto'));
    query?.addEventListener?.('change', onChange);
    return () => query?.removeEventListener?.('change', onChange);
  }, [mode]);

  // Keep multiple tabs in sync. `storage` fires in the *other* tab, not the one
  // that made the change, so there is no loop here.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== KEY) return;
      const next: Mode = event.newValue === 'light' || event.newValue === 'dark' || event.newValue === 'auto' ? event.newValue : 'auto';
      setMode(next);
      setDark(apply(next));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function toggle() {
    const next: Mode = dark ? 'light' : 'dark';
    setMode(next);
    persist(next);
    setDark(apply(next));
  }

  const label = dark ? 'เปลี่ยนเป็นโหมดกลางวัน' : 'เปลี่ยนเป็นโหมดกลางคืน';
  return <button type="button" className="tsk-theme-toggle" aria-label={label} title={label} aria-pressed={dark} onClick={toggle}>{dark ? <Sun aria-hidden="true"/> : <Moon aria-hidden="true"/>}<span className="sr-only">{mode}</span></button>;
}
