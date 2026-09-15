import crypto from 'node:crypto';
import { persistentStore } from './storage.js';
import { presignS3Url } from './s3-presign.js';
import { getCloudflareContext } from '@opennextjs/cloudflare';

function cleanSegment(v){ return String(v||'file').toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100)||'file'; }
function cfg(){
  const endpoint=process.env.MEDIA_S3_ENDPOINT||'';
  const region=process.env.MEDIA_S3_REGION||'auto';
  const bucket=process.env.MEDIA_BUCKET||'';
  const accessKeyId=process.env.MEDIA_S3_ACCESS_KEY_ID||'';
  const secretAccessKey=process.env.MEDIA_S3_SECRET_ACCESS_KEY||'';
  const publicBase=(process.env.MEDIA_PUBLIC_BASE_URL||'').replace(/\/$/,'');
  const supabaseUrl=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const supabaseSecret=String(process.env.SUPABASE_SECRET_KEY||'');
  const supabaseBucket=String(process.env.SUPABASE_MEDIA_BUCKET||'product-media');
  // R2 and most self-hosted endpoints want the bucket in the path; S3 proper
  // wants it in the hostname. Path style is the safer default for this shop.
  const forcePathStyle=String(process.env.MEDIA_S3_FORCE_PATH_STYLE||'').toLowerCase()!=='false';
  return {endpoint,region,bucket,accessKeyId,secretAccessKey,publicBase,forcePathStyle,supabaseUrl,supabaseSecret,supabaseBucket};
}
function supabaseMediaEnabled(c=cfg()){return !!(c.supabaseUrl&&c.supabaseSecret&&c.supabaseBucket);}
/**
 * S3-compatible storage — Cloudflare R2 in practice — when it is configured.
 *
 * `publicBase` is part of the test rather than an extra: an R2 bucket is not
 * readable over the internet until it has been given an address, either the
 * r2.dev one or a custom domain, and there is no way to derive that from the
 * endpoint. Without it every stored picture would have a key and no way for a
 * shopper to fetch it, so a half-configured bucket is treated as no bucket and
 * the shop stays on Supabase rather than writing pictures nobody can see.
 */
function s3MediaEnabled(c=cfg()){return !!(c.endpoint&&c.bucket&&c.accessKeyId&&c.secretAccessKey&&c.publicBase);}
function supabaseHeaders(c){return {apikey:c.supabaseSecret,authorization:`Bearer ${c.supabaseSecret}`,'content-type':'application/json'};}
export function mediaConfigured(){ return s3MediaEnabled()||supabaseMediaEnabled(); }
/**
 * What the bucket should tell a browser about every picture we store.
 *
 * Storage keeps no cache directive unless the upload states one, and serves
 * back what it kept — so without this every picture on the shop went out as
 * `no-cache` and every shopper re-downloaded all of it on every visit, having
 * already downloaded it on the last one. The home page alone carries several
 * megabytes of artwork.
 *
 * Saying `immutable` is honest here rather than optimistic: every key is built
 * around a fresh UUID, so an address never comes to point at different bytes.
 * Replacing a picture writes a new key and the record moves to it.
 */
export const MEDIA_CACHE_CONTROL='public, max-age=31536000, immutable';
export function mediaPublicUrl(key){ const c=cfg(); if(c.publicBase)return `${c.publicBase}/${String(key).replace(/^\/+/, '')}`; return supabaseMediaEnabled(c)?`${c.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(c.supabaseBucket)}/${String(key).split('/').map(encodeURIComponent).join('/')}`:''; }
/**
 * The storage key behind one of our own public addresses, or '' for anything
 * else. The inverse of mediaPublicUrl above, and the reason a picture removed
 * in the admin can be removed from the bucket rather than left behind it: a
 * shop that replaces its banner every month otherwise pays to store every
 * banner it has ever had.
 */
