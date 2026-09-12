/**
 * Cloudflare Turnstile, checked on the server where it counts.
 *
 * The shop already rate limits every public form — registration, contact,
 * partner applications — but a rate limit is keyed to one address. It stops a
 * script running from a bedroom and does nothing about a hundred addresses
 * each submitting under the ceiling. Turnstile is the other half: proof the
 * submission came from a browser a person was sitting at.
 *
 * The widget in the page proves nothing on its own. It hands the browser a
 * token, the browser sends it with the form, and only this file's call to
 * siteverify decides whether it was real. Never trust the token's presence,
 * only this answer.
 */

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Ten seconds, and no retry.
 *
 * The worker has its own wall clock and a shopper is waiting on a form they
 * pressed. If Cloudflare's own endpoint is unreachable for ten seconds, a
 * second attempt is not going to find it, and the shopper would pay twice for
 * the discovery.
 */
const TIMEOUT_MS = 10_000;

/** A token is a bounded string; anything else is not worth a round trip. */
const MAX_TOKEN = 2048;

export function turnstileConfigured() {
  return Boolean(String(process.env.TURNSTILE_SECRET || '').trim());
}

/**
 * The hostnames a token is allowed to have been solved on.
 *
 * siteverify reports the page the widget ran on, and checking it is what stops
 * a token minted on someone else's copy of the sitekey being replayed here.
 * Production must never list localhost: a widget registered for both means an
 * attacker who can serve the sitekey from a local page could otherwise mint
 * tokens this deployment would accept.
 */
function expectedHostnames() {
  return new Set(
    String(process.env.TURNSTILE_HOSTNAMES || '')
      .split(',')
      .map((hostname) => hostname.trim())
      .filter(Boolean),
  );
}

/**
 * Whether this submission may proceed.
 *
 * Returns `{ ok: true }` when the token checks out, and when Turnstile is not
 * configured at all — the shop has run without it and must keep working the
 * moment this ships, before anyone has been to the dashboard. That is a
 * deliberate fail-open on *absence* and the only one: once a secret is set,
 * every other failure path below fails closed, including a siteverify that
 * times out or answers with something that is not JSON.
 *
 * `action` must match the widget's `data-action` for the form being submitted,
 * so a token minted by the newsletter box cannot be spent on a registration.
 */
export async function verifyTurnstile(token, action, remoteip) {
  if (!turnstileConfigured()) return { ok: true, skipped: true };

  const response = String(token || '');
  if (!response || response.length > MAX_TOKEN) return { ok: false, error: 'turnstile_missing' };

  const hostnames = expectedHostnames();
  // A secret with no hostname list would accept a token solved anywhere. That
  // is a misconfiguration, not a reason to let the submission through.
  if (!hostnames.size) return { ok: false, error: 'turnstile_misconfigured' };

  let result;
  try {
    const body = new URLSearchParams({ secret: String(process.env.TURNSTILE_SECRET), response });
    if (remoteip) body.set('remoteip', String(remoteip));
    const reply = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body,
    });
    if (!reply.ok) throw new Error(`siteverify ${reply.status}`);
    result = await reply.json();
  } catch (error) {
    console.warn('turnstile siteverify failed', error?.message || error);
    return { ok: false, error: 'turnstile_unavailable' };
  }

  if (!result?.success) {
    console.warn('turnstile rejected', JSON.stringify({ codes: result?.['error-codes'] || [] }));
    return { ok: false, error: 'turnstile_failed' };
  }

  /**
   * The action is checked when siteverify reports one, and not invented when
   * it does not.
   *
   * A token minted by the contact box must not be spendable on a registration,
   * which is what comparing the action buys. But siteverify omits the field
   * entirely for some tokens — Cloudflare's own always-pass testing key
   * answers `{"success":true,"hostname":"example.com",...}` with no `action`
   * at all — and an absent field is not a mismatched one. Demanding equality
   * against `undefined` turned every such token into a 403, which is a shop
   * where nobody can register rather than a shop with no bots in it.
   *
   * What still holds when the field is absent: the token was solved, it was
   * solved on a hostname we accept, and it is single-use, so it cannot be
   * replayed on a second form either way.
   */
  const reported = String(result.action || '');
  if (action && reported && reported !== action) {
    console.warn('turnstile action mismatch', JSON.stringify({ expected: action, reported }));
    return { ok: false, error: 'turnstile_action' };
  }

  if (!hostnames.has(String(result.hostname || ''))) {
    console.warn('turnstile hostname refused', JSON.stringify({ reported: String(result.hostname || '') }));
    return { ok: false, error: 'turnstile_hostname' };
  }
  return { ok: true };
}

/** The token as the browser sends it, under Cloudflare's own field name. */
export function turnstileToken(body) {
  return String(body?.['cf-turnstile-response'] || '');
}
