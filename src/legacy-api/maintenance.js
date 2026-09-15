import { persistentStore, reconcileProductMirror } from './lib/storage.js';
import { normalizeProductInventory } from './lib/inventory-model.js';
import { tenantById, tenantNamespaces, tenantRegistry } from './lib/tenants.js';
import crypto from 'node:crypto';

// A scheduled run has no Host header to resolve a merchant from, so the tenant
// is passed in explicitly and the nightly job walks the registry. With fixed
// namespaces every merchant beyond the first was silently never backed up,
// and each run overwrote the first merchant's snapshot.
const dataStore = (tenant) => persistentStore(tenantNamespaces(tenant).data);
const backupStore = (tenant) => persistentStore(tenantNamespaces(tenant).backups);
async function getJSON(store,key){return store.get(key,{type:'json',consistency:'strong'});}
async function rowsByIndex(store,indexKey,prefix,limit=20000){
  const ids=(await getJSON(store,indexKey)||[]).slice(-limit),rows=[];
  for(const id of ids){const value=await getJSON(store,`${prefix}${id}`);if(value)rows.push(value);}
  return {ids,rows};
}
function chunks(rows,size){const out=[];for(let i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));return out;}
async function invokeBackgroundBackup(req,day,jobToken,tenantId){
  const cronSecret=String(process.env.CRON_SECRET||'').trim();
  if(!cronSecret)return false;
  const configured=String(process.env.URL||'').replace(/\/$/,'');
  const origin=configured||new URL(req.url).origin;
  const response=await fetch(`${origin}/api/internal/maintenance-backup`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${cronSecret}`},body:JSON.stringify({day,job_token:jobToken,tenant_id:tenantId})});
  return response.ok;
}
async function notifyLowStock(items){
  const token=process.env.TELEGRAM_ALERT_BOT_TOKEN||process.env.TELEGRAM_BOT_TOKEN,chatId=process.env.TELEGRAM_ALERT_CHAT_ID||process.env.TELEGRAM_CHAT_ID;if(!token||!chatId||!items.length)return false;
  const lines=items.slice(0,25).map(x=>`- ${x.name} ${x.variant_label} [${x.sku||'-'}] คลัง ${x.warehouse_id}: ${x.available}`).join('\n');
  try{const result=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text:`📦 แจ้งเตือนสต็อกต่ำ ${items.length} รายการ\n${lines}`})});return result.ok;}catch{return false;}
}

/**
 * The nightly job. It runs on a schedule, so there is no Host header to say
 * which merchant it is for — it is for all of them. One background backup is
 * queued per configured tenant, each carrying its own job token and tenant id.
 * Previously a single fixed namespace was snapshotted, which meant every
 * merchant added after the first was silently never backed up.
 */
export default async (req) => {
  const started=new Date(),day=started.toISOString().slice(0,10),results=[];
  for(const tenant of tenantRegistry()){
    const ds=dataStore(tenant);
    const jobToken=crypto.randomBytes(24).toString('hex');
    await ds.setJSON(`backup-job:${jobToken}`,{day,tenant_id:tenant.id,expires_at:Date.now()+10*60*1000});
    await ds.setJSON('backup-meta',{last_backup_started_at:started.toISOString(),last_backup_by:'scheduled',status:'queued',retention_days:14});
    let queued=false;
    try{ queued=await invokeBackgroundBackup(req,day,jobToken,tenant.id); }
    catch(error){ console.warn('backup queue failed',tenant.id,error?.message||error); }
    // One merchant failing to queue must not stop the others being backed up.
    if(!queued){await ds.delete(`backup-job:${jobToken}`).catch(()=>{});await ds.setJSON('backup-meta',{last_backup_started_at:started.toISOString(),last_backup_by:'scheduled',status:'queue_failed',retention_days:14});}
    results.push({tenant_id:tenant.id,queued});
  }
  const queued=results.length>0&&results.every(row=>row.queued);
  return new Response(JSON.stringify({ok:queued,queued,day,tenants:results}),{status:queued?202:502,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
};

export async function runBackup(day=new Date().toISOString().slice(0,10),tenantId=''){
  const tenant=tenantById(tenantId)||(tenantId?null:tenantRegistry()[0]);
  if(!tenant)throw new Error(`unknown_backup_tenant:${tenantId}`);
  const ds=dataStore(tenant),backup=backupStore(tenant),started=new Date(),prefix=`snapshot:${day}`;
  const products=await rowsByIndex(ds,'product-index','product:',5000),orders=await rowsByIndex(ds,'order-index','order:',Number.MAX_SAFE_INTEGER),warehouses=await rowsByIndex(ds,'warehouse-index','warehouse:',500),categories=await rowsByIndex(ds,'category-index','category:',1000),brands=await rowsByIndex(ds,'brand-index','brand:',1000),coupons=await rowsByIndex(ds,'coupon-index','coupon:',5000),keys=[];
  const mirrorIntegrity=await reconcileProductMirror(products.rows,products.ids,tenantNamespaces(tenant).data);
  await ds.setJSON('catalog-integrity-meta',{...mirrorIntegrity,checked_at:new Date().toISOString(),source:'daily-maintenance'});
  async function write(key,value){await backup.setJSON(key,value);keys.push(key);}
  const productChunks=chunks(products.rows,20),orderChunks=chunks(orders.rows,100);
  for(let i=0;i<productChunks.length;i++)await write(`${prefix}:products:${i}`,productChunks[i]);
  for(let i=0;i<orderChunks.length;i++)await write(`${prefix}:orders:${i}`,orderChunks[i]);
  const settings={site:await getJSON(ds,'site-settings'),business:await getJSON(ds,'business-settings')};
  await write(`${prefix}:reference`,{warehouses:warehouses.rows,categories:categories.rows,brands:brands.rows,coupons:coupons.rows,settings});
  const low=[];
  for(const product of products.rows){if(product.state!=='active')continue;for(const variant of normalizeProductInventory(product).variants||[])for(const [warehouseId,level] of Object.entries(variant.inventory||{})){const available=level.on_hand===null?Infinity:Math.max(0,Number(level.on_hand||0)-Number(level.reserved||0));if(Number.isFinite(available)&&available<=Number(level.reorder_point??5))low.push({name:product.name,variant_label:variant.label,sku:variant.sku,warehouse_id:warehouseId,available});}}
  const manifest={version:3,complete:true,created_at:started.toISOString(),completed_at:new Date().toISOString(),counts:{products:products.rows.length,orders:orders.rows.length,warehouses:warehouses.rows.length,categories:categories.rows.length,brands:brands.rows.length,coupons:coupons.rows.length,low_stock:low.length},catalog_integrity:mirrorIntegrity,keys:[...keys,`${prefix}:manifest`]};
  await write(`${prefix}:manifest`,manifest);
  let snapshots=await getJSON(backup,'snapshot-index')||[];snapshots=[...snapshots.filter(x=>x.day!==day),{day,manifest_key:`${prefix}:manifest`}].sort((a,b)=>a.day.localeCompare(b.day));
  while(snapshots.length>14){const old=snapshots.shift(),oldManifest=await getJSON(backup,old.manifest_key);for(const key of oldManifest?.keys||[])await backup.delete(key);}
  await backup.setJSON('snapshot-index',snapshots);await ds.setJSON('backup-meta',{last_backup_at:manifest.completed_at,last_backup_started_at:started.toISOString(),last_backup_by:'background',status:'complete',complete:true,counts:manifest.counts,retention_days:14});await notifyLowStock(low);
  return manifest;
}

/** Consume a short-lived scheduled-job token and run only that tenant's backup. */
export async function runBackupJob({day='',jobToken='',tenantId=''}){
  const tenant=tenantById(tenantId);
  if(!tenant)throw new Error(`unknown_backup_tenant:${tenantId}`);
  const ds=dataStore(tenant),job=await getJSON(ds,`backup-job:${jobToken}`);
  if(!job||job.tenant_id!==tenant.id||job.day!==day||Number(job.expires_at||0)<Date.now()){
    throw new Error('invalid_backup_job');
  }
  const manifest=await runBackup(day,tenant.id);
  await ds.delete(`backup-job:${jobToken}`);
  return manifest;
}

export const config = { schedule: '@daily' };
