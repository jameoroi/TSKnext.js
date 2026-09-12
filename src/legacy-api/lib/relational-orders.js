import { database, postgresEnabled } from './storage.js';

const ORDER_STATUSES = new Set([
  'pending_payment','awaiting_verification','new','paid','processing',
  'packing','shipped','completed','cancelled','refunded','expired',
]);
const PAID_STATUSES = new Set(['paid','processing','packing','shipped','completed']);

function tenantIdFromNamespace(namespace){
  const value=String(namespace||'').trim();
  return value.endsWith('-data')?value.slice(0,-5):value;
}
function satang(value){
  const n=Number(value);
  return Number.isFinite(n)?Math.round(n*100):0;
}
function baht(value){
  const n=Number(value);
  return Number.isFinite(n)?n/100:0;
}
function statusOf(value){
  const status=String(value||'new');
  return ORDER_STATUSES.has(status)?status:'new';
}
function bool(value){return value===true||value==='true'||value===1||value==='1';}

export function relationalOrderMirrorEnabled(){
  return postgresEnabled() && String(process.env.RELATIONAL_ORDER_MIRROR||'1')!=='0';
}
export function relationalOrderReadsEnabled(){
  return postgresEnabled() && String(process.env.RELATIONAL_ORDER_READS||'1')!=='0';
}
export function relationalReportReadsEnabled(){
  return postgresEnabled() && String(process.env.RELATIONAL_REPORT_READS||'1')!=='0';
}

/**
 * Keep the relational order projection in sync with the full compatibility
 * document. `payload` preserves fields the narrow relational core does not own
 * yet (variants, agent metadata, tax invoice, tracking, bundle data, etc.).
 * The projection is therefore useful for fast reads/reports without throwing
 * away the richer commerce contract during cutover.
 */
export async function mirrorOrderProjection(namespace, order){
  if(!relationalOrderMirrorEnabled()||!order?.id)return false;
  const tenantId=tenantIdFromNamespace(namespace);
  if(!tenantId)return false;
  const sql=database().sql;
  const items=Array.isArray(order.items)?order.items:[];
  const createdAt=order.created_at||new Date().toISOString();
  const updatedAt=order.updated_at||new Date().toISOString();
  try{
    await sql.begin(async tx=>{
      await tx`INSERT INTO orders (
        tenant_id,id,order_no,status,customer_id,name,phone,address,province,zip,
        subtotal_satang,discount_satang,shipping_satang,total_satang,payment_method,
        payment_status,coupon_code,agent_code,stock_reserved,stock_deducted,
        reservation_expires_at,idempotency_key,status_history,payload,created_at,updated_at
      ) VALUES (
        ${tenantId},${String(order.id)},${String(order.order_no||order.id)},${statusOf(order.status)},
        ${order.customer_id?String(order.customer_id):null},${order.name?String(order.name):null},${order.phone?String(order.phone):null},
        ${order.address?String(order.address):null},${order.province?String(order.province):null},${order.zip?String(order.zip):null},
        ${satang(order.subtotal)},${satang(order.discount)},${satang(order.shipping)},${satang(order.total)},
        ${order.payment_method?String(order.payment_method):null},${String(order.payment_status||'unpaid')},
        ${order.coupon_code?String(order.coupon_code):null},${order.agent_code?String(order.agent_code):null},
        ${bool(order.stock_reserved)},${bool(order.stock_deducted)},${order.reservation_expires_at||null},
        ${order.idempotency_key?String(order.idempotency_key):null},${tx.json(Array.isArray(order.status_history)?order.status_history:[])},
        ${tx.json(order)},${createdAt},${updatedAt}
      ) ON CONFLICT (tenant_id,id) DO UPDATE SET
        order_no=EXCLUDED.order_no,status=EXCLUDED.status,customer_id=EXCLUDED.customer_id,
        name=EXCLUDED.name,phone=EXCLUDED.phone,address=EXCLUDED.address,province=EXCLUDED.province,zip=EXCLUDED.zip,
        subtotal_satang=EXCLUDED.subtotal_satang,discount_satang=EXCLUDED.discount_satang,
        shipping_satang=EXCLUDED.shipping_satang,total_satang=EXCLUDED.total_satang,
        payment_method=EXCLUDED.payment_method,payment_status=EXCLUDED.payment_status,
        coupon_code=EXCLUDED.coupon_code,agent_code=EXCLUDED.agent_code,
        stock_reserved=EXCLUDED.stock_reserved,stock_deducted=EXCLUDED.stock_deducted,
        reservation_expires_at=EXCLUDED.reservation_expires_at,idempotency_key=EXCLUDED.idempotency_key,
        status_history=EXCLUDED.status_history,payload=EXCLUDED.payload,updated_at=EXCLUDED.updated_at`;

      await tx`DELETE FROM order_items WHERE tenant_id=${tenantId} AND order_id=${String(order.id)}`;
      for(let index=0;index<items.length;index++){
        const item=items[index]||{};
        const qty=Math.max(1,Math.trunc(Number(item.qty??item.quantity??1)||1));
        const unit=Number(item.price??item.unit_price??0)||0;
        await tx`INSERT INTO order_items (
          tenant_id,order_id,line_no,product_id,sku,name,unit_price_satang,quantity,line_total_satang,payload
        ) VALUES (
          ${tenantId},${String(order.id)},${index+1},${String(item.id||item.product_id||item.sku||`line-${index+1}`)},
          ${item.sku?String(item.sku):null},${String(item.name||item.sku||'สินค้า')},${satang(unit)},${qty},${satang(unit*qty)},${tx.json(item)}
        )`;
      }
    });
    return true;
  }catch(error){
    console.warn('relational order projection failed',error?.message||error);
    return false;
  }
}

