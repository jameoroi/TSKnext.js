'use client';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { legacyRequest } from '@/lib/legacy-api.client';

export function LogoutButton({ role, className = '' }: { role: 'admin'|'agent'|'supplier'|'customer'; className?: string }) {
  const router=useRouter(); const [busy,setBusy]=useState(false);
  return <button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await legacyRequest(`${role}.logout`,{},'POST')}finally{router.replace('/');router.refresh()}}} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 ${className}`}><LogOut size={16}/>{busy?'กำลังออก…':'ออกจากระบบ'}</button>;
}
