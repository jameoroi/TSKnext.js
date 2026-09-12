/**
 * Failures, written somewhere a person can read them.
 *
 * Everything this API knows about a failure went to `console.error`, and on
 * Cloudflare Pages that is a stream nobody is watching: there is no retention
 * on the free plan, no search, and no way to ask "what broke last night".
 * `docs/OPERATIONS.md` has listed error tracking as outstanding since it was
 * written, and the health probe added alongside this only sees the shop from
 * outside — it can tell you a page answered 500, never which line threw.
 *
 * So failures are kept here, in the shop's own store, and read back through
 * the console the owner already signs in to. No third-party account, no DSN,
 * nothing to renew.
 *
 * ## What is deliberately not recorded
 *
 * No request bodies, no cookies, no headers, no query strings. An error from
 * checkout would otherwise carry an address and a phone number into a log that
 * outlives the order, and a log of customer data is a breach waiting for
 * somewhere to happen. The action, the status, the message and the path are
 * enough to find the fault; if they are not, the fault needs reproducing
 * rather than more of the customer written down.
 */

/** Beyond this the oldest are dropped. Enough to cover a bad weekend. */
const KEEP = 200;

/** Longer than this and a stack trace is being stored, not a message. */
const MAX_MESSAGE = 500;

/**
 * When the store itself is the thing that is broken.
 *
 * A storage outage is exactly when failures arrive fastest, and it is also
 * when writing them down cannot work. Without this, every request in an outage
 * would pay for a doomed write on its way to failing anyway — turning a slow
 * shop into a stopped one. After a failed write this stops trying for a
 * minute, which costs at most a minute of records in return for never making
 * an outage worse.
 */
const MUTE_MS = 60_000;
let mutedUntil = 0;

/**
 * The longest a failing request may be delayed by the act of recording it.
 *
 * The store retries four times before it gives up, and during an outage that
 * is four round trips added to a request that is already failing. Measured in
 * the suite: the dead-datastore case went from a few hundred milliseconds to
 * 5.7 seconds once this module started writing, and the check timed out
 * intermittently — a logger making the outage worse, which is the one thing it
 * was written not to do. The write is abandoned at this point and the minute's
 * mute begins, so the cost is bounded whatever the store is doing.
 */
const WRITE_BUDGET_MS = 500;

async function withBudget(work) {
  // The timer is cleared whichever side wins. Left running, it fires after the
  // race has already settled and rejects a promise nobody is holding any more
  // — an unhandled rejection, which in Node is a process-level error thrown by
  // the one part of this file whose whole job is to not throw.
  let timer;
  try {
    return await Promise.race([
      work,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('error log write budget exceeded')), WRITE_BUDGET_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function clean(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Record one failure. Never throws, never rejects.
 *
 * The caller is on its way to returning an error to somebody; a logger that
 * can turn that into a different, worse error is not worth having.
 */
export async function recordFailure(store, entry) {
  if (!store || Date.now() < mutedUntil) return;
  try {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const row = {
      id,
      at: new Date().toISOString(),
      action: clean(entry?.action, 80) || 'unknown',
      status: Number(entry?.status) || 500,
      // The path only, and cut here rather than trusted from the caller. The
      // comment used to say "the path only" while the code stored whatever it
      // was handed, and a caller passing `req.url` would have written a
      // customer's phone number and email into a log that outlives their
      // order. The test that says so is the reason this line exists.
      path: clean(String(entry?.path ?? '').split('?')[0].split('#')[0], 200),
      message: clean(entry?.message, MAX_MESSAGE),
      request_id: clean(entry?.requestId, 40),
    };
    await withBudget((async () => {
      await store.setJSON(`errorlog:${id}`, row);
      const index = (await store.get('errorlog-index', { type: 'json' })) || [];
      const next = [id, ...(Array.isArray(index) ? index : [])];
      const dropped = next.splice(KEEP);
      await store.setJSON('errorlog-index', next);
      // Trimming is best-effort: an orphaned row costs a little space, a throw
      // here would cost the request.
      for (const old of dropped) await store.delete(`errorlog:${old}`).catch(() => {});
    })());
  } catch {
    mutedUntil = Date.now() + MUTE_MS;
  }
}

/** The most recent failures, newest first. */
export async function recentFailures(store, limit = 50) {
  if (!store) return [];
  try {
    const index = (await store.get('errorlog-index', { type: 'json' })) || [];
    const ids = (Array.isArray(index) ? index : []).slice(0, Math.max(1, Math.min(200, limit)));
    const rows = [];
    for (const id of ids) {
      const row = await store.get(`errorlog:${id}`, { type: 'json' }).catch(() => null);
      if (row) rows.push(row);
    }
    return rows;
  } catch {
    return [];
  }
}

/**
 * A count of failures inside a window, for anything that wants a number rather
 * than a list — a readiness report, or a probe asking whether the shop has
 * been quietly throwing all night.
 */
export function countSince(rows, sinceMs) {
  const cutoff = Date.now() - sinceMs;
  return rows.filter((row) => {
    const at = Date.parse(row?.at || '');
    return Number.isFinite(at) && at >= cutoff;
  }).length;
}