export function mediaKeyFromUrl(url){
  const c=cfg(), value=String(url||'').trim();
  if(!isOwnMedia(value)) return '';
  // Both forms, not whichever one is configured today. A shop that moves to R2
  // still has years of Supabase addresses on its records, and this is what
  // decides whether a replaced picture can be removed from storage: answering
  // '' for the old form would leave every superseded file behind, paid for and
  // unreachable, with nothing to say it was ever ours.
  const bases=[
    c.publicBase?`${c.publicBase}/`:'',
    c.supabaseUrl?`${c.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(c.supabaseBucket)}/`:'',
  ].filter(Boolean);
  const base=bases.find(candidate=>value.startsWith(candidate));
  if(!base) return '';
  const path=value.slice(base.length).split('?')[0];
  if(!path) return '';
  try{ return path.split('/').map(decodeURIComponent).join('/'); }catch{ return ''; }
}
export function imageMagicMatches(mime, bytes){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]), type=String(mime||'').toLowerCase();
  const png=b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71, jpg=b[0]===255&&b[1]===216&&b[2]===255, gif=b[0]===71&&b[1]===73&&b[2]===70, webp=b[0]===82&&b[1]===73&&b[2]===70&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80, avif=b[4]===102&&b[5]===116&&b[6]===121&&b[7]===112;
  return (type==='image/png'&&png)||(type==='image/jpeg'&&jpg)||(type==='image/gif'&&gif)||(type==='image/webp'&&webp)||(type==='image/avif'&&avif);
}
export async function presignUpload({filename,mime_type,owner_type='product',owner_id='',created_by=''}){
  const c=cfg(); if(!mediaConfigured()) throw new Error('media_storage_not_configured');
  const ext=(String(filename||'').match(/\.[a-z0-9]{1,8}$/i)||[''])[0].toLowerCase();
  const now=new Date(); const folder=`${now.getUTCFullYear()}/${String(now.getUTCMonth()+1).padStart(2,'0')}`;
  const key=`${cleanSegment(owner_type)}/${folder}/${crypto.randomUUID()}-${cleanSegment(String(filename||'image').replace(ext,''))}${ext||''}`;
  const contentType=String(mime_type||'application/octet-stream').slice(0,120);
  // Same contract either way: an address the browser PUTs the bytes to, so
  // they never travel through the worker. Only the way it is minted differs.
  let upload_url;
  if(s3MediaEnabled(c)){
    upload_url=await presignS3Url({endpoint:c.endpoint,region:c.region,bucket:c.bucket,accessKeyId:c.accessKeyId,secretAccessKey:c.secretAccessKey,key,method:'PUT',expiresIn:900,forcePathStyle:c.forcePathStyle});
  } else {
    const path=String(key).split('/').map(encodeURIComponent).join('/');
    const response=await fetch(`${c.supabaseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(c.supabaseBucket)}/${path}`,{method:'POST',headers:supabaseHeaders(c),body:JSON.stringify({upsert:false})});
    if(!response.ok)throw new Error(`media_presign_failed:${response.status}`);
    const signed=await response.json(); upload_url=signed.url||signed.signedURL||signed.signedUrl;
    if(upload_url?.startsWith('/'))upload_url=`${c.supabaseUrl}/storage/v1${upload_url}`;
  }
  return {key,upload_url,public_url:mediaPublicUrl(key),expires_in:900,headers:{'content-type':contentType},owner_type,owner_id,created_by};
}
/**
 * The first bytes of a stored object, for the image check in commitMedia.
 *
 * With R2 the public address is this shop's own domain (/media), and a Worker
 * fetching its own custom domain does not reach itself: the request failed, so
 * every admin upload ended in media_content_unreadable (HTTP 500). The object
 * is read from the bucket with a short-lived signed GET instead, which never
 * goes through the zone. The public address stays as the fallback, and is the
 * only path for Supabase storage.
 */
