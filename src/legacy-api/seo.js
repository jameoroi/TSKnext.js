import { persistentStore } from './lib/storage.js';
import { resolveTenant, tenantNamespaces } from './lib/tenants.js';

const PUBLIC_PAGES = [
  '/', '/products.html', '/about.html', '/news.html', '/videos.html', '/contact.html',
  '/privacy.html', '/terms.html', '/returns.html'
];

function originFrom(req){
  const u=new URL(req.url);
  // The request host is authoritative so preview and custom domains never
  // leak a different environment into canonical URLs or robots.txt.
  return u.origin;
}
function xml(value){return String(value??'').replace(/[<>&"']/g,ch=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[ch]));}
async function getJSON(store,key){try{return await store.get(key,{type:'json',consistency:'strong'});}catch{return null;}}

/** Every row under one key prefix, paged around the database's row cap. */
async function listByPrefix(store,prefix,limit){
  try{ return (await store.listPrefix(prefix,{limit})).map((row)=>row.value).filter(Boolean); }
  catch(error){ console.warn('[TSK] sitemap prefix read failed',prefix,error?.message||error); return []; }
}

// The sitemaps protocol allows 50,000 URLs per file.
const URLS_PER_FILE=50000;
// Ceilings so one crawl cannot walk an unbounded catalogue inside a single
// request; a shop past these has outgrown a generated sitemap.
const MAX_PRODUCT_URLS=50000;
const MAX_TAXONOMY_URLS=5000;
function entry(origin,path,lastmod,priority='0.7',changefreq='weekly'){return `  <url><loc>${xml(origin+path)}</loc><lastmod>${xml(lastmod)}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;}

export default async (req) => {
  const url=new URL(req.url); const origin=originFrom(req);
  if(url.pathname.endsWith('/robots.txt') || url.searchParams.get('type')==='robots'){
    const body=`User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /admin-settings.html\nDisallow: /inventory.html\nDisallow: /reports.html\nDisallow: /account.html\nDisallow: /cart.html\nDisallow: /checkout.html\nDisallow: /login.html\nDisallow: /verify-payment.html\n\nSitemap: ${origin}/sitemap.xml\n`;
    return new Response(body,{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'public, max-age=3600'}});
  }
  const lastmod=new Date().toISOString().slice(0,10),urls=[];
  // Keep the public route deterministic and fast. Dynamic catalog expansion
  // is opt-in because an unavailable/slow storage backend must never make a
  // crawler wait for a platform timeout.
  let store=null;
  const dynamicCatalog=String(process.env.SITEMAP_DYNAMIC_CATALOG||'').toLowerCase()==='true';
  // The catalogue in a sitemap must be the catalogue of the shop whose domain
  // was asked. Reading a fixed namespace published one merchant's product URLs
  // under every merchant's domain — and under any unrecognised host too.
  const tenant=resolveTenant(url.hostname);
  if(dynamicCatalog&&tenant){
    try{ store=persistentStore(tenantNamespaces(tenant).data); }catch(error){ console.warn('[TSK] sitemap dynamic catalog unavailable',error?.message||error); }
  }
  PUBLIC_PAGES.forEach((path,index)=>urls.push(entry(origin,path,lastmod,index===0?'1.0':'0.7',index===0?'daily':'weekly')));
  if(store){
    // `listPrefix` pages around the 1,000-row cap the database applies to any
    // one response. Reading the id index and then fetching each product one at
    // a time was both capped at 5,000 and one round trip per product.
    const products=await listByPrefix(store,'product:',MAX_PRODUCT_URLS);
    for(const p of products){
      if(!p?.id||['hidden','discontinued'].includes(p.state))continue;
      urls.push(entry(origin,`/product.html?id=${encodeURIComponent(p.id)}`,String(p.updated_at||p.created_at||lastmod).slice(0,10),'0.9','daily'));
    }
    for(const c of await listByPrefix(store,'category:',MAX_TAXONOMY_URLS)){
      if(c?.name)urls.push(entry(origin,`/products.html?category=${encodeURIComponent(c.id||c.slug||c.name)}`,String(c.updated_at||lastmod).slice(0,10),'0.8','weekly'));
    }
    for(const brand of await listByPrefix(store,'brand:',MAX_TAXONOMY_URLS)){
      if(brand?.name)urls.push(entry(origin,`/products.html?brand=${encodeURIComponent(brand.id||brand.slug||brand.name)}`,String(brand.updated_at||lastmod).slice(0,10),'0.8','weekly'));
    }
  }

  // The sitemaps protocol allows 50,000 URLs in one file. Past that a crawler
  // is meant to be given an index naming several files; a single oversized
  // file is rejected outright, so a shop that grew past the limit would have
  // gone from a partial sitemap to no sitemap at all.
  const pages=Math.max(1,Math.ceil(urls.length/URLS_PER_FILE));
  const requestedPage=Math.max(1,Math.min(pages,Number(url.searchParams.get('page')||1)||1));
  if(pages>1&&!url.searchParams.get('page')){
    const files=Array.from({length:pages},(unused,i)=>
      `  <sitemap><loc>${xml(`${origin}/sitemap.xml?page=${i+1}`)}</loc><lastmod>${xml(lastmod)}</lastmod></sitemap>`);
    const index=`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files.join('\n')}\n</sitemapindex>\n`;
    return new Response(index,{headers:{'content-type':'application/xml; charset=utf-8','cache-control':'public, max-age=3600'}});
  }
  const pageUrls=pages>1?urls.slice((requestedPage-1)*URLS_PER_FILE,requestedPage*URLS_PER_FILE):urls;
  const body=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pageUrls.join('\n')}\n</urlset>\n`;
  return new Response(body,{headers:{'content-type':'application/xml; charset=utf-8','cache-control':'public, max-age=3600'}});
};
