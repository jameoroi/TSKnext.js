'use client';

import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import { AlertTriangle, CheckCircle2, Database, RefreshCcw, ServerCog } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Health = {
  ok?: boolean;
  appVersion?: string;
  next?: string;
  services?: Record<string, boolean | string>;
  build?: string;
  time?: string;
};

const LABELS: Record<string, string> = {
  database: 'PostgreSQL',
  commerceApi: 'Commerce API',
  commerceStorage: 'Commerce Storage',
  catalogDualWrite: 'Catalog Dual Write',
  redis: 'Redis',
  meilisearch: 'Meilisearch',
  ai: 'OpenAI / AI',
  kitQuote: 'Bundle Quote',
  objectStorage: 'S3 / R2',
  email: 'Email',
};

function serviceOk(value: boolean | string | undefined) {
  if (typeof value === 'boolean') return value;
  return Boolean(value && value !== 'not-configured' && value !== 'disabled');
}

export function BackendStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/health', {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      setHealth(payload);
      setNetworkError('');
    } catch (error) {
      setNetworkError(error instanceof Error ? error.message : 'health_check_failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 90_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const state = useMemo(() => {
    const services = health?.services || {};
    const critical = ['database', 'commerceApi', 'kitQuote'];
    const criticalDown = critical.filter((key) => !serviceOk(services[key]));
    const optionalDown = ['redis', 'meilisearch', 'ai', 'objectStorage', 'email'].filter(
      (key) => !serviceOk(services[key]),
    );
    return { criticalDown, optionalDown };
  }, [health]);

  const degraded = Boolean(networkError || state.criticalDown.length || !health?.ok);

  return (
    <section
      className={`relative border-b px-4 py-2 md:px-7 ${degraded ? 'border-amber-200 bg-amber-50' : 'border-emerald-100 bg-emerald-50/80'}`}
      aria-label="สถานะระบบข้อมูล"
    >
      {loading && (
        <LinearProgress
          color={degraded ? 'warning' : 'success'}
          sx={{ position: 'absolute', insetInline: 0, top: 0, height: 2 }}
        />
      )}
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center gap-2 font-black"
        >
          {degraded ? (
            <AlertTriangle size={15} className="text-amber-700" />
          ) : (
            <CheckCircle2 size={15} className="text-emerald-700" />
          )}
          <span>{degraded ? 'ระบบข้อมูลบางส่วนยังไม่พร้อม' : 'ระบบข้อมูลพร้อมใช้งาน'}</span>
        </button>
        <span className="text-slate-500">
          Next {health?.next || '—'} · App {health?.appVersion || '—'} · Build {health?.build || '—'}
        </span>
        {state.criticalDown.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-1 font-bold text-amber-800">
            Critical: {state.criticalDown.map((key) => LABELS[key] || key).join(', ')}
          </span>
        )}
        {state.optionalDown.length > 0 && (
          <span className="rounded-full bg-white/80 px-2 py-1 font-semibold text-slate-600">
            Optional: {state.optionalDown.length} service(s) not configured
          </span>
        )}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border bg-white px-2 py-1 font-bold disabled:opacity-50"
        >
          <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
          ตรวจใหม่
        </button>
      </div>

      {expanded && (
        <div className="mx-auto mt-2 grid max-w-[1600px] gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.entries(health?.services || {}) as Array<[string, boolean | string]>).map(
            ([key, value]) => {
              const ok = serviceOk(value);
              return (
                <div key={key} className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
                  {key === 'database' ? <Database size={14} /> : <ServerCog size={14} />}
                  <div className="min-w-0">
                    <p className="truncate font-bold">{LABELS[key] || key}</p>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={ok ? 'success' : 'warning'}
                      label={typeof value === 'string' ? value : ok ? 'พร้อม' : 'ยังไม่ตั้งค่า'}
                      sx={{ mt: 0.25, height: 20, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }}
                    />
                  </div>
                </div>
              );
            },
          )}
          {networkError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
              <strong>Health API error</strong>
              <p className="mt-1 break-all text-[11px]">{networkError}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
