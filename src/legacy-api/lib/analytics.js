// Events use random browser identifiers, never account details or query strings.
export const EVENT_TYPES = new Set(['page_view', 'product_view', 'add_to_cart', 'begin_checkout']);

/**
 * Turn raw tracker events into the shape the admin report renders.
 *
 * A visitor counts as "returning" once they show up on more than one calendar
 * day. That is the only signal the tracker can offer honestly: identifiers are
 * per-browser, so anything finer would be a guess dressed up as a number.
 *
 * `purchases` comes from the order ledger, not from the tracker, because a
 * completed order is recorded server-side and never depends on the browser
 * finishing its last beacon.
 */
export function aggregateEvents(events, { purchases = 0 } = {}) {
  const visitors = new Set(), sessions = new Set(), daily = new Map(), pages = new Map(), products = new Map();
  const activeDays = new Map();
  const funnel = { product_views: 0, add_to_cart: 0, checkout: 0, purchases: Math.max(0, Number(purchases) || 0) };
  let pageviews = 0;
  for (const e of events) {
    if (!e || !EVENT_TYPES.has(e.type)) continue;
    visitors.add(e.visitor); sessions.add(e.session);
    const date = String(e.created_at).slice(0, 10);
    const days = activeDays.get(e.visitor) || new Set();
    days.add(date); activeDays.set(e.visitor, days);
    const day = daily.get(date) || { date, ids: new Set(), pageviews: 0 };
    day.ids.add(e.visitor); daily.set(date, day);
    if (e.type === 'page_view') { pageviews++; day.pageviews++; pages.set(e.path, (pages.get(e.path) || 0) + 1); }
    if (e.type === 'product_view') { funnel.product_views++; products.set(e.product_id, (products.get(e.product_id) || 0) + 1); }
    if (e.type === 'add_to_cart') funnel.add_to_cart++;
    if (e.type === 'begin_checkout') funnel.checkout++;
  }
  // First day we ever saw each visitor, so a day can split its own audience.
  const firstSeen = new Map();
  for (const [visitor, days] of activeDays) firstSeen.set(visitor, [...days].sort()[0]);
  let newVisitors = 0;
  for (const days of activeDays.values()) if (days.size === 1) newVisitors++;
  return {
    summary: {
      visitors: visitors.size,
      sessions: sessions.size,
      pageviews,
      new_visitors: newVisitors,
      returning_visitors: visitors.size - newVisitors,
      pages_per_session: sessions.size ? pageviews / sessions.size : 0,
    },
    daily: [...daily.values()].map((d) => {
      let fresh = 0;
      for (const visitor of d.ids) if (firstSeen.get(visitor) === d.date) fresh++;
      return { date: d.date, visitors: d.ids.size, pageviews: d.pageviews, new_visitors: fresh, returning_visitors: d.ids.size - fresh };
    }).sort((a,b) => a.date.localeCompare(b.date)),
    top_pages: [...pages].map(([path, views]) => ({ path, views })).sort((a,b) => b.views-a.views),
    top_products: [...products].map(([product_id, views]) => ({ product_id, views })).sort((a,b) => b.views-a.views).slice(0,20), funnel,
  };
}