async function readMediaHead(key,publicUrl){
  // 1. The PRODUCT_MEDIA binding: the same bucket, read in-process, no network,
  //    exactly how /media serves these files.
  try{
    const {env}=await getCloudflareContext({async:true});
    const bucket=env?.PRODUCT_MEDIA;
    if(bucket){
      const object=await bucket.get(key,{range:{offset:0,length:32}});
      if(object) return new Uint8Array(await object.arrayBuffer());
    }
  }catch{}
  // 2. A signed GET against the S3 endpoint.
  const c=cfg();
  if(s3MediaEnabled(c)){
    try{
      const signed=await presignS3Url({endpoint:c.endpoint,region:c.region,bucket:c.bucket,accessKeyId:c.accessKeyId,secretAccessKey:c.secretAccessKey,key,method:'GET',expiresIn:300,forcePathStyle:c.forcePathStyle});
      const res=await fetch(signed,{headers:{Range:'bytes=0-31'}});
      if(res.ok||res.status===206) return new Uint8Array(await res.arrayBuffer());
    }catch{}
  }
  // 3. The public address (Supabase storage, or a bucket on another domain).
  try{
    const res=await fetch(publicUrl,{headers:{Range:'bytes=0-31'}});
    if(res.ok||res.status===206) return new Uint8Array(await res.arrayBuffer());
  }catch{}
  return null;
}
export async function commitMedia(meta){
  const declared=String(meta.mime_type||'').toLowerCase();
  const allowed=['image/png','image/jpeg','image/webp','image/gif','image/avif'];
  if(!allowed.includes(declared)) throw new Error('unsupported_media_type');
  // Derived from the key, never taken from the caller. `public_url` used to be
  // read straight off the request body, so whoever called this chose the
  // address the worker then fetched — a server-side request out of a runtime
  // that holds the Supabase service key — and that same address was stored on
  // the asset and rendered as a product image. The presign step returns this
  // exact value anyway, so nothing legitimate changes.
  const url=String(mediaPublicUrl(meta.key)||'');
  if(url){
    const bytes=await readMediaHead(meta.key,url);
    // Bytes that were read and are not the declared image are refused. Bytes
    // that could not be read at all no longer fail the upload: only a signed-in
    // admin can reach this, the file was written to a key we just minted, and
    // an admin whose every banner upload ended in HTTP 500 had no shop to run.
    if(bytes&&!imageMagicMatches(declared,bytes)) throw new Error('media_magic_bytes_mismatch');
    if(!bytes) console.warn('media commit could not read back',meta.key);
    meta={...meta,content_checked:Boolean(bytes)};
  }
  const ds=persistentStore('tsk-media');
  const id=crypto.randomUUID();
  const asset={id,...meta,public_url:url,created_at:new Date().toISOString(),deleted_at:null};
  await ds.setJSON(`asset:${id}`,asset);
  const idx=(await ds.get('asset-index',{type:'json',consistency:'strong'}).catch(()=>null))||[];
  idx.unshift(id);
  await ds.setJSON('asset-index',[...new Set(idx)].slice(0,50000));
  return {ok:true,asset};
}
/** Bytes a single product photo may occupy. Anything larger is a mistake. */
const MIRROR_MAX_BYTES = 12 * 1024 * 1024;
const MIRROR_MIME = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };

/** True once an address already points at storage we control. */
export function isOwnMedia(url){
  const c=cfg(), value=String(url||'');
  if(!/^https:\/\//i.test(value)) return false;
  if(c.publicBase && value.startsWith(c.publicBase)) return true;
  return Boolean(c.supabaseUrl && value.startsWith(`${c.supabaseUrl}/storage/v1/object/public/`));
}

/**
 * Copy a remote image into our own bucket and return the address to store.
 *
 * Product photos arrive from the supplier's CSV as links to their site and were
 * written into the catalogue exactly as given, so every product page hotlinked
 * a host we do not control. The day that host goes down, renames a path or
 * starts refusing our referrer, the shop loses its photography — all of it, at
 * once, with nothing on our side to fall back to.
 *
 * The pieces to fix it already existed (presign, magic-byte checks, the bucket);
 * nothing called them from the import path. This is that call.
 *
 * The caller supplies the address, so this is deliberately narrow: https only,
 * a declared image type, a size ceiling, and a real decode check by the commit
 * step afterwards. It is meant to be run by an operator against a file they
 * chose, not to be reachable from a request.
 */
export async function mirrorRemoteImage(sourceUrl, { owner_type='product', owner_id='', created_by='import', timeoutMs=20000, makeVariants=null }={}){
  const url=String(sourceUrl||'').trim();
  if(!url) return { ok:false, reason:'empty' };
  // A data: image is already ours — it lives in the record itself.
  if(url.startsWith('data:')) return { ok:false, reason:'inline', url };
  if(!/^https:\/\//i.test(url)) return { ok:false, reason:'not_https', url };
  if(isOwnMedia(url)) return { ok:true, mirrored:false, url };
  if(!mediaConfigured()) throw new Error('media_storage_not_configured');

  let firstHost = '';
  try { firstHost = new URL(url).hostname.toLowerCase(); } catch { return { ok: false, reason: 'bad_url', url }; }
  if (!firstHost) return { ok: false, reason: 'bad_url', url };
  // One same-host redirect at most. 'follow' would let any response in the
  // chain move this credential-holding runtime (Supabase service key, R2
  // secrets) to an attacker-chosen host — a classic SSRF hop via an open
  // redirect on an otherwise innocent supplier CDN. Same-host http→https
  // upgrades, the legitimate case, still work.
  let target = url;
  let response = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'image/*' } });
  if (response.status >= 300 && response.status < 400) {
    let resolved = '';
    let resolvedHost = '';
    try {
      const next = String(response.headers.get('location') || '');
      resolved = next ? new URL(next, target).toString() : '';
      resolvedHost = resolved ? new URL(resolved).hostname.toLowerCase() : '';
    } catch { resolved = ''; resolvedHost = ''; }
    if (!resolved || !/^https:\/\//i.test(resolved) || resolvedHost !== firstHost)
      return { ok: false, reason: 'redirect_refused', url };
    target = resolved;
    response = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'image/*' } });
    if (response.status >= 300 && response.status < 400) return { ok: false, reason: 'redirect_refused', url };
  }
  if(!response.ok) return { ok:false, reason:`http_${response.status}`, url };
  const declared=String(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!MIRROR_MIME[declared]) return { ok:false, reason:`unsupported_type_${declared||'none'}`, url };
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(!bytes.length) return { ok:false, reason:'empty_body', url };
  if(bytes.length>MIRROR_MAX_BYTES) return { ok:false, reason:'too_large', url, size_bytes:bytes.length };
  // Refuse anything whose bytes disagree with its declared type before it ever
  // reaches the bucket, rather than finding out at commit time.
  if(!imageMagicMatches(declared,bytes)) return { ok:false, reason:'magic_bytes_mismatch', url };

  const filename=(url.split('?')[0].split('/').pop()||'image')+(/\.[a-z0-9]{1,8}$/i.test(url.split('?')[0])?'':MIRROR_MIME[declared]);
  const signed=await presignUpload({ filename, mime_type:declared, owner_type, owner_id, created_by });
  const upload=await fetch(signed.upload_url,{method:'PUT',headers:{'content-type':declared,'cache-control':MEDIA_CACHE_CONTROL},body:bytes});
  if(!upload.ok) return { ok:false, reason:`upload_${upload.status}`, url };

  const committed=await commitMedia({ key:signed.key, mime_type:declared, size_bytes:bytes.length, owner_type, owner_id, created_by, source_url:url });
  const variants=makeVariants?await uploadVariants(bytes,{makeVariants,owner_type,owner_id,created_by,source_url:url}):[];
  return { ok:true, mirrored:true, url:committed.asset.public_url, key:signed.key, size_bytes:bytes.length, variants };
}

