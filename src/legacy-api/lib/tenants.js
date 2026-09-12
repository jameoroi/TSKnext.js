// TOGROW runs several merchant storefronts from one deployment. Each merchant
// is a tenant: its own catalogue, orders, customers, agents and site settings,
// kept in its own storage namespace and reachable on its own domain.
//
// The namespaces are `{id}-data` and `{id}-auth`, which is exactly the shape
// the single-shop deployment already used (`tsk-data` / `tsk-auth`). Giving the
// first merchant the id `tsk` therefore needs no data migration at all.

/** Used when nothing is configured, so a single-shop deployment keeps working. */
const FALLBACK_TENANT = { id: 'tsk', name: 'THAISERKIT SUPPLY', hosts: [], primaryHost: '' };

function normalizeHost(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')       // strip port
    .replace(/^www\./, '');     // www and apex are the same tenant
}

function normalizeTenant(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // The id becomes part of a storage namespace, so it must stay a safe slug.
  const id = String(raw.id || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!id) return null;
  const hosts = (Array.isArray(raw.hosts) ? raw.hosts : [raw.hosts])
    .map(normalizeHost)
    .filter(Boolean);
  return {
    id,
    name: String(raw.name || id).slice(0, 160),
    hosts,
    primaryHost: hosts[0] || '',
  };
}

/**
 * Reads the tenant list from TOGROW_TENANTS, a JSON array:
 *
 *   [{"id":"tsk","name":"THAISERKIT SUPPLY","hosts":["jayxtsk.shop"]},
 *    {"id":"acme","name":"ACME","hosts":["acme.co.th"]}]
 *
 * Anything malformed falls back to the single-shop tenant rather than throwing,
 * because a typo in an environment variable must not take every store offline.
 */
export function tenantRegistry() {
  const raw = String(process.env.TOGROW_TENANTS || '').trim();
  if (!raw) return [FALLBACK_TENANT];
  try {
    const parsed = JSON.parse(raw);
    const rows = (Array.isArray(parsed) ? parsed : [parsed]).map(normalizeTenant).filter(Boolean);
    if (!rows.length) return [FALLBACK_TENANT];
    // Two tenants sharing an id would share a namespace — drop the duplicates.
    const seen = new Set();
    return rows.filter((row) => (seen.has(row.id) ? false : seen.add(row.id)));
  } catch (error) {
    console.warn('TOGROW_TENANTS is not valid JSON; falling back to single tenant', error?.message || error);
    return [FALLBACK_TENANT];
  }
}

/**
 * The tenant a request belongs to, decided by its Host header.
 *
 * Returns null when the host belongs to nobody. That matters: this used to
 * fall through to `registry[0]`, so on a deployment serving several merchants
 * any unrecognised host — a stale DNS record, a *.pages.dev preview, someone
 * pointing their own domain at us — was served the FIRST merchant's catalogue,
 * sessions and orders, and writes landed in that merchant's namespace. Nothing
 * announced it.
 *
 * The fallback is kept exactly where it is safe:
 *   - one tenant configured (the single-shop deployment, and the default when
 *     TOGROW_TENANTS is unset): every host is that shop, as before;
 *   - several tenants configured: an unknown host resolves to nothing and the
 *     caller must refuse the request, unless TOGROW_PREVIEW_TENANT names the
 *     tenant that preview builds should use.
 */
export function resolveTenant(hostname) {
  const registry = tenantRegistry();
  const host = normalizeHost(hostname);
  if (host) {
    const match = registry.find((tenant) => tenant.hosts.includes(host));
    if (match) return match;
  }
  if (registry.length <= 1) return registry[0] || FALLBACK_TENANT;
  const preview = String(process.env.TOGROW_PREVIEW_TENANT || '').trim().toLowerCase();
  if (preview) {
    const chosen = registry.find((tenant) => tenant.id === preview);
    if (chosen) return chosen;
  }
  return null;
}

export function tenantById(id) {
  const wanted = String(id || '').trim().toLowerCase();
  return tenantRegistry().find((tenant) => tenant.id === wanted) || null;
}

/** Storage namespaces for a tenant. Keep in step with dataStore/authStore. */
export function tenantNamespaces(tenant) {
  const id = tenant?.id || FALLBACK_TENANT.id;
  // `backups` joins the pair because a nightly snapshot is merchant data like
  // any other; one shared backup namespace would let a restore write one
  // merchant's catalogue over another's.
  return { data: `${id}-data`, auth: `${id}-auth`, backups: `${id}-backups` };
}

export { FALLBACK_TENANT };