function canonicalOrder(row,items=[]){
  const payload=row?.payload&&typeof row.payload==='object'&&!Array.isArray(row.payload)?row.payload:{};
  return {
    ...payload,
    id:String(row.id),
    order_no:String(row.order_no),
    status:String(row.status),
    customer_id:row.customer_id||payload.customer_id||null,
    name:row.name??payload.name??'',
    phone:row.phone??payload.phone??'',
    address:row.address??payload.address??'',
    province:row.province??payload.province??'',
    zip:row.zip??payload.zip??'',
    subtotal:baht(row.subtotal_satang),
    discount:baht(row.discount_satang),
    shipping:baht(row.shipping_satang),
    total:baht(row.total_satang),
    payment_method:row.payment_method??payload.payment_method??'',
    payment_status:row.payment_status??payload.payment_status??'unpaid',
    coupon_code:row.coupon_code??payload.coupon_code??'',
    agent_code:row.agent_code??payload.agent_code??'',
    stock_reserved:Boolean(row.stock_reserved),
    stock_deducted:Boolean(row.stock_deducted),
    reservation_expires_at:row.reservation_expires_at??payload.reservation_expires_at??null,
    status_history:Array.isArray(row.status_history)?row.status_history:(payload.status_history||[]),
    created_at:row.created_at instanceof Date?row.created_at.toISOString():String(row.created_at||payload.created_at||''),
    updated_at:row.updated_at instanceof Date?row.updated_at.toISOString():String(row.updated_at||payload.updated_at||''),
    items:items.length?items:(Array.isArray(payload.items)?payload.items:[]),
  };
}