/**
 * Move a picture out of the record it was written into and into the bucket.
 *
 * `mirrorRemoteImage` above declines a `data:` image on the grounds that it is
 * already ours. It is — and that is the problem. A banner uploaded as base64
 * sat inside `site-settings`, which is read and server-rendered into every
 * visit to the home page: one 2.5 MB banner and 1.4 MB of category thumbnails
 * made the home page a 4 MB document while the products page beside it was
 * 107 kB. The bytes belong in storage; the record belongs to hold an address of
 * about a hundred and forty characters.
 *
 * This is the safety net rather than the main path — the admin forms upload
 * before they save now — so it never throws. Anything it cannot move is
 * reported and left exactly as it was, and a shop whose bucket is not
 * configured goes on working the way it did.
 */
export async function storeInlineImage(value, { owner_type='site', owner_id='', created_by='admin' }={}){
  const raw=String(value||'').trim();
  const match=raw.match(/^data:(image\/(?:png|jpeg|webp|gif|avif));base64,([A-Za-z0-9+/=]+)$/i);
  if(!match) return { ok:false, reason:'not_inline', url:raw };
  if(!mediaConfigured()) return { ok:false, reason:'media_storage_not_configured', url:raw };
  const declared=String(match[1]).toLowerCase();
  if(!MIRROR_MIME[declared]) return { ok:false, reason:`unsupported_type_${declared}`, url:raw };
  let bytes;
  try{
    const binary=atob(match[2]);
    bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  }catch{ return { ok:false, reason:'undecodable', url:raw }; }
  if(!bytes.length) return { ok:false, reason:'empty_body', url:raw };
  if(bytes.length>MIRROR_MAX_BYTES) return { ok:false, reason:'too_large', url:raw, size_bytes:bytes.length };
  // The same check a mirrored image gets: what the bytes are, not what the
  // prefix claims they are.
  if(!imageMagicMatches(declared,bytes)) return { ok:false, reason:'magic_bytes_mismatch', url:raw };
  try{
    const filename=`inline-${Date.now().toString(36)}${MIRROR_MIME[declared]}`;
    const signed=await presignUpload({ filename, mime_type:declared, owner_type, owner_id, created_by });
    const upload=await fetch(signed.upload_url,{method:'PUT',headers:{'content-type':declared,'cache-control':MEDIA_CACHE_CONTROL},body:bytes});
    if(!upload.ok) return { ok:false, reason:`upload_${upload.status}`, url:raw };
    const committed=await commitMedia({ key:signed.key, mime_type:declared, size_bytes:bytes.length, owner_type, owner_id, created_by });
    return { ok:true, url:committed.asset.public_url, key:signed.key, size_bytes:bytes.length };
  }catch(error){
    return { ok:false, reason:String(error?.message||error||'upload_failed'), url:raw };
  }
}

