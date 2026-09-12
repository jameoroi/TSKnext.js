import { runBackup } from './maintenance.js';
import { persistentStore } from './lib/storage.js';
import { tenantById, tenantNamespaces, tenantRegistry } from './lib/tenants.js';

export default async (req) => {
  const body=await req.json().catch(()=>({}));
  const token=/^[a-f0-9]{48}$/.test(String(body.job_token||''))?String(body.job_token):'';
  // The scheduler says which merchant this run is for. Without it every run
  // read its job token from, and wrote its backup-meta into, one fixed
  // namespace — so a second merchant's backup reported against the first.
  const tenant=body.tenant_id?tenantById(String(body.tenant_id)):tenantRegistry()[0];
  if(!tenant)return;
  const ds=persistentStore(tenantNamespaces(tenant).data),job=token?await ds.get(`backup-job:${token}`,{type:'json',consistency:'strong'}).catch(()=>null):null;
  if(!job||Number(job.expires_at||0)<Date.now())return;
  // A token minted for one merchant must not authorise a run against another.
  if(job.tenant_id&&job.tenant_id!==tenant.id)return;
  await ds.delete(`backup-job:${token}`);
  const day=/^\d{4}-\d{2}-\d{2}$/.test(String(job.day||''))?String(job.day):new Date().toISOString().slice(0,10);
  try{await runBackup(day,tenant.id);}catch(error){await ds.setJSON('backup-meta',{last_backup_started_at:new Date().toISOString(),last_backup_by:'background',status:'failed',complete:false,error:String(error?.message||error).slice(0,500),retention_days:14});throw error;}
};

export const config = { background: true };
