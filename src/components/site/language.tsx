'use client';

import { Globe } from 'lucide-react';
import { useEffect, useState } from 'react';

export type Lang = 'th' | 'en';
const STORAGE_KEY = 'tsk-lang';
const CHANGE_EVENT = 'tsk-lang-change';

function readLang(): Lang {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'th';
  } catch {
    return 'th';
  }
}

function writeLang(lang: Lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: lang }));
}

/** TH | EN, for the dark top bar or a light menu. */
export function LanguageSwitcher({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const [lang, setLang] = useState<Lang>('th');

  useEffect(() => {
    setLang(readLang());
    const onChange = (event: Event) => setLang(((event as CustomEvent).detail as Lang) || readLang());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  const choose = (next: Lang) => {
    if (next === lang) return;
    setLang(next);
    writeLang(next);
  };

  const base = 'rounded-md px-1.5 py-0.5 text-[11px] font-black transition';
  const active = tone === 'dark' ? 'bg-white text-emerald-950' : 'bg-emerald-900 text-white';
  const idle = tone === 'dark' ? 'text-white/75 hover:text-white' : 'text-slate-600 hover:text-emerald-900';

  return (
    <span className="inline-flex items-center gap-1" data-no-translate>
      <Globe
        size={13}
        strokeWidth={2.2}
        aria-hidden="true"
        className={tone === 'dark' ? 'text-white' : 'text-emerald-900'}
      />
      <fieldset className="m-0 inline-flex items-center gap-0.5 border-0 p-0">
        <legend className="sr-only">Language / ภาษา</legend>
        <button
          type="button"
          className={`${base} ${lang === 'th' ? active : idle}`}
          aria-pressed={lang === 'th'}
          onClick={() => choose('th')}
        >
          TH
        </button>
        <button
          type="button"
          className={`${base} ${lang === 'en' ? active : idle}`}
          aria-pressed={lang === 'en'}
          onClick={() => choose('en')}
        >
          EN
        </button>
      </fieldset>
    </span>
  );
}

const THAI = /[฀-๿]/;
const LEADING = /^[^฀-๿A-Za-z]+/;
const TRAILING = /[^฀-๿A-Za-z]+$/;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'SVG']);
const ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt'] as const;

/**
 * The storefront in English, applied in the browser.
 *
 * Pages are cached at the edge in Thai for every visitor (no per-language HTML,
 * so nothing extra renders on the Worker). When a visitor picks EN, this swaps
 * the shop's own words using the dictionary: whole text first, then the text
 * without leading/trailing symbols and numbers ("♡ รายการโปรด (3)"), never a
 * word inside a longer sentence, so product names are left as the shop typed
 * them. New content (client navigation, opened menus) is translated as it
 * appears. Switching back to TH reloads the page to restore every original.
 */
export function PageTranslator() {
  useEffect(() => {
    let dictionary: Record<string, string> | null = null;
    let observer: MutationObserver | null = null;
    let frame = 0;
    const applied = new WeakMap<Node, string>();
    const pending = new Set<Node>();

    const lookup = (raw: string): string | null => {
      if (!dictionary || !THAI.test(raw)) return null;
      const lead = raw.match(/^\s*/)?.[0] || '';
      const trail = raw.match(/\s*$/)?.[0] || '';
      const text = raw.replace(/\s+/g, ' ').trim();
      const exact = dictionary[text];
      if (exact) return `${lead}${exact}${trail}`;
      const prefix = text.match(LEADING)?.[0] || '';
      const suffix = text.slice(prefix.length).match(TRAILING)?.[0] || '';
      const attempts: Array<[string, string, string]> = [
        [prefix, text.slice(prefix.length, text.length - suffix.length).trim(), suffix],
        [prefix, text.slice(prefix.length).trim(), ''],
        ['', text.slice(0, text.length - suffix.length).trim(), suffix],
      ];
      for (const [before, core, after] of attempts) {
        const hit = core && dictionary[core];
        if (hit) return `${lead}${before}${hit}${after}${trail}`;
      }
      return null;
    };

    const skipped = (element: Element | null) => {
      for (let node = element; node; node = node.parentElement) {
        if (SKIP_TAGS.has(node.tagName.toUpperCase())) return true;
        if (node.hasAttribute('data-no-translate') || (node as HTMLElement).isContentEditable) return true;
      }
      return false;
    };

    const translateText = (node: Text) => {
      const value = node.nodeValue || '';
      if (applied.get(node) === value || skipped(node.parentElement)) return;
      const next = lookup(value);
      if (next && next !== value) {
        applied.set(node, next);
        node.nodeValue = next;
      }
    };

    const translateElement = (element: Element) => {
      if (skipped(element)) return;
      for (const name of ATTRIBUTES) {
        const value = element.getAttribute(name);
        if (!value) continue;
        const next = lookup(value);
        if (next && next !== value) element.setAttribute(name, next);
      }
    };

    const translateTree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) return translateText(root as Text);
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      translateElement(root as Element);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) translateText(node as Text);
        else translateElement(node as Element);
      }
    };

    const translateTitle = () => {
      const next = lookup(document.title);
      if (next) document.title = next;
    };

    const flush = () => {
      frame = 0;
      for (const node of pending) if (node.isConnected) translateTree(node);
      pending.clear();
      translateTitle();
    };

    const start = async () => {
      if (!dictionary) dictionary = (await import('@/lib/i18n/en')).EN;
      document.documentElement.lang = 'en';
      translateTree(document.body);
      translateTitle();
      observer?.disconnect();
      observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'childList') record.addedNodes.forEach((node) => pending.add(node));
          else pending.add(record.target);
        }
        if (!frame) frame = window.requestAnimationFrame(flush);
      });
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [...ATTRIBUTES],
      });
    };

    const onChange = (event: Event) => {
      const lang = ((event as CustomEvent).detail as Lang) || readLang();
      if (lang === 'en') void start();
      else window.location.reload();
    };

    if (readLang() === 'en') void start();
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
