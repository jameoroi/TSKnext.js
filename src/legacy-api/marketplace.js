import { persistentStore } from './lib/storage.js';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { FALLBACK_TENANT, resolveTenant, tenantNamespaces } from './lib/tenants.js';
import { normalizeProductInventory, syncProductAggregates, variantAvailable } from './lib/inventory-model.js';

// Same shape as api.js, and for the same reason: a Worker isolate interleaves
// requests at every await, so a shared "current tenant" variable would let one
// merchant's Shopee/Lazada sync write into another merchant's catalogue. The
// context is bound once per request at the bottom of this file.
const tenantContext = new AsyncLocalStorage();
const activeTenant = () => tenantContext.getStore() || FALLBACK_TENANT;
const authStore = () => persistentStore(tenantNamespaces(activeTenant()).auth);
const dataStore = () => persistentStore(tenantNamespaces(activeTenant()).data);
const SESSION_COOKIE = 'tsk_session';

function json(data, status=200){ return new Response(JSON.stringify(data), { status, headers:{ 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' } }); }
function sha(v){ return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function parseCookies(req){ const out={}; for(const p of (req.headers.get('cookie')||'').split(';')){ const i=p.indexOf('='); if(i>0) out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim()); } return out; }
async function getJSON(store,key){ try{return await store.get(key,{type:'json',consistency:'strong'});}catch{return null;} }
async function requireAdmin(req){
  const token=parseCookies(req)[SESSION_COOKIE]; if(!token) return null;
  const data=await getJSON(authStore(),`session:${sha(token)}`);
  return (data && data.type==='admin') ? {...data,session_token_hash:sha(token)} : null;
}
function csrfOk(b,admin){ return !!admin?.csrf && String(b?.csrf||'')===admin.csrf; }
function random(n=24){ return crypto.randomBytes(n).toString('hex'); }
async function marketplaceResponse(res,provider){
  const payload=await res.json().catch(()=>null);
  if(!res.ok)throw new Error(`${provider}_http_${res.status}`);
  if(!payload||typeof payload!=='object')throw new Error(`${provider}_invalid_response`);
  if(payload.error)throw new Error(`${provider}_upstream_error`);
  if(payload.code&&String(payload.code)!=='0')throw new Error(`${provider}_upstream_${String(payload.code).slice(0,40)}`);
  return payload;
}

async function getBusinessSettings(){
  const saved = await getJSON(dataStore(),'business-settings')||{};
  const out={
    shopee: { partner_id:'', partner_key:'', shop_id:'', redirect_url:'', ...(saved.shopee||{}) },
    lazada: { app_key:'', app_secret:'', country:'th', redirect_url:'', ...(saved.lazada||{}) }
  };
  if(process.env.SHOPEE_PARTNER_ID) out.shopee.partner_id=process.env.SHOPEE_PARTNER_ID;
  if(process.env.SHOPEE_PARTNER_KEY) out.shopee.partner_key=process.env.SHOPEE_PARTNER_KEY;
  if(process.env.SHOPEE_SHOP_ID) out.shopee.shop_id=process.env.SHOPEE_SHOP_ID;
  if(process.env.LAZADA_APP_KEY) out.lazada.app_key=process.env.LAZADA_APP_KEY;
  if(process.env.LAZADA_APP_SECRET) out.lazada.app_secret=process.env.LAZADA_APP_SECRET;
  return out;
}

// ---------- Shopee Open Platform v2 ----------
// Spec: sign = HMAC_SHA256(partner_id + api_path + timestamp [+ access_token + shop_id], partner_key)
const SHOPEE_HOST = 'https://partner.shopeemobile.com';
function shopeeSign(partnerKey, base){ return crypto.createHmac('sha256', partnerKey).update(base).digest('hex'); }
async function shopeeAuthUrl(cfg, state){
  const timestamp = Math.floor(Date.now()/1000);
  const path = '/api/v2/shop/auth_partner';
  const base = `${cfg.partner_id}${path}${timestamp}`;
  const sign = shopeeSign(cfg.partner_key, base);
  const redirect=new URL(cfg.redirect_url); redirect.searchParams.set('state',state);
  const qs = new URLSearchParams({ partner_id: cfg.partner_id, timestamp, sign, redirect: redirect.toString() });
  return `${SHOPEE_HOST}${path}?${qs.toString()}`;
}
async function shopeeExchangeToken(cfg, code, shopId){
  const timestamp = Math.floor(Date.now()/1000);
  const path = '/api/v2/auth/token/get';
  const base = `${cfg.partner_id}${path}${timestamp}`;
  const sign = shopeeSign(cfg.partner_key, base);
  const qs = new URLSearchParams({ partner_id: cfg.partner_id, timestamp, sign });
  const res = await fetch(`${SHOPEE_HOST}${path}?${qs}`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ code, shop_id: Number(shopId), partner_id: Number(cfg.partner_id) })
  });
  return marketplaceResponse(res,'shopee');
}
async function shopeeRefreshToken(cfg,token){
  const timestamp=Math.floor(Date.now()/1000),path='/api/v2/auth/access_token/get',base=`${cfg.partner_id}${path}${timestamp}`,sign=shopeeSign(cfg.partner_key,base),qs=new URLSearchParams({partner_id:cfg.partner_id,timestamp,sign});
  const res=await fetch(`${SHOPEE_HOST}${path}?${qs}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({refresh_token:token.refresh_token,shop_id:Number(token.shop_id),partner_id:Number(cfg.partner_id)})});return res.json();
}
async function shopeeCall(cfg, token, apiPath, extraQuery={}, method='GET', body=null){
  const timestamp = Math.floor(Date.now()/1000);
  const base = `${cfg.partner_id}${apiPath}${timestamp}${token.access_token}${token.shop_id}`;
  const sign = shopeeSign(cfg.partner_key, base);
  const qs = new URLSearchParams({ partner_id: cfg.partner_id, timestamp, access_token: token.access_token, shop_id: token.shop_id, sign, ...extraQuery });
  const opt = { method, headers:{'content-type':'application/json'} };
  if(method==='POST') opt.body = JSON.stringify(body||{});
  const res = await fetch(`${SHOPEE_HOST}${apiPath}?${qs}`, opt);
  return marketplaceResponse(res,'shopee');
}

// Shopee: push a new stock number for one item (model_id=0 if the product has no variations)
async function shopeeUpdateStock(cfg, token, itemId, modelId, stock){
  const body = modelId
    ? { item_id:Number(itemId), stock_list:[{ model_id:Number(modelId), seller_stock:[{ stock:Number(stock) }] }] }
    : { item_id:Number(itemId), stock_list:[{ seller_stock:[{ stock:Number(stock) }] }] };
  return shopeeCall(cfg, token, '/api/v2/product/update_stock', {}, 'POST', body);
}
// Shopee: unlist=true -> ปิดการขาย (ซ่อนสินค้า) / unlist=false -> เปิดขายอีกครั้ง
async function shopeeSetActive(cfg, token, itemId, active){
  return shopeeCall(cfg, token, '/api/v2/product/unlist_item', {}, 'POST', { item_list:[{ item_id:Number(itemId), unlist: !active }] });
}

// ---------- Lazada Open Platform ----------
// Spec: sort params by key, base = api_path + concat(key+value...), sign = HMAC_SHA256(base, app_secret) uppercase hex
const LAZADA_HOST = 'https://api.lazada.co.th/rest'; // swap per-country host if needed
function lazadaSign(appSecret, apiPath, params){
  const keys = Object.keys(params).sort();
  let base = apiPath;
  for(const k of keys) base += k + params[k];
  return crypto.createHmac('sha256', appSecret).update(base).digest('hex').toUpperCase();
}
async function lazadaExchangeToken(cfg, code){
  const path = '/auth/token/create';
  const params = { app_key: cfg.app_key, timestamp: String(Date.now()), sign_method:'sha256', code };
  params.sign = lazadaSign(cfg.app_secret, path, params);
  const res = await fetch(`${LAZADA_HOST}${path}?${new URLSearchParams(params)}`);
  return marketplaceResponse(res,'lazada');
}
async function lazadaRefreshToken(cfg,refreshToken){
  const path='/auth/token/refresh',params={app_key:cfg.app_key,timestamp:String(Date.now()),sign_method:'sha256',refresh_token:refreshToken};params.sign=lazadaSign(cfg.app_secret,path,params);const res=await fetch(`${LAZADA_HOST}${path}?${new URLSearchParams(params)}`);return res.json();
}
async function lazadaCall(cfg, token, apiPath, extraParams={}){
  const params = { app_key: cfg.app_key, timestamp: String(Date.now()), sign_method:'sha256', access_token: token.access_token, ...extraParams };
  params.sign = lazadaSign(cfg.app_secret, apiPath, params);
  const res = await fetch(`${LAZADA_HOST}${apiPath}?${new URLSearchParams(params)}`);
  return marketplaceResponse(res,'lazada');
}
function xmlEscape(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
// Upstream OAuth errors are reflected into an HTML page served from the admin
// origin. data.message comes from Shopee/Lazada and can echo request input,
// so it is escaped — otherwise a crafted error text runs script as admin.
function htmlEscape(s){ return xmlEscape(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
// Lazada: อัปเดตสต็อก+ราคาของ SellerSku หนึ่งตัว (ใช้ seller_stock ปัจจุบันถ้าไม่ส่งราคาใหม่มา)
async function lazadaUpdateStock(cfg, token, sellerSku, quantity, price){
  const payload = `<Request><Product><Skus><Sku><SellerSku>${xmlEscape(sellerSku)}</SellerSku><Quantity>${Number(quantity)}</Quantity>${price?`<Price>${Number(price)}</Price>`:''}</Sku></Skus></Product></Request>`;
  return lazadaCall(cfg, token, '/product/price_quantity/update', { Payload: payload });
}
// Lazada: เปิด/ปิดการขาย (active/inactive) ของ SellerSku หนึ่งตัว
async function lazadaSetActive(cfg, token, sellerSku, active){
  const payload = `<Request><Product><Skus><Sku><SellerSku>${xmlEscape(sellerSku)}</SellerSku><Status>${active?'active':'inactive'}</Status></Sku></Skus></Product></Request>`;
  return lazadaCall(cfg, token, '/product/price_quantity/update', { Payload: payload });
}
async function validShopeeToken(ds,cfg){
  let token=await getJSON(ds,'shopee-token');if(!token)return null;const saved=new Date(token.saved_at||0).getTime(),expires=Number(token.expire_in||0)*1000;if(token.refresh_token&&expires&&Date.now()>saved+expires-10*60*1000){const fresh=await shopeeRefreshToken(cfg,token);if(fresh.access_token){token={...token,...fresh,saved_at:new Date().toISOString()};await ds.setJSON('shopee-token',token);}}return token;
}
async function validLazadaToken(ds,cfg){
  let token=await getJSON(ds,'lazada-token');if(!token)return null;const expires=Number(token.expires_in||token.expire_in||0)*1000,saved=new Date(token.saved_at||0).getTime();if(token.refresh_token&&expires&&Date.now()>saved+expires-10*60*1000){const fresh=await lazadaRefreshToken(cfg,token.refresh_token);if(fresh.access_token){token={...token,...fresh,saved_at:new Date().toISOString()};await ds.setJSON('lazada-token',token);}}return token;
}
async function catalogMarketplaceRows(ds){
  const out={};for(const productId of await getJSON(ds,'product-index')||[]){const raw=await getJSON(ds,`product:${productId}`);if(!raw)continue;const product=normalizeProductInventory(raw);for(const variant of product.variants||[]){const id=`${product.id}::${variant.id}`,mapping=variant.marketplace||{};out[id]={product_id:product.id,variant_id:variant.id,name:`${product.name}${product.variants.length>1?` · ${variant.label}`:''}`,sku:variant.sku,stock:Number.isFinite(variantAvailable(variant))?variantAvailable(variant):999999,active:product.state==='active'&&variant.state==='active',shopee_item_id:String(mapping.shopee_item_id||''),shopee_model_id:String(mapping.shopee_model_id||''),lazada_seller_sku:String(mapping.lazada_seller_sku||''),updated_at:product.updated_at};}}return out;
}
async function saveCatalogMapping(ds,id,input){const [productId,variantId]=String(id).split('::'),raw=await getJSON(ds,`product:${productId}`);if(!raw)return null;const product=normalizeProductInventory(raw),variant=product.variants.find(v=>v.id===variantId);if(!variant)return null;variant.marketplace={...(variant.marketplace||{}),shopee_item_id:String(input.shopee_item_id||''),shopee_model_id:String(input.shopee_model_id||''),lazada_seller_sku:String(input.lazada_seller_sku||'')};product.updated_at=new Date().toISOString();syncProductAggregates(product);await ds.setJSON(`product:${productId}`,product);return product;}

export default async (req) => {
  const tenant = resolveTenant(new URL(req.url).hostname);
  if (!tenant) return json({ ok:false, error:'unknown_tenant_host' }, 404);
  return tenantContext.run(tenant, () => handleMarketplaceRequest(req));
};

async function handleMarketplaceRequest(req) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  const admin = await requireAdmin(req);
  const settings = await getBusinessSettings();
  const ds = dataStore();

  // ---- Shopee ----
  if(action==='shopee.auth_url'){
    if(!admin) return json({ok:false,error:'unauthorized'},401);
    if(!settings.shopee.partner_id || !settings.shopee.partner_key || !settings.shopee.redirect_url)
      return json({ok:false,error:'shopee_not_configured'},422);
    const state=random(24); await ds.setJSON(`oauth-state:${sha(state)}`,{provider:'shopee',admin:admin.username,expires_at:Date.now()+10*60*1000});
    const authUrl = await shopeeAuthUrl(settings.shopee,state);
    return json({ok:true, url: authUrl});
  }
  if(action==='shopee.oauth_callback'){
    // Meta/Shopee redirect hits this with ?code=...&shop_id=...
    const code = url.searchParams.get('code'); const shopId = url.searchParams.get('shop_id'); const state=url.searchParams.get('state')||'';
    const st=state?await getJSON(ds,`oauth-state:${sha(state)}`):null;
    if(!code || !shopId || !st || st.provider!=='shopee' || Number(st.expires_at||0)<Date.now()) return new Response('invalid_or_expired_oauth_state', { status:400 });
    await ds.delete(`oauth-state:${sha(state)}`).catch(()=>{});
    const data = await shopeeExchangeToken(settings.shopee, code, shopId);
    if(data.access_token){
      await ds.setJSON('shopee-token', { access_token:data.access_token, refresh_token:data.refresh_token, shop_id:shopId, expire_in:data.expire_in, saved_at:new Date().toISOString() });
      return new Response('<h2>เชื่อมต่อ Shopee สำเร็จแล้ว ปิดหน้านี้แล้วกลับไปที่แอดมินได้เลย</h2>', { status:200, headers:{'content-type':'text/html; charset=utf-8'} });
    }
    return new Response('<h2>เชื่อมต่อ Shopee ไม่สำเร็จ: '+htmlEscape(data.message||'unknown error')+'</h2>', { status:400, headers:{'content-type':'text/html; charset=utf-8'} });
  }
  if(action==='shopee.status'){
    if(!admin) return json({ok:false,error:'unauthorized'},401);
    const token = await validShopeeToken(ds,settings.shopee);
    return json({ok:true, connected: !!token, shop_id: token?.shop_id||null });
  }
  if(action==='shopee.products'){
    if(!admin) return json({ok:false,error:'unauthorized'},401);
    const token = await validShopeeToken(ds,settings.shopee); if(!token) return json({ok:false,error:'not_connected'},422);
    const data = await shopeeCall(settings.shopee, token, '/api/v2/product/get_item_list', { offset:0, page_size:50, item_status:'NORMAL' });
    return json({ok:true, data });
  }

  // ---- Lazada ----
  if(action==='lazada.auth_url'){
    if(!admin) return json({ok:false,error:'unauthorized'},401);
    if(!settings.lazada.app_key || !settings.lazada.app_secret || !settings.lazada.redirect_url)
      return json({ok:false,error:'lazada_not_configured'},422);
    const state=random(24); await ds.setJSON(`oauth-state:${sha(state)}`,{provider:'lazada',admin:admin.username,expires_at:Date.now()+10*60*1000});
    const authUrl = `https://auth.lazada.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=${encodeURIComponent(settings.lazada.redirect_url)}&client_id=${encodeURIComponent(settings.lazada.app_key)}&state=${encodeURIComponent(state)}`;
    return json({ok:true, url: authUrl});
  }
  if(action==='lazada.oauth_callback'){
    const code = url.searchParams.get('code'); const state=url.searchParams.get('state')||'';
    const st=state?await getJSON(ds,`oauth-state:${sha(state)}`):null;
    if(!code || !st || st.provider!=='lazada' || Number(st.expires_at||0)<Date.now()) return new Response('invalid_or_expired_oauth_state', { status:400 });
    await ds.delete(`oauth-state:${sha(state)}`).catch(()=>{});
    const data = await lazadaExchangeToken(settings.lazada, code);
    if(data.access_token){
      await ds.setJSON('lazada-token', { access_token:data.access_token, refresh_token:data.refresh_token, country:settings.lazada.country, saved_at:new Date().toISOString() });
      return new Response('<h2>เชื่อมต่อ Lazada สำเร็จแล้ว ปิดหน้านี้แล้วกลับไปที่แอดมินได้เลย</h2>', { status:200, headers:{'content-type':'text/html; charset=utf-8'} });
    }
    return new Response('<h2>เชื่อมต่อ Lazada ไม่สำเร็จ: '+htmlEscape(data.message||'unknown error')+'</h2>', { status:400, headers:{'content-type':'text/html; charset=utf-8'} });
  }
  if(action==='lazada.status'){
    if(!admin) return json({ok:false,error:'unauthorized'},401);
    const token = await validLazadaToken(ds,settings.lazada);
    return json({ok:true, connected: !!token });
  }
  if(action==='lazada.products'){
    if(!admin) return json({ok:false,error:'unauthorized'},401);
    const token = await validLazadaToken(ds,settings.lazada); if(!token) return json({ok:false,error:'not_connected'},422);
    const data = await lazadaCall(settings.lazada, token, '/products/get', { filter:'live', limit:50 });
    return json({ok:true, data });
  }

  // ---- สินค้า / สต็อกกลาง (จับคู่ Shopee item+model / Lazada seller sku) ----
  if(action==='products.list'){
    if(!admin) return json({ok:false,error:'unauthorized'},401);
    const products = await catalogMarketplaceRows(ds);
    return json({ok:true, products});
  }
  if(action==='products.save' && req.method==='POST'){
    if(!admin) return json({ok:false,error:'unauthorized'},401);
    const b = await req.json(); if(!csrfOk(b,admin)) return json({ok:false,error:'invalid_csrf'},403);
    const id = String(b.id||'').trim(); if(!id) return json({ok:false,error:'missing_id'},422);
    const saved=await saveCatalogMapping(ds,id,b);if(!saved)return json({ok:false,error:'catalog_variant_not_found'},404);const products=await catalogMarketplaceRows(ds);return json({ok:true,product:products[id]});
  }
  if(action==='products.sync' && req.method==='POST'){
    if(!admin) return json({ok:false,error:'unauthorized'},401);
    const b = await req.json(); if(!csrfOk(b,admin)) return json({ok:false,error:'invalid_csrf'},403);
    const id = String(b.id||'').trim();
    const products = await catalogMarketplaceRows(ds);
    const p = products[id]; if(!p) return json({ok:false,error:'product_not_found'},404);
    const result = { id, shopee:null, lazada:null }; let failed=false;
    if(p.shopee_item_id){
      const shTok = await validShopeeToken(ds,settings.shopee);
      if(shTok){
        try{
          const r1 = await shopeeUpdateStock(settings.shopee, shTok, p.shopee_item_id, p.shopee_model_id, p.stock);
          const r2 = await shopeeSetActive(settings.shopee, shTok, p.shopee_item_id, p.active);
          result.shopee = { stock_result:r1, active_result:r2 };
        }catch{ failed=true; result.shopee = { error:'shopee_sync_failed' }; }
      } else result.shopee = { error:'shopee_not_connected' };
    }
    if(p.lazada_seller_sku){
      const lzTok = await validLazadaToken(ds,settings.lazada);
      if(lzTok){
        try{
          const r1 = await lazadaUpdateStock(settings.lazada, lzTok, p.lazada_seller_sku, p.stock);
          const r2 = await lazadaSetActive(settings.lazada, lzTok, p.lazada_seller_sku, p.active);
          result.lazada = { stock_result:r1, active_result:r2 };
        }catch{ failed=true; result.lazada = { error:'lazada_sync_failed' }; }
      } else result.lazada = { error:'lazada_not_connected' };
    }
    return json({ok:!failed, result, ...(failed?{error:'marketplace_sync_failed'}:{})}, failed?502:200);
  }
  if(action==='products.sync_all' && req.method==='POST'){
    if(!admin) return json({ok:false,error:'unauthorized'},401);
    const b=await req.json(); if(!csrfOk(b,admin)) return json({ok:false,error:'invalid_csrf'},403);
    const products = await catalogMarketplaceRows(ds);
    const shTok = await validShopeeToken(ds,settings.shopee);
    const lzTok = await validLazadaToken(ds,settings.lazada);
    const results = []; let failed=0;
    for(const id of Object.keys(products)){
      const p = products[id]; const r = { id, shopee:null, lazada:null };
      if(p.shopee_item_id && shTok){
        try{
          r.shopee = {
            stock_result: await shopeeUpdateStock(settings.shopee, shTok, p.shopee_item_id, p.shopee_model_id, p.stock),
            active_result: await shopeeSetActive(settings.shopee, shTok, p.shopee_item_id, p.active)
          };
        }catch{ failed++; r.shopee = { error:'shopee_sync_failed' }; }
      }
      if(p.lazada_seller_sku && lzTok){
        try{
          r.lazada = {
            stock_result: await lazadaUpdateStock(settings.lazada, lzTok, p.lazada_seller_sku, p.stock),
            active_result: await lazadaSetActive(settings.lazada, lzTok, p.lazada_seller_sku, p.active)
          };
        }catch{ failed++; r.lazada = { error:'lazada_sync_failed' }; }
      }
      results.push(r);
    }
    return json({ok:failed===0, count:results.length, failed, results, ...(failed?{error:'marketplace_sync_failed'}:{})}, failed?502:200);
  }

  return json({ok:false,error:'not_found'},404);
}
