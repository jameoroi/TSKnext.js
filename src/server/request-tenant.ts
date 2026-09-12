import 'server-only';

import type { NextRequest } from 'next/server';
import { resolveTenant, tenantById, tenantRegistry } from '@/legacy-api/lib/tenants.js';

export type TenantDescriptor = {
  id: string;
  name: string;
  hosts: string[];
  primaryHost: string;
};

export type RequestTenantResult =
  | { ok: true; tenant: TenantDescriptor; hostname: string }
  | { ok: false; error: 'tenant_not_found' | 'tenant_mismatch'; hostname: string; requested?: string };

function cleanHost(raw: string | null | undefined) {
  return String(raw || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '');
}

export function requestHostname(request: NextRequest) {
  return cleanHost(request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.hostname);
}

/**
 * Resolve a relational-API request to exactly one tenant.
 *
 * The compatibility API already scopes by Host. The first Next v1 port kept a
 * `?tenant=` fallback that let any public caller select an arbitrary tenant id,
 * which defeats host isolation as soon as the second merchant is configured.
 * Keep the query parameter for the original single-shop contract and for
 * explicit local/QA use, but never let it cross a host boundary in production.
 */
export function resolveRequestTenant(request: NextRequest): RequestTenantResult {
  const hostname = requestHostname(request);
  const registry = tenantRegistry() as TenantDescriptor[];
  const hostTenant = resolveTenant(hostname) as TenantDescriptor | null;
  const requested = String(request.nextUrl.searchParams.get('tenant') || '').trim().toLowerCase();

  if (!requested) {
    return hostTenant
      ? { ok: true, tenant: hostTenant, hostname }
      : { ok: false, error: 'tenant_not_found', hostname };
  }

  const requestedTenant = tenantById(requested) as TenantDescriptor | null;
  if (!requestedTenant) return { ok: false, error: 'tenant_not_found', hostname, requested };

  // Explicit opt-in exists for local QA where one hostname intentionally tests
  // several tenants. Production should not set this flag.
  if (process.env.TOGROW_ALLOW_TENANT_QUERY === '1') {
    return { ok: true, tenant: requestedTenant, hostname };
  }

  if (registry.length <= 1) {
    return { ok: true, tenant: requestedTenant, hostname };
  }

  if (!hostTenant) return { ok: false, error: 'tenant_not_found', hostname, requested };
  if (hostTenant.id !== requestedTenant.id) return { ok: false, error: 'tenant_mismatch', hostname, requested };
  return { ok: true, tenant: hostTenant, hostname };
}
