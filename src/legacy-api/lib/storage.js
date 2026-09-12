import postgres from 'postgres';

// Commerce storage can run directly on PostgreSQL or through Supabase PostgREST.
// Direct PostgreSQL is preferred when DATABASE_URL is configured; Supabase stays
// available as a compatibility transport for existing deployments.
const STORAGE_RETRY_DELAYS=[0,250,800,1800];

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const supabaseUrl=()=>String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const supabaseSecret=()=>String(process.env.SUPABASE_SECRET_KEY||'');
export function supabaseEnabled(){ return Boolean(supabaseUrl()&&supabaseSecret()); }

async function supabaseFetch(path,options={}){
  const secret=supabaseSecret();
  const response=await fetch(`${supabaseUrl()}${path}`,{
    ...options,
    headers:{apikey:secret,authorization:`Bearer ${secret}`,'content-type':'application/json',...(options.headers||{})}
  });
  if(!response.ok){
    const detail=(await response.text()).slice(0,500);
    throw new Error(`supabase_${response.status}:${detail}`);
  }
  if(response.status===204)return null;
  const text=await response.text();
  return text?JSON.parse(text):null;
}
async function withStorageRetry(label,operation){
  let lastError;
  for(let attempt=0;attempt<STORAGE_RETRY_DELAYS.length;attempt++){
    if(STORAGE_RETRY_DELAYS[attempt])await sleep(STORAGE_RETRY_DELAYS[attempt]);
    try{return await operation();}
    catch(error){lastError=error;console.warn(`${label} failed (${attempt+1}/${STORAGE_RETRY_DELAYS.length})`,error?.message||error);}
  }
  throw lastError||new Error(`${label}_failed`);
}

const postgresUrl=()=>String(process.env.DATABASE_URL||'').trim();
let postgresClient=null;
export function postgresEnabled(){ return Boolean(postgresUrl()); }
function sqlClient(){
  if(!postgresEnabled())throw new Error('postgres_not_configured');
  if(!postgresClient)postgresClient=postgres(postgresUrl(),{
    max:Math.max(1,Math.min(10,Number(process.env.POSTGRES_POOL_MAX||5)||5)),
    idle_timeout:20,
    connect_timeout:10,
    prepare:false,
  });
  return postgresClient;
}
export function database(){
  const sql=sqlClient();
  return {
    sql,
    pool:{
      async query(text,params=[]){
        const rows=await sql.unsafe(String(text),Array.isArray(params)?params:[]);
        return {rows:Array.from(rows||[]),rowCount:Number(rows?.count??rows?.length??0)};
      }
    }
  };
}
export async function mirrorJSON(namespace,key,value){
  if(!postgresEnabled())return false;
  const sql=sqlClient();
  await sql`INSERT INTO app_kv (namespace,key,value,updated_at)
    VALUES (${String(namespace)},${String(key)},${sql.json(value)},NOW())
    ON CONFLICT (namespace,key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`;
  return true;
}
export async function unmirrorJSON(namespace,key){
  if(!postgresEnabled())return false;
  const sql=sqlClient();
  await sql`DELETE FROM app_kv WHERE namespace=${String(namespace)} AND key=${String(key)}`;
  return true;
}

