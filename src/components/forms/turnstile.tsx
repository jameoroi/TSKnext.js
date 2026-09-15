'use client';
import Script from 'next/script';
import { useEffect, useId, useRef } from 'react';
import { publicEnv } from '@/lib/public-env';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove?: (id: string) => void;
    };
  }
}
export function Turnstile({ onToken, action }: { onToken: (token: string) => void; action: string }) {
  const sitekey = publicEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY') || undefined;
  const id = useId().replaceAll(':', '');
  const rendered = useRef('');
  function render() {
    if (!sitekey || !window.turnstile || rendered.current) return;
    const el = document.getElementById(id);
    if (el)
      rendered.current = window.turnstile.render(el, {
        sitekey,
        action,
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
      });
  }
  useEffect(() => {
    render();
    return () => {
      if (rendered.current) window.turnstile?.remove?.(rendered.current);
    };
  }, []);
  if (!sitekey) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={render}
      />
      <div id={id} />
    </>
  );
}