export async function readRelationalOrders(tenantId,options={}){
  if(!relationalOrderReadsEnabled()||!tenantId)return [];
  const db=database();
  const params=[String(tenantId)];
  const where=['tenant_id=$1'];
  if(options.customerId){params.push(String(options.customerId));where.push(`customer_id=$${params.length}`);}
  if(options.excludePendingPayment)where.push(`status<>'pending_payment'`);
  if(options.from){params.push(String(options.from));where.push(`created_at >= $${params.length}::date`);}
  if(options.to){params.push(String(options.to));where.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`);}
  const limit=Math.max(0,Math.min(20000,Number(options.limit??300)||0));
  const sqlText=`SELECT * FROM orders WHERE ${where.join(' AND ')} ORDER BY created_at DESC${limit?` LIMIT ${limit}`:''}`;
  const result=await db.pool.query(sqlText,params);
  if(!result.rows.length)return [];
  const ids=result.rows.map(row=>String(row.id));
  const itemRows=await db.pool.query(`SELECT * FROM order_items WHERE tenant_id=$1 AND order_id=ANY($2::text[]) ORDER BY order_id,line_no`,[String(tenantId),ids]);
  const byOrder=new Map();
  for(const row of itemRows.rows){
    const payload=row?.payload&&typeof row.payload==='object'&&!Array.isArray(row.payload)?row.payload:{};
    const item={...payload,id:payload.id||row.product_id,product_id:row.product_id,sku:row.sku||payload.sku||'',name:row.name||payload.name||'',price:baht(row.unit_price_satang),qty:Number(row.quantity||1),quantity:Number(row.quantity||1),line_total:baht(row.line_total_satang)};
    const list=byOrder.get(String(row.order_id))||[];list.push(item);byOrder.set(String(row.order_id),list);
  }
  return result.rows.map(row=>canonicalOrder(row,byOrder.get(String(row.id))||[]));
}

export function summarizeOrderRows(orderRows,rangeFrom,rangeTo,channel=''){
  const status_counts={},daily=new Map(),products=new Map();
  let matched=0,paid_orders=0,units=0,revenue=0,refunds=0,shipping=0,discount=0,cost=0;
  for(const order of orderRows){
    if(!order)continue;
    const day=String(order.created_at||'').slice(0,10);
    if(rangeFrom&&day<rangeFrom)continue;if(rangeTo&&day>rangeTo)continue;
    const source=String(order.channel||order.marketplace_source||'website').toLowerCase();
    if(channel&&channel!=='all'&&source!==channel)continue;
    matched++;status_counts[order.status]=(status_counts[order.status]||0)+1;
    if(order.status==='refunded'){refunds+=Number(order.total||0);continue;}
    if(!PAID_STATUSES.has(order.status))continue;
    paid_orders++;revenue+=Number(order.total||0);shipping+=Number(order.shipping||0);discount+=Number(order.discount||0);
    const d=daily.get(day)||{date:day,orders:0,revenue:0,units:0,profit:0};d.orders++;d.revenue+=Number(order.total||0);
    for(const item of order.items||[]){
      const qty=Math.max(0,Number(item.qty||item.quantity||0));
      const lineRevenue=Math.max(0,Number(item.price||0))*qty;
      const lineCost=Math.max(0,Number(item.cost_price||0))*qty;
      units+=qty;cost+=lineCost;d.units+=qty;d.profit+=lineRevenue-lineCost;
      const key=`${item.id||item.product_id||item.sku}::${item.variant_id||''}`;
      const row=products.get(key)||{product_id:item.id||item.product_id||'',variant_id:item.variant_id||'',name:item.name||'',variant_label:item.variant_label||'',sku:item.sku||'',units:0,revenue:0,cost:0,profit:0};
      row.units+=qty;row.revenue+=lineRevenue;row.cost+=lineCost;row.profit+=lineRevenue-lineCost;products.set(key,row);
    }
    daily.set(day,d);
  }
  const net_sales=Math.max(0,revenue-refunds),gross_profit=Math.max(-999999999,net_sales-shipping-cost),vat_included=net_sales*7/107;
  return {summary:{orders:matched,paid_orders,units,revenue,refunds,net_sales,shipping,discount,cost,gross_profit,margin_percent:net_sales?gross_profit/net_sales*100:0,vat_included,pre_vat:net_sales-vat_included},status_counts,daily:[...daily.values()].sort((a,z)=>a.date.localeCompare(z.date)),top_products:[...products.values()].sort((a,z)=>z.revenue-a.revenue).slice(0,100)};
}

export async function relationalSalesReport(tenantId,{from='',to='',channel='',includePrevious=false}={}){
  if(!relationalReportReadsEnabled()||!tenantId)return null;
  let earliest=from;
  let previousRange=null;
  if(includePrevious&&from&&to){
    const span=Math.max(1,Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000)+1);
    const shift=n=>new Date(Date.parse(`${from}T00:00:00Z`)-n*86400000).toISOString().slice(0,10);
    previousRange={from:shift(span),to:shift(1)};earliest=previousRange.from;
  }
  const rows=await readRelationalOrders(tenantId,{from:earliest||undefined,to:to||undefined,limit:0});
  if(!rows.length)return {empty:true,rows:[]};
  const current=summarizeOrderRows(rows,from,to,String(channel||'').toLowerCase());
  const previous=previousRange?summarizeOrderRows(rows,previousRange.from,previousRange.to,String(channel||'').toLowerCase()):null;
  const ids=[...new Set(current.top_products.map(row=>String(row.product_id||'')).filter(Boolean))];
  if(ids.length){
    try{
      const result=await database().pool.query(`SELECT id,image_url FROM catalog_products WHERE tenant_id=$1 AND id=ANY($2::text[])`,[String(tenantId),ids]);
      const images=new Map(result.rows.map(row=>[String(row.id),String(row.image_url||'')]));
      current.top_products=current.top_products.map(row=>({...row,image_url:images.get(String(row.product_id))||''}));
    }catch{/* image enrichment is optional */}
  }
  return {filters:{from,to,channel:channel||'all'},...current,previous:previous?{...previous,top_products:[]}:null,generated_at:new Date().toISOString(),scanned_orders:rows.length,complete:true,source:'relational'};
}

export async function relationalDashboardMetrics(tenantId,authNamespace){
  if(!relationalOrderReadsEnabled()||!tenantId)return null;
  const db=database();
  const [orders,products,customers]=await Promise.all([
    db.pool.query(`SELECT
      COUNT(*)::int AS orders,
      COUNT(*) FILTER (WHERE created_at::date=CURRENT_DATE)::int AS orders_today,
      COUNT(*) FILTER (WHERE status IN ('new','awaiting_verification'))::int AS pending_orders,
      COALESCE(SUM(total_satang) FILTER (WHERE status IN ('paid','processing','packing','shipped','completed')),0)::bigint AS revenue_satang,
      COALESCE(SUM(total_satang) FILTER (WHERE status IN ('paid','processing','packing','shipped','completed') AND created_at::date=CURRENT_DATE),0)::bigint AS revenue_today_satang
      FROM orders WHERE tenant_id=$1`,[String(tenantId)]),
    db.pool.query(`SELECT COUNT(*)::int AS products, COUNT(*) FILTER (WHERE status='active' AND GREATEST(0,stock-reserved)<=5)::int AS low_stock FROM catalog_products WHERE tenant_id=$1`,[String(tenantId)]),
    authNamespace?db.pool.query(`SELECT COUNT(*)::int AS customers FROM app_kv WHERE namespace=$1 AND key LIKE 'customer:%'`,[String(authNamespace)]):Promise.resolve({rows:[{customers:0}]})
  ]);
  const o=orders.rows[0]||{},p=products.rows[0]||{},c=customers.rows[0]||{};
  return {products:Number(p.products||0),customers:Number(c.customers||0),orders:Number(o.orders||0),orders_today:Number(o.orders_today||0),pending_orders:Number(o.pending_orders||0),low_stock:Number(p.low_stock||0),revenue:baht(o.revenue_satang),revenue_today:baht(o.revenue_today_satang),scanned_orders:Number(o.orders||0),complete:true,source:'relational'};
}