/**
 * Store the smaller copies a phone should be downloading instead.
 *
 * A supplier's photograph is a 1,600px JPEG and the card that shows it is 240px
 * wide, so every product on a listing page costs a shopper roughly forty times
 * the pixels their screen can use. `scripts/optimise-images.mjs` has solved this
 * for the site's own artwork since R95 — several widths, AVIF and WebP — but it
 * only ever looked at `site/assets`, and product photography does not live
 * there. It arrives here, from the supplier, one image at a time.
 *
 * The resizing itself is not done here. `sharp` is a native module and this
 * file is bundled into the Cloudflare Worker, which cannot load one; the caller
 * (an import script, running on Node) passes `makeVariants` in. That keeps the
 * worker bundle free of it and this module's only job the uploading.
 *
 * A variant that fails to encode or upload is skipped rather than fatal: the
 * original has already been stored and rendering falls back to it, so a missing
 * variant costs bandwidth, not a picture.
 */
async function uploadVariants(bytes,{makeVariants,owner_type,owner_id,created_by,source_url}){
  let produced=[];
  try{ produced=(await makeVariants(bytes))||[]; }catch(error){ return []; }
  const out=[];
  for(const variant of produced){
    const mime=String(variant?.mime||'').toLowerCase();
    const data=variant?.data instanceof Uint8Array?variant.data:new Uint8Array(variant?.data||[]);
    const width=Math.max(1,Math.floor(Number(variant?.width)||0));
    if(!MIRROR_MIME[mime]||!data.length||!width)continue;
    if(data.length>MIRROR_MAX_BYTES)continue;
    if(!imageMagicMatches(mime,data))continue;
    try{
      const signed=await presignUpload({ filename:`w${width}${MIRROR_MIME[mime]}`, mime_type:mime, owner_type, owner_id, created_by });
      const upload=await fetch(signed.upload_url,{method:'PUT',headers:{'content-type':mime,'cache-control':MEDIA_CACHE_CONTROL},body:data});
      if(!upload.ok)continue;
      const committed=await commitMedia({ key:signed.key, mime_type:mime, size_bytes:data.length, owner_type, owner_id, created_by, source_url, variant_width:width });
      out.push({ url:committed.asset.public_url, width, format:mime.split('/')[1] });
    }catch{ /* one missing size is not worth losing the picture over */ }
  }
  return out;
}

export async function deleteMedia(key){
  const c=cfg(); if(!mediaConfigured()) throw new Error('media_storage_not_configured');
  if(s3MediaEnabled(c)){
    const signed=await presignS3Url({endpoint:c.endpoint,region:c.region,bucket:c.bucket,accessKeyId:c.accessKeyId,secretAccessKey:c.secretAccessKey,key,method:'DELETE',expiresIn:300,forcePathStyle:c.forcePathStyle});
    const response=await fetch(signed,{method:'DELETE'});
    if(!response.ok&&response.status!==404)throw new Error(`media_delete_failed:${response.status}`);
  } else {
    const path=String(key).split('/').map(encodeURIComponent).join('/');
    const response=await fetch(`${c.supabaseUrl}/storage/v1/object/${encodeURIComponent(c.supabaseBucket)}/${path}`,{method:'DELETE',headers:supabaseHeaders(c)});
    if(!response.ok&&response.status!==404)throw new Error(`media_delete_failed:${response.status}`);
  }
  const ds=persistentStore('tsk-media');
  const idx=(await ds.get('asset-index',{type:'json',consistency:'strong'}).catch(()=>null))||[];
  for(const id of idx){
    const a=await ds.get(`asset:${id}`,{type:'json',consistency:'strong'}).catch(()=>null);
    if(a?.key===String(key)){ a.deleted_at=new Date().toISOString(); await ds.setJSON(`asset:${id}`,a); break; }
  }
  return {ok:true};
}
export async function listMedia({owner_type='',owner_id='',limit=100}={}){
  const ds=persistentStore('tsk-media');
  const idx=(await ds.get('asset-index',{type:'json',consistency:'strong'}).catch(()=>null))||[];
  const out=[]; const n=Math.min(500,Math.max(1,Number(limit)||100));
  for(const id of idx){
    if(out.length>=n) break;
    const a=await ds.get(`asset:${id}`,{type:'json',consistency:'strong'}).catch(()=>null);
    if(!a||a.deleted_at) continue;
    if(owner_type&&a.owner_type!==owner_type) continue;
    if(owner_id&&a.owner_id!==owner_id) continue;
    out.push(a);
  }
  return out;
}
