import 'server-only';

import type { NextRequest } from 'next/server';
import { resolveTenant, tenantById } from '@/legacy-api/lib/tenants.js';

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
  // Prefer the validated Host over x-forwarded-host: the former is what the
  // edge terminated TLS for, while the latter is trivially spoofed by any
  // client that reaches the origin directly.
  return cleanHost(
    request.headers.get('host') || request.headers.get('x-forwarded-host') || request.nextUrl.hostname,
  );
}

/**
 * Resolve a relational-API request to exactly one tenant.
 *
 * The compatibility API already scopes by Host. A `?tenant=` fallback exists
 * for explicit local/QA use (TOGROW_ALLOW_TENANT_QUERY=1, non-production
 * only): it may select any configured tenant for testing. Otherwise the
 * query parameter must name the SAME tenant the hostname resolves to — a
 * mismatch is refused, and an unknown hostname is refused. The production
 * guard above means a mis-set flag can never silently open host isolation.
 */
export function resolveRequestTenant(request: NextRequest): RequestTenantResult {
  const hostname = requestHostname(request);
  const hostTenant = resolveTenant(hostname) as TenantDescriptor | null;
  const requested = String(request.nextUrl.searchParams.get('tenant') || '')
    .trim()
    .toLowerCase();

  if (!requested) {
    return hostTenant
      ? { ok: true, tenant: hostTenant, hostname }
      : { ok: false, error: 'tenant_not_found', hostname };
  }

  const requestedTenant = tenantById(requested) as TenantDescriptor | null;
  if (!requestedTenant) return { ok: false, error: 'tenant_not_found', hostname, requested };

  // Explicit opt-in exists for local QA where one hostname intentionally tests
  // several tenants. Production must never set this flag: a ?tenant= override
  // that crosses host boundaries defeats host isolation outright, so in
  // production the flag is treated as unset (and loudly so).
  const allowQuery = process.env.TOGROW_ALLOW_TENANT_QUERY === '1' && process.env.NODE_ENV !== 'production';
  if (process.env.TOGROW_ALLOW_TENANT_QUERY === '1' && process.env.NODE_ENV === 'production') {
    console.warn('[tenant] TOGROW_ALLOW_TENANT_QUERY=1 is ignored in production');
  }
  if (allowQuery) {
    return { ok: true, tenant: requestedTenant, hostname };
  }

  if (!hostTenant) return { ok: false, error: 'tenant_not_found', hostname, requested };
  if (hostTenant.id !== requestedTenant.id)
    return { ok: false, error: 'tenant_mismatch', hostname, requested };
  return { ok: true, tenant: hostTenant, hostname };
}
