'use client';

const AGENT_REF_KEY = 'tsk_agent_ref';

export function normalizeAgentRef(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .slice(0, 60);
}

export function readAgentRef() {
  if (typeof window === 'undefined') return '';
  try {
    return normalizeAgentRef(window.localStorage.getItem(AGENT_REF_KEY));
  } catch {
    return '';
  }
}

export function rememberAgentRef(value: unknown) {
  if (typeof window === 'undefined') return;
  const code = normalizeAgentRef(value);
  if (!code) return;
  try {
    window.localStorage.setItem(AGENT_REF_KEY, code);
  } catch {
    /* Private mode/storage policy: the HttpOnly attribution cookie remains authoritative. */
  }
}