// `namespace` is required: this writes a merchant's whole catalogue into the
// mirror, and a default would quietly reconcile one shop's products into
// another shop's rows.
export async function reconcileProductMirror(products,indexIds=[],namespace){
  if(!namespace)throw new Error('reconcileProductMirror_requires_namespace');
  if(!postgresEnabled())return {enabled:false,ok:true,mirrored:0,expected:indexIds.length};
  const rows=(Array.isArray(products)?products:[]).filter(product=>product?.id);
  const expected=new Set((Array.isArray(indexIds)?indexIds:[]).map(String));
  const db=database();
  try{
    for(let start=0;start<rows.length;start+=25){
      const batch=rows.slice(start,start+25).map(product=>({key:`product:${product.id}`,value:product}));
      await withStorageRetry('postgres product reconciliation',()=>db.pool.query(`INSERT INTO app_kv (namespace,key,value,updated_at)
        SELECT $2,row.key,row.value,NOW()
        FROM jsonb_to_recordset($1::jsonb) AS row(key text,value jsonb)
        ON CONFLICT (namespace,key) DO UPDATE
        SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,[JSON.stringify(batch),namespace]));
    }
    const countResult=await withStorageRetry('postgres product mirror count',()=>db.pool.query(`SELECT COUNT(*)::int AS count FROM app_kv WHERE namespace=$1 AND key LIKE 'product:%'`,[namespace]));
    const mirrored=Number(countResult.rows[0]?.count||0);
    return {enabled:true,ok:mirrored===expected.size&&rows.length===expected.size,mirrored,expected:expected.size,source_rows:rows.length};
  }catch(error){
    console.warn('postgres product reconciliation failed',error?.message||error);
    return {enabled:true,ok:false,mirrored:null,expected:expected.size,source_rows:rows.length,error:String(error?.message||error)};
  }
}

/**
 * Whether product writes are also written to the relational `products` table.
 *
 * Off unless the environment says otherwise, and off is the safe state: the
 * table is a derived copy that nothing reads yet, and `app_kv` remains the
 * source of truth either way. See 20260901140000_product_table.sql.
 */
export function productTableEnabled(){ return String(process.env.PRODUCT_TABLE_DUAL_WRITE||'')==='1'; }


// Native Next catalogue mirror. It deliberately uses a different table name
// (`catalog_products`) from the older compatibility `products` table, so both
// schemas can coexist while business actions are moved to the relational core.
export function catalogTableEnabled(){ return String(process.env.CATALOG_TABLE_DUAL_WRITE||'')==='1'; }

function tenantIdFromDataNamespace(namespace){
  const value=String(namespace||'').trim();
  return value.endsWith('-data')?value.slice(0,-5):value;
}

export function catalogProductRow(namespace,product){
  const text=(value,max=3000)=>String(value??'').slice(0,max);
  const amount=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?Math.round(n*100):0;};
  const integer=value=>{const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.trunc(n)):0;};
  const images=Array.isArray(product?.images)?product.images.map(String).filter(Boolean).slice(0,50):(product?.img?[String(product.img)]:[]);
  return {
    tenant_id:tenantIdFromDataNamespace(namespace),
    id:text(product?.id,200),
    sku:text(product?.sku,300)||null,
    name:text(product?.name,1000)||'Unnamed product',
    slug:text(product?.slug,500)||null,
    description:text(product?.description||product?.desc,10000)||null,
    brand:text(product?.brand,500)||null,
    category_key:text(product?.category,500)||null,
    barcode:text(product?.barcode,300)||null,
    price_satang:amount(product?.price),
    old_price_satang:product?.oldPrice==null&&product?.old_price==null?null:amount(product?.oldPrice??product?.old_price),
    stock:integer(product?.stock),
    reserved:integer(product?.reserved),
    status:text(product?.state||'active',80),
    image_url:text(product?.img||product?.imageUrl||product?.image_url,4000)||null,
    images,
    detail_images:Array.isArray(product?.detail_images)?product.detail_images.map(String).filter(Boolean).slice(0,100):[],
    specs:product?.specs&&typeof product.specs==='object'&&!Array.isArray(product.specs)?product.specs:{},
    source_id:text(product?.source_id,300)||null,
    source_url:text(product?.source_url,4000)||null,
    marketplace_source:text(product?.marketplace_source,120)||null,
    created_at:product?.created_at||new Date().toISOString(),
    updated_at:product?.updated_at||new Date().toISOString(),
  };
}

async function writeNativeCatalogTablePostgres(namespace,productId,product){
  const sql=sqlClient();
  const tenantId=tenantIdFromDataNamespace(namespace);
  if(product===null){
    await sql`DELETE FROM catalog_products WHERE tenant_id=${tenantId} AND id=${String(productId)}`;
    return true;
  }
  const row=catalogProductRow(namespace,product);
  await sql`INSERT INTO catalog_products (
      tenant_id,id,sku,name,slug,description,brand,category_key,barcode,
      price_satang,old_price_satang,stock,reserved,status,image_url,images,
      detail_images,specs,source_id,source_url,marketplace_source,created_at,updated_at
    ) VALUES (
      ${row.tenant_id},${row.id},${row.sku},${row.name},${row.slug},${row.description},${row.brand},${row.category_key},${row.barcode},
      ${row.price_satang},${row.old_price_satang},${row.stock},${row.reserved},${row.status},${row.image_url},${sql.json(row.images)},
      ${sql.json(row.detail_images)},${sql.json(row.specs)},${row.source_id},${row.source_url},${row.marketplace_source},${row.created_at},${row.updated_at}
    ) ON CONFLICT (tenant_id,id) DO UPDATE SET
      sku=EXCLUDED.sku,
      name=EXCLUDED.name,
      slug=EXCLUDED.slug,
      description=EXCLUDED.description,
      brand=EXCLUDED.brand,
      category_key=EXCLUDED.category_key,
      barcode=EXCLUDED.barcode,
      price_satang=EXCLUDED.price_satang,
      old_price_satang=EXCLUDED.old_price_satang,
      stock=EXCLUDED.stock,
      reserved=EXCLUDED.reserved,
      status=EXCLUDED.status,
      image_url=EXCLUDED.image_url,
      images=EXCLUDED.images,
      detail_images=EXCLUDED.detail_images,
      specs=EXCLUDED.specs,
      source_id=EXCLUDED.source_id,
      source_url=EXCLUDED.source_url,
      marketplace_source=EXCLUDED.marketplace_source,
      updated_at=EXCLUDED.updated_at`;
  return true;
}

async function writeNativeCatalogTable(namespace,productId,product){
  if(!catalogTableEnabled())return false;
  try{
    if(postgresEnabled())return await writeNativeCatalogTablePostgres(namespace,productId,product);
    if(!supabaseEnabled())throw new Error('catalog_storage_not_configured');
    const tenantId=tenantIdFromDataNamespace(namespace);
    if(product===null){
      const query=new URLSearchParams({tenant_id:`eq.${tenantId}`,id:`eq.${String(productId)}`});
      await supabaseFetch(`/rest/v1/catalog_products?${query}`,{method:'DELETE'});
      return true;
    }
    await supabaseFetch('/rest/v1/catalog_products',{
      method:'POST',
      headers:{prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(catalogProductRow(namespace,product))
    });
    return true;
  }catch(error){
    console.warn('native catalog mirror failed; commerce document remains authoritative',error?.message||error);
    return false;
  }
}

/**
 * One product document, flattened into the columns the catalogue queries on.
 *
 * Exported because two callers have to agree on it exactly: the dual-write
 * below, which keeps the table current, and scripts/sync-product-table.mjs,
 * which fills it from scratch. If they disagreed, a row written by one and
 * checked by the other would look like drift that is not there.
 */
export function productTableRow(namespace,product){
  const text=value=>String(value??'').slice(0,2000);
  const number=value=>{const n=Number(value);return Number.isFinite(n)?n:0;};
  return {
    namespace,
    id:text(product?.id),
    name:text(product?.name),
    slug:text(product?.slug),
    sku:text(product?.sku),
    barcode:text(product?.barcode),
    brand:text(product?.brand),
    brand_id:text(product?.brand_id),
    category:text(product?.category),
    price:number(product?.price),
    old_price:product?.oldPrice==null?null:number(product?.oldPrice),
    stock:Math.trunc(number(product?.stock)),
    state:text(product?.state)||'active',
    status:Array.isArray(product?.status)?product.status.slice(0,20):[],
    img:text(product?.img),
    home_featured:product?.home_featured===true,
    // Name, sku and brand, in that order — the same three fields the fuzzy
    // search in api/api.js scores against, so a query can be moved onto this
    // column without changing which products it finds.
    search_text:[product?.name,product?.sku,product?.brand].filter(Boolean).join(' ').toLowerCase().slice(0,2000),
    created_at:product?.created_at||new Date().toISOString(),
    updated_at:product?.updated_at||new Date().toISOString(),
    synced_at:new Date().toISOString()
  };
}

/**
 * Write one product into the relational table, or take it back out.
 *
 * Deliberately unable to fail the caller. The KV write it follows has already
 * happened and is what the shop serves from; a mirror that is briefly behind is
 * a reporting problem, while a mirror that can refuse a product save is an
 * outage. Drift is found and repaired by scripts/sync-product-table.mjs, which
 * is why that script exists.
 */
async function writeProductTable(namespace,productId,product){
  const compatEnabled=productTableEnabled();
  const nativeEnabled=catalogTableEnabled();
  if(!compatEnabled&&!nativeEnabled)return false;
  if(nativeEnabled)await writeNativeCatalogTable(namespace,productId,product);
  if(!compatEnabled)return true;
  try{
    if(postgresEnabled()){
      const sql=sqlClient();
      if(product===null){
        await sql`DELETE FROM products WHERE namespace=${String(namespace)} AND id=${String(productId)}`;
        return true;
      }
      const row=productTableRow(namespace,product);
      await sql`INSERT INTO products (
        namespace,id,name,slug,sku,barcode,brand,brand_id,category,price,old_price,stock,state,status,img,home_featured,search_text,created_at,updated_at,synced_at
      ) VALUES (
        ${row.namespace},${row.id},${row.name},${row.slug},${row.sku},${row.barcode},${row.brand},${row.brand_id},${row.category},${row.price},${row.old_price},${row.stock},${row.state},${sql.json(row.status)},${row.img},${row.home_featured},${row.search_text},${row.created_at},${row.updated_at},${row.synced_at}
      ) ON CONFLICT (namespace,id) DO UPDATE SET
        name=EXCLUDED.name,slug=EXCLUDED.slug,sku=EXCLUDED.sku,barcode=EXCLUDED.barcode,
        brand=EXCLUDED.brand,brand_id=EXCLUDED.brand_id,category=EXCLUDED.category,
        price=EXCLUDED.price,old_price=EXCLUDED.old_price,stock=EXCLUDED.stock,state=EXCLUDED.state,
        status=EXCLUDED.status,img=EXCLUDED.img,home_featured=EXCLUDED.home_featured,
        search_text=EXCLUDED.search_text,updated_at=EXCLUDED.updated_at,synced_at=EXCLUDED.synced_at`;
      return true;
    }
    if(!supabaseEnabled())throw new Error('product_mirror_storage_not_configured');
    if(product===null){
      const query=new URLSearchParams({namespace:`eq.${namespace}`,id:`eq.${String(productId)}`});
      await supabaseFetch(`/rest/v1/products?${query}`,{method:'DELETE'});
      return true;
    }
    await supabaseFetch('/rest/v1/products',{
      method:'POST',
      headers:{prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(productTableRow(namespace,product))
    });
    return true;
  }catch(error){
    console.warn('product table mirror failed; app_kv is unaffected',error?.message||error);
    return false;
  }
}

/** `product:abc` -> `abc`, and nothing for any other kind of key. */
function productIdFromKey(key){
  const value=String(key||'');
  return value.startsWith('product:')?value.slice('product:'.length):'';
}

class PostgresStoreCompat {
  constructor(namespace){this.namespace=namespace;this.backend='postgres';this.sql=sqlClient();}
  async getWithMetadata(key,options={}){
    const rows=await withStorageRetry(`postgres get metadata ${this.namespace}`,()=>this.sql`
      SELECT value,etag FROM app_kv WHERE namespace=${this.namespace} AND key=${String(key)} LIMIT 1`);
    const row=rows?.[0];if(!row)return null;
    return {data:options.type==='json'||options.type===undefined?row.value:JSON.stringify(row.value),etag:row.etag||null};
  }
  async get(key,options={}){
    const row=await this.getWithMetadata(key,options);
    return row?.data??null;
  }
  async setJSON(key,value,options={}){
    const expected=options.onlyIfMatch||null;
    const onlyIfNew=options.onlyIfNew===true;
    const rows=await withStorageRetry(`postgres set ${this.namespace}`,()=>this.sql`
      SELECT * FROM app_kv_set(${this.namespace},${String(key)},${this.sql.json(value)},${expected},${onlyIfNew})`);
    const row=rows?.[0]||{};
    const modified=row.modified===true;
    const productId=modified?productIdFromKey(key):'';
    if(productId)await writeProductTable(this.namespace,productId,value);
    return {modified,etag:row.new_etag||null};
  }
  async delete(key){
    await withStorageRetry(`postgres delete ${this.namespace}`,()=>this.sql`
      DELETE FROM app_kv WHERE namespace=${this.namespace} AND key=${String(key)}`);
    const productId=productIdFromKey(key);
    if(productId)await writeProductTable(this.namespace,productId,null);
    return true;
  }
  async listPrefix(prefix,{limit=20000}={}){
    const max=Math.min(50000,Math.max(1,Number(limit)||20000));
    const pattern=`${String(prefix)}%`;
    const rows=await withStorageRetry(`postgres list ${this.namespace}`,()=>this.sql`
      SELECT key,value,etag FROM app_kv
      WHERE namespace=${this.namespace} AND key LIKE ${pattern}
      ORDER BY updated_at DESC,key ASC LIMIT ${max}`);
    return Array.from(rows||[]);
  }
}

class SupabaseStoreCompat {
  constructor(namespace){this.namespace=namespace;this.backend='supabase-postgres';}
  async getWithMetadata(key,options={}){
    const query=new URLSearchParams({select:'value,etag',namespace:`eq.${this.namespace}`,key:`eq.${String(key)}`,limit:'1'});
    const rows=await withStorageRetry(`supabase get metadata ${this.namespace}`,()=>supabaseFetch(`/rest/v1/app_kv?${query}`));
    const row=rows?.[0];if(!row)return null;
    return {data:options.type==='json'||options.type===undefined?row.value:JSON.stringify(row.value),etag:row.etag||null};
  }
  async get(key,options={}){
    const query=new URLSearchParams({select:'value,etag',namespace:`eq.${this.namespace}`,key:`eq.${String(key)}`,limit:'1'});
    const rows=await withStorageRetry(`supabase get ${this.namespace}`,()=>supabaseFetch(`/rest/v1/app_kv?${query}`));
    const row=rows?.[0]; if(!row)return null;
    return options.type==='json'||options.type===undefined?row.value:JSON.stringify(row.value);
  }
  async setJSON(key,value,options={}){
    const payload={p_namespace:this.namespace,p_key:String(key),p_value:value,p_expected_etag:options.onlyIfMatch||null,p_only_if_new:options.onlyIfNew===true};
    const rows=await withStorageRetry(`supabase set ${this.namespace}`,()=>supabaseFetch('/rest/v1/rpc/app_kv_set',{method:'POST',body:JSON.stringify(payload)}));
    const row=Array.isArray(rows)?rows[0]:rows;
    const modified=row?.modified===true;
    // Every product write in the application ends up here — there are three
    // dozen call sites in api.js alone, and hooking each one would mean the
    // next one added is the one that silently stops mirroring. Only a write
    // that actually changed something is mirrored: a conditional write that
    // lost its race changed nothing to copy.
    const productId=modified?productIdFromKey(key):'';
    if(productId)await writeProductTable(this.namespace,productId,value);
    return {modified,etag:row?.new_etag||null};
  }
  async delete(key){
    const query=new URLSearchParams({namespace:`eq.${this.namespace}`,key:`eq.${String(key)}`});
    await withStorageRetry(`supabase delete ${this.namespace}`,()=>supabaseFetch(`/rest/v1/app_kv?${query}`,{method:'DELETE'}));
    const productId=productIdFromKey(key);
    if(productId)await writeProductTable(this.namespace,productId,null);
    return true;
  }
  async listPrefix(prefix,{limit=20000}={}){
    const out=[]; const pageSize=1000; const max=Math.min(50000,Math.max(1,Number(limit)||20000));
    while(out.length<max){
      const query=new URLSearchParams({select:'key,value,etag',namespace:`eq.${this.namespace}`,key:`like.${String(prefix).replace(/[%_*]/g,'\\$&')}*`,order:'updated_at.desc,key.asc',limit:String(Math.min(pageSize,max-out.length)),offset:String(out.length)});
      const rows=await withStorageRetry(`supabase list ${this.namespace}`,()=>supabaseFetch(`/rest/v1/app_kv?${query}`));
      out.push(...(rows||[])); if(!rows||rows.length<pageSize)break;
    }
    return out;
  }
}

const cache=new Map();
export function storageBackend(){
  const forced=String(process.env.COMMERCE_STORAGE||'').trim().toLowerCase();
  if(forced==='postgres')return postgresEnabled()?'postgres':'not-configured';
  if(forced==='supabase')return supabaseEnabled()?'supabase-postgres':'not-configured';
  if(postgresEnabled())return 'postgres';
  if(supabaseEnabled())return 'supabase-postgres';
  return 'not-configured';
}
export function persistentStore(namespace){
  const backend=storageBackend();
  if(backend==='not-configured')throw new Error('commerce_storage_not_configured');
  const key=`${backend}:${namespace}`;
  if(!cache.has(key)) cache.set(key,backend==='postgres'?new PostgresStoreCompat(namespace):new SupabaseStoreCompat(namespace));
  return cache.get(key);
}
export function rawBlobStore(namespace){ return persistentStore(namespace); }
