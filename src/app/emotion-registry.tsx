'use client';

import createCache, { type EmotionCache } from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { useServerInsertedHTML } from 'next/navigation';
import { useState } from 'react';

/** Emotion SSR registry: flushes emotion styles into <head> during streaming so SSR has no FOUC. */
export function EmotionRegistry({ children }: { children: React.ReactNode }) {
  const [{ cache }] = useState(() => {
    const cache: EmotionCache = createCache({ key: 'tsk', prepend: true });
    cache.compat = true;
    const prevInsert = cache.insert.bind(cache);
    const insertedNames: string[] = [];
    cache.insert = (...args) => {
      const serialized = args[1];
      if (serialized && typeof serialized === 'object' && 'name' in serialized) {
        const name = String((serialized as { name?: unknown }).name || '');
        if (name && !insertedNames.includes(name)) insertedNames.push(name);
      }
      return prevInsert(...args);
    };
    (cache as unknown as { __insertedNames: string[] }).__insertedNames = insertedNames;
    return { cache };
  });

  useServerInsertedHTML(() => {
    const names = (cache as unknown as { __insertedNames?: string[] }).__insertedNames || [];
    const inserted = cache.inserted as Record<string, string | undefined>;
    const css = names.map((n) => inserted[n] || '').join('');
    const attr = `tsk ${names.join(' ')}`;
    names.length = 0;
    if (!css) return null;
    // Standard emotion SSR recipe: flush server-collected <style> into <head> during streaming.
    // biome-ignore lint/security/noDangerouslySetInnerHtml: emotion-generated CSS, no user input
    return <style data-emotion={attr} dangerouslySetInnerHTML={{ __html: css }} />;
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
