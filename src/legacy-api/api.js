import { persistentStore, storageBackend, postgresEnabled, supabaseEnabled, rawBlobStore, database, mirrorJSON, unmirrorJSON } from './lib/storage.js';
import { mirrorOrderProjection, readRelationalOrders, relationalSalesReport, relationalDashboardMetrics, relationalOrderReadsEnabled, relationalReportReadsEnabled } from './lib/relational-orders.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { FALLBACK_TENANT, resolveTenant, tenantNamespaces, tenantRegistry } from './lib/tenants.js';
import crypto from 'node:crypto';
import { EVENT_TYPES, aggregateEvents } from './lib/analytics.js';
import { generateInsights, chatFallback } from './lib/ai-insights.js';
import { mediaConfigured, presignUpload, commitMedia, deleteMedia, listMedia, storeInlineImage, mediaKeyFromUrl, isOwnMedia } from './lib/media.js';
import { turnstileToken, verifyTurnstile } from './lib/turnstile.js';
import { recentFailures, recordFailure } from './lib/error-log.js';
import { edgeCacheMatch, edgeCachePut } from './lib/edge-cache.js';
import { DEFAULT_AGENT_LEVELS, normalizeAgentLevels, agentLevelStanding, effectiveCommissionRate, cleanRate } from '../shared/agent-levels.mjs';
import { HIDDEN_STATES } from '../shared/product-visibility.mjs';
import { verifyKitQuote } from '../shared/kit-quote.mjs';
import { isSlipAmountMatching } from '../shared/slip-amount.mjs';
import { purgePages, SETTINGS_PAGES } from '../shared/page-purge.mjs';
import { GROUPS as CSV_GROUPS, COLUMNS as CSV_COLUMNS, ALL_COLUMNS as CSV_ALL_COLUMNS, ANCHOR_COLUMNS as CSV_ANCHOR_COLUMNS, groupColumns as csvGroupColumns, productsToCsv, parseCsv, parseCell, cellChanged, renderCell as csvRenderCell } from './lib/product-csv.js';
import {
  DEFAULT_WAREHOUSE,
  findProductVariant,
  inventoryVariantRemovalBlockers,
  normalizeLevel,
  normalizeProductInventory,
  publicVariant,
  syncProductAggregates,
  variantAvailable
} from './lib/inventory-model.js';


// Which merchant this request belongs to.
//
// AsyncLocalStorage rather than a module-level variable: a Worker isolate
// serves several requests at once and they interleave at every `await`, so a
// shared mutable "current tenant" would hand one merchant another merchant's
// orders. The store is bound once per request in the handler below and every
// dataStore()/authStore() call inside that request reads it — which is why the
// ~160 existing call sites did not have to change.
const tenantContext = new AsyncLocalStorage();


function activeTenant() {
  return tenantContext.getStore() || FALLBACK_TENANT;
}
const authStore = () => persistentStore(tenantNamespaces(activeTenant()).auth);
const dataStore = () => persistentStore(tenantNamespaces(activeTenant()).data);
// Direct SQL, PostgREST and raw-blob paths cannot go through dataStore(), so
// they need the namespace itself. Reading it from the request-scoped tenant is
// what keeps one merchant's catalogue out of another's queries.
const dataNamespace = () => tenantNamespaces(activeTenant()).data;
const SESSION_COOKIE = 'tsk_session';
// Sessions are persistent and sliding. Active users are renewed at most twice a
// day, so the auth store is not written on every API request.
const MAX_AGE = 60 * 60 * 24 * 30;
const SESSION_REFRESH_AFTER = 60 * 60 * 12;
const AGENT_ATTRIBUTION_COOKIE = 'tsk_agent_attribution';
const AGENT_ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 30;
// How long an order claim stands: long enough to absorb a retry after a
// dropped response, short enough that a customer who genuinely wants the same
// basket again is not refused for the rest of the day.
const ORDER_CLAIM_TTL_MS = 15 * 60 * 1000;
// Supabase caps a PostgREST response at 1,000 rows whatever limit is asked
// for, so this is the page size, not a preference.
const SITEMAP_PAGE_SIZE = 1000;
// The sitemaps protocol allows 50,000 URLs in one file; past that a sitemap
// index listing several files is required.
const SITEMAP_URLS_PER_FILE = 50000;
// A ceiling so a runaway catalogue cannot page forever inside one request.
const SITEMAP_MAX_URLS = 200000;
const DEFAULT_SITE_SETTINGS = {
  site_title:'THAISERKIT SUPPLY | ไทยเซอร์กิจ ซัพพลาย',
  company_name:'THAISERKIT SUPPLY',
  company_subtitle:'ไทยเซอร์กิจ ซัพพลาย',
  logo_data_url:'',
  favicon_data_url:'',
  /*
   * The tracking the shop's own marketing depends on.
   *
   * Ids only — never a script. Everything here is pasted from the provider's
   * own console by the merchant, and each one is rendered into exactly one
   * known snippet by the storefront; nothing a merchant types is ever executed
   * as code. That is why these are strict, short, and shaped: a field that
   * accepted arbitrary text would be a place to paste a <script> tag into a
   * page that takes addresses and payment slips.
   *
   * Empty is the normal state and means the tag is not loaded at all, so a shop
   * that has not set one pays nothing for it.
   */
  marketing:{
    ga4_id:'',
    gtm_id:'',
    meta_pixel_id:'',
    tiktok_pixel_id:'',
    floodlight_advertiser_id:'',
    floodlight_activity_group:'',
    floodlight_activity_tag:'',
    floodlight_bot_activity_group:'',
    floodlight_bot_activity_tag:'',
  },
  // Legal identity, per merchant. These live in the tenant's own settings
  // rather than in deployment environment variables, because every shop on the
  // platform publishes its own registration, address and contact details —
  // sharing one set would put the wrong company's legal name on four storefronts.
  business:{
    legal_name:'',
    registration_number:'',
    tax_id:'',
    street:'',
    locality:'',
    region:'',
    postal_code:'',
    phone:'',
    email:'',
    opening_hours:'',
    opening_hours_spec:'',
  },
  entry_popup:{
    enabled:false,
    image_url:'',
    link_url:'',
    alt_text:'โปรโมชั่นพิเศษจาก THAISERKIT SUPPLY',
    frequency:'session',
    delay_ms:700,
    start_at:'',
    end_at:''
  },
  /**
   * When the flash sale on the home page stops.
   *
   * Empty is the normal state and the honest one: the shelf shows the products
   * the shop has genuinely marked down and says nothing about time. Set a date
   * here and a countdown appears above them.
   *
   * It exists as a setting rather than a constant because a countdown is the
   * one thing on that shelf which cannot be derived from the catalogue. The
   * reductions are real whether or not anybody sets this; a deadline is only
   * real if somebody chose it. An empty string means nobody has, and the clock
   * stays away rather than counting down to midnight tonight because midnight
   * is easy to compute.
   */
  /**
   * What the three home shelves are called.
   *
   * They were written into the page. A shop running a Songkran promotion still
   * had a shelf headed "สินค้าขายดี" because that is what the template said, and
   * changing it meant a deploy. Empty means "use what the page has always
   * said", so a shop that never opens the setting sees no change.
   */
  home_headings: { bestseller: '', flash: '', promotion: '' },
  flash_sale_ends_at: '',
  /*
   * How many products the flash sale shelf holds.
   *
   * Four, written into app/pages/index.vue as `.slice(0, 4)`, which is why the
   * shop's owner could find nowhere to change it: there was nowhere. The shelf
   * is a rail and travels, so more than fit across a screen is not a layout
   * problem — it is simply a longer row.
   */
  flash_sale_count: 4,
  banners: [],
  /**
   * The strip of small promotional panels under the hero.
   *
   * Three or four flat images — a promotion, an opening time, a map, a contact
   * card — each linking somewhere. Same shape as the hero banners, so the same
   * normaliser reads them; they are a separate list because they are a separate
   * row on the page and a merchant changes them on a different rhythm.
   */
  promo_banners: [],
  /**
   * The wide band above the articles, for whatever campaign is running.
   *
   * The strip under the hero fills up with the standing panels — the map, the
   * opening hours, the LINE account — because those have to live somewhere, so
   * a promotion has nowhere to go except by pushing one of them out. This band
   * is the room for it: further down, where a shopper has already been past the
   * shelves, and shaped like the artwork a brand actually supplies, which is
   * one wide letterbox rather than a square panel.
   */
  article_banners: [],
  /**
   * The pictures on the two introduction cards on the home page.
   *
   * They were line-art icons hard-coded into the template — a water drop for
   * the shelf of best sellers, a document for the articles — which nobody but
   * a developer could change, and which said nothing about what this shop
   * sells. A merchant sets a real photograph here instead. Empty renders no
   * picture at all rather than falling back to the icon: a card with a heading
   * and a button is a finished card, and the icon was never the point.
   */
  /* The two introduction cards on the home page, and the photograph of the shop
     on /about — which was a hard-coded stock banner nobody could change. */
  home_cards: { featured_image_url:'', articles_image_url:'', about_image_url:'' },
  theme: {
    dark_1:'#0B2E22', dark_2:'#123A2C', dark_3:'#1E4A39',
    pink:'#E56B9F', pink_light:'#F9D7E6', pink_deep:'#B93F76',
    gold_accent:'#C79A55', gold_soft:'#E8C98D',
    rose_shadow:'#B93F76', gray:'#F7F7F7', border:'#325846',
    font_family:"'Kanit',sans-serif", radius_scale:1
  }
};
const DEFAULT_BUSINESS_SETTINGS = {
  payment: {
    promptpay_id:'',
    promptpay_name:'',
    bank_accounts:[], // [{bank_name, account_name, account_no}]
    bank_transfer_enabled:true,
    cod_enabled:true,
    line_order_enabled:false,
    line_oa_url:'',
    line_oa_name:'LINE Official ร้าน',
    omise_public_key:'', omise_secret_key:''
  },
  email: {
    smtp_host:'', smtp_port:587, smtp_secure:false,
    smtp_user:'', smtp_pass:'',
    from_name:'THAISERKIT SUPPLY', from_email:''
  },
  facebook: {
    page_id:'', page_username:'', page_access_token:'', verify_token:''
  },
  shopee: {
    partner_id:'', partner_key:'', shop_id:'', redirect_url:''
  },
  lazada: {
    app_key:'', app_secret:'', country:'th', redirect_url:''
  },
  notifications: {
    telegram_alert_bot_token:'', telegram_alert_chat_id:'',
    telegram_chat_bot_token:'', telegram_chat_chat_id:'',
    // Kept for deployments that have not moved to the two dedicated pairs yet.
    telegram_bot_token:'', telegram_chat_id:'', order_notify_email:''
  },
  updated_at:null, updated_by:null
};


function json(data, status=200, headers={}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', ...headers } });
}
// Catalog reads are identical for every visitor, so the edge may serve them.
// `stale-while-revalidate` is what keeps the storefront up when the database
// is slow: shoppers get the last good copy while the refresh runs behind them.
// Only ever attach this to responses that do not vary by session.
const PUBLIC_READ_CACHE={'cache-control':'public, max-age=0, s-maxage=120, stale-while-revalidate=600'};
function cookieHeader(token, clear=false){
  return `${SESSION_COOKIE}=${clear ? '' : token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${clear ? 0 : MAX_AGE}`;
}
function attributionCookieHeader(token, clear=false){
  return `${AGENT_ATTRIBUTION_COOKIE}=${clear ? '' : token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${clear ? 0 : AGENT_ATTRIBUTION_MAX_AGE}`;
}
function parseCookies(req){
  const out={};
  for(const p of (req.headers.get('cookie')||'').split(';')){ const i=p.indexOf('='); if(i>0) out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim()); }
  return out;
}
function clean(v,max=1000){ return String(v??'').trim().slice(0,max); }
function cleanPublicUrl(v,max=600){const value=clean(v,max);return /^https:\/\/[^\s]+$/i.test(value)?value:'';}
/** Both card pictures, kept to the same shape and size limit as the logo. */
function normalizeHomeCards(input,current=DEFAULT_SITE_SETTINGS.home_cards){
  const source=input&&typeof input==='object'?input:{};
  const fallback=current&&typeof current==='object'?current:DEFAULT_SITE_SETTINGS.home_cards;
  const pick=(key)=>clean(source[key]!==undefined?source[key]:fallback[key],2200000);
  return { featured_image_url:pick('featured_image_url'), articles_image_url:pick('articles_image_url'), about_image_url:pick('about_image_url') };
}
function normalizeEntryPopup(input,current=DEFAULT_SITE_SETTINGS.entry_popup){
  const source=input&&typeof input==='object'?input:{},fallback=current&&typeof current==='object'?current:DEFAULT_SITE_SETTINGS.entry_popup;
  const rawImage=clean(source.image_url!==undefined?source.image_url:fallback.image_url,6000000);
  const image_url=/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(rawImage)?rawImage:cleanPublicUrl(rawImage,1600);
  const rawLink=clean(source.link_url!==undefined?source.link_url:fallback.link_url,1200);
  const link_url=(cleanPublicUrl(rawLink,1200)||(/^(?:[a-z0-9][a-z0-9._-]*\.html(?:\?[a-z0-9_=&%+.,:-]*)?|\/(?!\/)[a-z0-9_\-./]*(?:\?[a-z0-9_=&%+.,:-]*)?)$/i.test(rawLink)?rawLink:'')).replace(/^https?:\/\/thaiserxtra\.pages\.dev/i,'https://jayxtsk.shop');
  const frequency=['session','daily','always'].includes(source.frequency)?source.frequency:(['session','daily','always'].includes(fallback.frequency)?fallback.frequency:'session');
  const dateValue=(value)=>{const out=clean(value,40);return !out||!Number.isNaN(Date.parse(out))?out:'';};
  return {
    enabled:source.enabled!==undefined?source.enabled===true:fallback.enabled===true,
    image_url,
    link_url,
    alt_text:clean(source.alt_text!==undefined?source.alt_text:fallback.alt_text,180)||DEFAULT_SITE_SETTINGS.entry_popup.alt_text,
    frequency,
    delay_ms:Math.min(10000,Math.max(0,Number(source.delay_ms!==undefined?source.delay_ms:fallback.delay_ms)||0)),
    start_at:dateValue(source.start_at!==undefined?source.start_at:fallback.start_at),
    end_at:dateValue(source.end_at!==undefined?source.end_at:fallback.end_at)
  };
}
/**
 * A form of a string that survives the ways Thai shoppers actually type.
 *
 * Search matched the raw text, so "ปั้มน้ำ" found nothing while "ปั๊มน้ำ" found
 * everything — the tone mark is the single most common thing people get wrong,
 * and a shop with a thousand products cannot afford to answer "not found" to a
 * customer who is holding their wallet. Tone marks and the mai taikhu are
 * dropped, spacing and punctuation with them; vowels stay, because removing
 * those would start matching unrelated words.
 */
const THAI_TONE_MARKS=/[็-๎]/g;
/**
 * Thai searches skip the database's literal `ilike` entirely.
 *
 * Falling back only when a search found nothing was not enough: "ปั้ม" matches
 * one product that happens to be misspelled the same way, so the literal path
 * returned that single row and the shopper never saw the other 181 pumps. A
 * query written in Thai has to be compared without tone marks from the start.
 */
const THAI_TEXT=/[฀-๿]/;
function hasThai(value){ return THAI_TEXT.test(String(value||'')); }
function searchKey(value){
  return String(value||'').toLowerCase().replace(THAI_TONE_MARKS,'').replace(/[\s\-_.,/()[\]]+/g,'');
}
/** Common Thai spellings for the brands and product words shoppers type. */
const SEARCH_ALIASES = new Map([
  ['มิลวอกี', 'milwaukee'], ['มิลวอกี้', 'milwaukee'], ['มิลวอคกี้', 'milwaukee'],
  ['ดีวอลท์', 'dewalt'], ['ดีวอลต์', 'dewalt'], ['เดวอลท์', 'dewalt'], ['เดวอลต์', 'dewalt'],
  ['มากีต้า', 'makita'], ['มาคิต้า', 'makita'], ['มาคีต้า', 'makita'],
  ['สแตนเล่ย์', 'stanley'], ['สแตนลีย์', 'stanley'], ['สแตนลี่ย์', 'stanley'],
  ['บ๊อช', 'bosch'], ['บอช', 'bosch'], ['ฮิตาชิ', 'hitachi'], ['ฮอนด้า', 'honda'],
  ['มิตซูบิชิ', 'mitsubishi'], ['มิซูบิชิ', 'mitsubishi'], ['พัมพ์กิ้น', 'pumpkin'],
  ['ปั้ม', 'ปั๊ม'], ['ปั๊ม', 'pump'], ['สว่านโรตารี่', 'rotary hammer'],
  ['เครื่องฉีดน้ำ', 'pressure washer'], ['ตัดหญ้า', 'trimmer'], ['เจียร', 'grinder'],
]);
function searchTermVariants(value){
  const key=searchKey(value);
  if(!key)return [];
  const variants=[key];
  for(const [thai,alias] of SEARCH_ALIASES){
    if(key===searchKey(thai)||key.includes(searchKey(thai))) variants.push(searchKey(alias));
  }
  return [...new Set(variants)];
}
function searchTerms(rawQuery){
  return String(rawQuery||'').trim().split(/\s+/).flatMap(searchTermVariants).filter(Boolean);
}
function searchTermGroups(rawQuery){
  return String(rawQuery||'').trim().split(/\s+/).map(searchTermVariants).filter(group=>group.length);
}
/** True when every word the shopper typed appears somewhere in the product. */
function matchesSearch(product,rawQuery){
  const groups=searchTermGroups(rawQuery);
  if(!groups.length)return true;
  const variants=normalizeProductInventory(product).variants||[];
  const haystack=searchKey([
    product.name,product.sku,product.barcode,product.brand,product.category,
    ...variants.map(v=>`${v.sku||''} ${v.barcode||''} ${v.label||''}`)
  ].join(' '));
  return groups.every(group=>group.some(term=>haystack.includes(term)));
}

/**
 * How close two pieces of text are, counted the way Postgres counts it.
 *
 * A literal comparison has no notion of "nearly". One transposed letter in
 * "maktia", one tone mark too few in "ปั้ม", and a shop holding one hundred and
 * eighty pumps tells the shopper it stocks none — the most expensive answer
 * this API can give. Both the database path and the in-memory one now fall back
 * to similarity when the literal match finds nothing, and the two have to agree
 * on what "similar" means, or the same word would find different products
 * depending on which storage backend answered the request.
 *
 * So this is pg_trgm's definition, deliberately: the string is padded, cut into
 * three-character runs, and scored shared / (a + b - shared) — the same unit and
 * the same floor as the SQL in queryProductsPostgres, which is what the
 * trigram indexes added in 20260901120000 are there to serve.
 */
function trigramSet(value){
  const text=`  ${String(value||'')} `;
  const out=new Set();
  for(let i=0;i+3<=text.length;i++)out.add(text.slice(i,i+3));
  return out;
}
function trigramSimilarity(a,b){
  const left=trigramSet(a),right=trigramSet(b);
  if(!left.size||!right.size)return 0;
  let shared=0; for(const gram of left)if(right.has(gram))shared++;
  return shared/(left.size+right.size-shared);
}
/** Below this a "match" is noise. Same number as the floor used in SQL. */
const SEARCH_SIMILARITY_FLOOR=0.3;
/**
 * The expression the database scores a fuzzy search against.
 *
 * Written once because it has to match app_kv_product_search_trgm_idx exactly —
 * an index on an expression is only usable by a query that repeats that
 * expression character for character, and a copy that drifts silently turns the
 * search back into a full scan of the catalogue.
 */
const SEARCH_TEXT_SQL=`LOWER(COALESCE(value->>'name','') || ' ' || COALESCE(value->>'sku','') || ' ' || COALESCE(value->>'brand',''))`;
/**
 * The words a fuzzy search is scored against — name, sku and brand, as in SQL.
 *
 * Word by word, not as one blob: a product card carries far more text than the
 * word a shopper types, and scoring the whole card at once puts every real
 * match near zero simply because the card says more. Postgres has a function
 * for exactly this — `word_similarity`, the best-matching run of text — and the
 * SQL path above asks for that one, not plain `similarity`.
 */
function searchTokens(product){
  const text=[product?.name,product?.sku,product?.brand,product?.category].filter(Boolean).join(' ');
  return { blob:searchKey(text), words:text.split(/\s+/).map(searchKey).filter(Boolean) };
}
/**
 * The products close enough to what was typed, best first.
 *
 * Every word is scored on its own and the weakest word decides the product, so
 * "makita ดริล" cannot pass on the strength of the brand alone.
 */
function fuzzySearch(products,rawQuery){
  const groups=searchTermGroups(rawQuery);
  if(!groups.length)return products;
  const scored=[];
  for(const product of products){
    const {blob,words}=searchTokens(product);
    if(!blob)continue;
    let worst=1;
    for(const group of groups){
      let score=0;
      for(const term of group){
        let variantScore=blob.includes(term)?1:0;
        // A long Thai phrase must not match one generic fragment inside it:
        // "เครื่องซักผ้า" used to match every product containing "เครื่อง".
        // A real typo stays roughly the same length as the word it meant.
        if(variantScore<1)for(const word of words){
          if(hasThai(term)&&word.length<term.length-3)continue;
          const value=trigramSimilarity(term,word);if(value>variantScore)variantScore=value;
        }
        if(hasThai(term)&&term.length>=8&&!blob.includes(term)&&trigramSimilarity(term,blob)<0.12)variantScore=0;
        if(variantScore>score)score=variantScore;
      }
      if(score<worst)worst=score;
      if(worst<SEARCH_SIMILARITY_FLOOR)break;
    }
    if(worst>=SEARCH_SIMILARITY_FLOOR)scored.push({worst,product});
  }
  scored.sort((a,z)=>z.worst-a.worst||String(a.product.name||'').localeCompare(String(z.product.name||''),'th'));
  return scored.map(row=>row.product);
}

/** The three kinds of written content the home page shows. */
const CONTENT_KINDS=new Set(['news','article','video']);
function contentKind(value){ const kind=clean(value,20).toLowerCase(); return CONTENT_KINDS.has(kind)?kind:''; }
function contentImageReference(row){
  const image=String(row?.image_url||'');
  if(!/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(image))return image;
  const params=new URLSearchParams({action:'content.image',kind:String(row.kind||''),id:String(row.id||'')});
  if(row.updated_at)params.set('v',String(row.updated_at));
  return `/api?${params}`;
}
function isContentImageReference(value,kind,id){
  try{
    const parsed=new URL(String(value||''),'https://content.invalid');
    return parsed.pathname==='/api'
      && parsed.searchParams.get('action')==='content.image'
      && parsed.searchParams.get('kind')===kind
      && parsed.searchParams.get('id')===id;
  }catch{return false;}
}
/** What a visitor is allowed to see — no audit fields, no draft flag. */
function contentPublicView(row){
  return {
    id:row.id, kind:row.kind, title:row.title,
    excerpt:row.excerpt||'', body:row.body||'',
    image_url:contentImageReference(row), video_url:row.video_url||'', link_url:row.link_url||'',
    created_at:row.created_at||null
  };
}
/** Admin lists stay compact too; inline covers are read through content.image. */
function contentAdminView(row){ return {...row,image_url:contentImageReference(row)}; }
function normalizeManagedBanners(input,current=[]){
  const source=Array.isArray(input)?input:(Array.isArray(current)?current:[]);
  return source.slice(0,100).map((item,index)=>{
    const row=item&&typeof item==='object'?item:{};
    const img=clean(row.img!==undefined?row.img:(row.image_url||''),4000000);
    const safeImg=/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(img)?img:cleanPublicUrl(img,1600);
    if(!safeImg)return null;
    const width=Math.min(10000,Math.max(0,Number(row.w||row.width||0)||0))||null;
    const height=Math.min(10000,Math.max(0,Number(row.h||row.height||0)||0))||null;
    return {
      id:clean(row.id,120)||('bn-'+Date.now().toString(36)+'-'+index),
      img:safeImg,
      w:width,
      h:height,
      link_url:(cleanPublicUrl(clean(row.link_url||row.href||'',1200),1200)||'').replace(/^https?:\/\/thaiserxtra\.pages\.dev/i,'https://jayxtsk.shop'),
      alt_text:clean(row.alt_text||row.alt||'แบนเนอร์ THAISERKIT SUPPLY',180)||'แบนเนอร์ THAISERKIT SUPPLY',
      active:row.active!==false,
      updated_at:clean(row.updated_at,40)||new Date().toISOString()
    };
  }).filter(Boolean);
}
/**
 * Any banner still carrying its picture inline is moved to the bucket on save.
 *
 * The admin forms upload first and send an address now, so in normal use every
 * row arrives already pointing at storage and this does nothing. It is here for
 * the rows that were saved before that — re-saving the list converts them — and
 * for any other client that posts base64. One failure does not fail the save:
 * the row keeps the picture it had, which is worse for the payload and correct
 * for the merchant, who would otherwise lose a banner to a storage hiccup.
 */
/**
 * The address a banner's bytes are served from when it still carries them.
 *
 * Site settings are read and server-rendered into every visit to the home page,
 * so one banner stored as base64 made that page a 4 MB document — and made the
 * admin's own fetch of the same record 3.4 MB, which is what put it past the
 * twelve-second client timeout and left the banner editor showing an empty
 * list. The bytes leave the payload the same way the logo's have always left
 * it: an address that fetches them, cached hard by the row's own timestamp.
 */
const BANNER_LISTS={banners:'banners',promo:'promo_banners',article:'article_banners'};
function bannerAddresses(rows,list,version){
  return rows.map(row=>/^data:image\//i.test(String(row.img||''))
    ? {...row,img:`/api?action=site.banner-image&list=${list}&id=${encodeURIComponent(row.id||'')}&v=${version}`}
    : row);
}
/**
 * ...and back again on the way in.
 *
 * A client that was handed an address must not save it as though it were the
 * picture: normalizeManagedBanners would fail to make a public URL of it and
 * drop the row, which is a banner deleted by opening the page and pressing
 * save. Anything still pointing at this endpoint keeps whatever is stored.
 */
function resolveBannerAddresses(rows,current){
  const held=new Map((Array.isArray(current)?current:[]).map(row=>[String(row?.id||''),String(row?.img||'')]));
  return (Array.isArray(rows)?rows:[]).map(row=>{
    const raw=String(row?.img||'');
    if(!raw.startsWith('/api?action=site.banner-image')) return row;
    const id=(raw.match(/[?&]id=([^&]*)/)||[])[1]||'';
    const stored=held.get(decodeURIComponent(id));
    return stored?{...row,img:stored}:row;
  });
}
/**
 * Delete from the bucket what the shop no longer shows.
 *
 * A picture removed in the admin, or replaced by a new upload, used to stay in
 * storage for good: nothing ever referred to it again and nothing ever removed
 * it, so a shop that changes its banner every month accumulated every banner it
 * had ever had, and paid to keep them.
 *
 * It only ever removes an address that is ours, that the incoming record no
 * longer mentions anywhere — every list is checked, not just the one being
 * saved, because the same picture can be used twice — and it never fails the
 * save: a file left in the bucket costs storage, a save refused because a
 * delete failed costs the merchant their work.
 */
async function deleteOrphanedMedia(beforeUrls,afterUrls){
  if(!mediaConfigured()) return 0;
  const kept=new Set(afterUrls.map(value=>String(value||'')).filter(Boolean));
  let removed=0;
  for(const value of new Set(beforeUrls.map(v=>String(v||'')).filter(Boolean))){
    if(kept.has(value)) continue;
    const key=mediaKeyFromUrl(value);
    if(!key) continue;
    try{ await deleteMedia(key); removed++; }
    catch(error){ console.warn('orphaned media left in the bucket',key,error?.message||error); }
  }
  return removed;
}
async function bucketBanners(rows,owner_type,ss){
  const out=[];
  for(const row of rows){
    if(!String(row.img||'').startsWith('data:')){ out.push(row); continue; }
    const stored=await storeInlineImage(row.img,{owner_type,owner_id:row.id||'',created_by:ss?.data?.username||'admin'});
    out.push(stored.ok?{...row,img:stored.url}:row);
  }
  return out;
}

/* Both extra banner rows are capped only by normalizeManagedBanners itself,
   which takes the first hundred. Four was the old ceiling on the strip under
   the hero, from when it was a grid that wrapped rather than a rail that
   travels; twelve replaced it and was still a number this file had picked for a
   merchant rather than one the merchant had picked. Pictures are addresses now,
   not base64, so a hundred of them is about fourteen kilobytes of settings. */
function phone(v){ return String(v??'').replace(/\D+/g,''); }
function sha(v){ return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function random(n=24){ return crypto.randomBytes(n).toString('hex'); }
function hashPassword(password, salt=random(16)){
  const hash=crypto.scryptSync(String(password),salt,64).toString('hex'); return `${salt}:${hash}`;
}
function verifyPassword(password, stored){
  try{ const [salt,hex]=String(stored).split(':'); const a=Buffer.from(hex,'hex'); const b=crypto.scryptSync(String(password),salt,a.length); return a.length===b.length && crypto.timingSafeEqual(a,b); }catch{return false;}
}
async function body(req){ try{return await req.json();}catch{return {};}}
// A transport failure must never be interpreted as "record not found". The
// storage adapter retries transient failures; any final failure is allowed to
// surface as a 5xx so clients can retry without overwriting indexes/users with
// empty data.
async function getJSON(store,key){ return store.get(key,{type:'json',consistency:'strong'}); }

/**
 * The site settings row, read at most once every few seconds per isolate.
 *
 * Measured on production: `site.settings&compact=1` took 2.6 seconds to answer
 * with 11 kB. The compute is not in the answer — it is in getting there. The
 * row holds the logo, the favicon and the entry popup as base64 data URLs, 883
 * kB of them, and every page render fetched and parsed all of it before
 * throwing almost all of it away. Server-side rendering happens on every
 * request, so every visitor paid for that read: the homepage's time to first
 * byte was 2.6–2.9 seconds, of which this was the largest single part.
 *
 * A Worker isolate serves many requests, so holding the parsed row for a few
 * seconds removes the read from almost all of them. Six seconds is chosen to
 * be shorter than anyone editing settings in the admin console would notice —
 * they save, they look, it is there — while still collapsing a burst of
 * traffic onto one read.
 *
 * Keyed by namespace so one merchant's settings can never be served to
 * another, and only ever holds what is already public.
 *
 * This is a plaster over the real problem, which is the shape of the row:
 * images do not belong inside a settings blob that is read on every render.
 * Splitting them out is the fix; see the note in docs/PERFORMANCE-AUDIT.
 */
const SITE_SETTINGS_TTL_MS = 6000;
/**
 * The home shelf changes when a merchant presses แนะนำ, and that press clears
 * this entry — so the window is about how long a *second* console's change
 * takes to appear, not about how stale a shopper's shelf may be. Two minutes.
 */
const FEATURED_SHELF_TTL_MS = 2 * 60 * 1000;
/** Whether a category has anything in it changes on the timescale of an import, not a page view. */
const CATEGORY_COUNT_TTL_MS = 10 * 60 * 1000;

/**
 * A few seconds of memory for the reads every page render makes.
 *
 * Measured from Cloudflare's Hong Kong edge: a Supabase query costs 1–2
 * seconds whatever it asks for — `content.list` returns four rows and 5 kB and
 * still takes a second and a half. The homepage makes five such reads. It
 * already makes them in parallel, which is right, so time to first byte is the
 * slowest of the five: about two seconds, on every single visit, for data that
 * is identical for every visitor and changes when an admin edits it.
 *
 * Holding the answers for six seconds per isolate collapses a burst onto one
 * read each. Six seconds is short enough that an admin saves and sees the
 * change — and every admin write clears the entry outright, so they see it
 * immediately rather than eventually.
 *
 * Keyed by tenant namespace: one merchant must never be handed another's
 * catalogue, and this cache is the obvious place to get that wrong.
 *
 * Only shop-wide public reads belong here. Anything that varies per shopper —
 * a session, a basket, an order — must not be cached, and is not.
 */
const publicReadCache = new Map();
async function cachedPublicRead(name, loader, ttl = SITE_SETTINGS_TTL_MS){
  const key = `${dataNamespace()}:${name}`;
  const hit = publicReadCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await loader();
  publicReadCache.set(key, { value, expires: Date.now() + ttl });
  return value;
}
/** Drops one cached read for this tenant, after a write that changes it. */
function forgetPublicRead(name){ publicReadCache.delete(`${dataNamespace()}:${name}`); }

async function readSiteSettings(store){
  return cachedPublicRead('site-settings', async () => await getJSON(store,'site-settings') || {});
}
/** Called by every path that writes settings, so an edit is visible at once. */
function forgetSiteSettings(){ forgetPublicRead('site-settings'); }

/**
 * Drop the rendered pages that show site settings.
 *
 * `forgetSiteSettings` above clears a Map inside this isolate. What a shopper
 * receives is the rendered HTML, held in `caches.default` and in Cloudflare’s
 * edge cache for `s-maxage=300, stale-while-revalidate=86400` — and neither of
 * those has any idea a setting just changed. An admin deleted a promo banner,
 * the save worked, and the banner stayed on the home page.
 *
 * Never awaited and never able to fail a save: the setting is already stored by
 * the time this runs, and reporting "บันทึกไม่สำเร็จ" because a cache would not
 * clear would tell an admin the opposite of what happened.
 */
async function purgeSettingsPages(req){
  try{
    const origin=new URL(req.url).origin;
    const result=await purgePages(SETTINGS_PAGES,{
      origin,
      token:String(process.env.CLOUDFLARE_API_TOKEN||''),
      zoneId:String(process.env.CLOUDFLARE_ZONE_ID||''),
    });
    // Said out loud when it could not run, because the symptom of a missing
    // token is an edit that does not appear — which reads as a broken save.
    if(!result.ok&&result.reason!=='not_configured')console.warn('page purge failed',result.reason);
    return result;
  }catch(error){ console.warn('page purge failed',error?.message||error); return {ok:false,reason:'failed'}; }
}

/**
 * Change a list-shaped index without losing somebody else's change.
 *
 * Roughly two dozen places did this instead:
 *
 *     const idx = await getJSON(ds,'order-index') || [];
 *     idx.push(id);
 *     await ds.setJSON('order-index', idx);
 *
 * Read, modify, write, with nothing between the read and the write. Two orders
 * placed in the same second both read the same array, both append their own id
 * to it, and the second write overwrites the first — so one order exists as a
 * row but appears in no index. It is invisible in the admin list, missing from
 * the customer's history, absent from every report and from the backup, which
 * walks the index. The order itself is fine; nothing points at it. The same
 * shape governed the product index, the slip index, the payout and commission
 * indices, and the per-customer and per-product order lists.
 *
 * `mutate` receives a copy of the current array and returns the array to
 * store, or null to leave it alone. It may be called more than once: on a lost
 * race the row is re-read and the change reapplied to the newer value, which is
 * why it has to be a function rather than a prepared array.
 */
async function mutateIndexAtomically(store,key,mutate,retries=8){
  for(let attempt=0;attempt<retries;attempt++){
    const entry=await store.getWithMetadata(key,{type:'json',consistency:'strong'});
    const current=Array.isArray(entry?.data)?entry.data:[];
    const next=mutate([...current]);
    if(next===null) return {ok:true,value:current,changed:false};
    // No row yet: onlyIfNew, so a writer that got there first makes us retry
    // against what they wrote rather than erasing it.
    const write=entry
      ? await store.setJSON(key,next,{onlyIfMatch:entry.etag})
      : await store.setJSON(key,next,{onlyIfNew:true});
    if(write?.modified) return {ok:true,value:next,changed:true};
  }
  return {ok:false,error:'index_conflict',value:null,changed:false};
}

/** Append one id to an index. `unique` skips the write when it is already in. */
async function appendToIndex(store,key,id,{unique=true,cap=0}={}){
  return mutateIndexAtomically(store,key,(ids)=>{
    if(unique&&ids.includes(id)) return null;
    ids.push(id);
    if(cap>0&&ids.length>cap) ids.splice(0,ids.length-cap);
    return ids;
  });
}

/** Remove one id from an index. */
async function removeFromIndex(store,key,id){
  return mutateIndexAtomically(store,key,(ids)=>{
    if(!ids.includes(id)) return null;
    return ids.filter((x)=>x!==id);
  });
}
async function currentAgentAttribution(req,ds){
  const token=parseCookies(req)[AGENT_ATTRIBUTION_COOKIE]; if(!token) return null;
  const claim=await getJSON(ds,`agent-attribution:${token}`); if(!claim||Number(claim.expires_at||0)<=Date.now()) return null;
  const agent=await getJSON(ds,`agent:${claim.agent_id}`); if(!agent||agent.status!=='approved'||agent.referral_code!==claim.agent_code) return null;
  return {agent_id:agent.id,agent_code:agent.referral_code,agent_store_name:agent.store_name,expires_at:claim.expires_at};
}
async function claimAgentAttribution(req,ds,agent){
  const existing=await currentAgentAttribution(req,ds); if(existing) return {attribution:existing,headers:{}};
  const token=random(32),expires_at=Date.now()+AGENT_ATTRIBUTION_MAX_AGE*1000;
  const attribution={agent_id:agent.id,agent_code:agent.referral_code,agent_store_name:agent.store_name,expires_at};
  await ds.setJSON(`agent-attribution:${token}`,attribution);
  return {attribution,headers:{'set-cookie':attributionCookieHeader(token)}};
}
async function listJSONByPrefix(store,prefix,indexKey=''){
  if(typeof store.listPrefix==='function'){
    try{return (await store.listPrefix(prefix,{limit:20000})).map(r=>r.value).filter(Boolean);}catch(e){console.warn('prefix query failed',prefix,e?.message||e);}
  }
  const idx=indexKey?(await getJSON(store,indexKey)||[]):[]; const out=[];
  // KV adapters without a native prefix query still need to read the indexed
  // rows, but never make the request wait on one network round trip at a time.
  // A bounded batch keeps storage providers happy while turning an O(n) wait
  // into a handful of parallel reads.
  for(let start=0;start<idx.length;start+=50){
    const rows=await Promise.all(idx.slice(start,start+50).map(id=>getJSON(store,`${prefix}${id}`)));
    out.push(...rows.filter(Boolean));
  }
  return out;
}
/**
 * Look an order up by its human-facing number.
 *
 * Every caller used to walk `order-index` and fetch orders one at a time until
 * it hit a match, so customer order tracking got slower with every sale the
 * shop made and, for a busy shop, would not finish at all. One prefix query
 * returns the candidates; the newest is checked first because that is what
 * someone tracking a parcel is almost always asking about.
 */
async function findOrderByNumber(store,orderNo){
  const wanted=String(orderNo||'').trim();
  if(!wanted)return null;
  const orders=await listJSONByPrefix(store,'order:','order-index');
  for(let i=orders.length-1;i>=0;i--){ if(orders[i]?.order_no===wanted) return orders[i]; }
  return null;
}
async function productIdsFromStore(store){
  const indexed=await getJSON(store,'product-index')||[];
  if(indexed.length)return [...new Set(indexed)];
  // Imported rows may exist before the legacy index is rebuilt. Read actual
  // product keys so an empty index cannot make the catalog look empty.
  return (await listJSONByPrefix(store,'product:')).map(product=>product?.id).filter(Boolean);
}


async function queryProductsSupabase({category='',brandId='',brandName='',brandNames=null,q='',page=1,perPage=60,admin=false}={}){
  const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!base||!secret)return null;
  const params=new URLSearchParams({
    select:'value',namespace:`eq.${dataNamespace()}`,key:'like.product:*',
    order:'updated_at.desc,key.asc',limit:String(perPage),offset:String((Math.max(1,page)-1)*perPage)
  });
  if(!admin)params.set('value->>state','eq.active');
  if(category)params.set('value->>category',`eq.${category}`);
  // Imported catalog rows always carry the brand name, while older managed
  // rows may only carry brand_id. Prefer the name supplied by the storefront;
  // PostgREST ilike is case-insensitive (Makita matches MAKITA).
  //
  // A brand with aliases answers to several names, and PostgREST allows one
  // `or` group per request — which the search below already claims. When both
  // are wanted this gives up and returns null, and the caller falls through to
  // the path that can do both, rather than answering half the question.
  const names=(Array.isArray(brandNames)&&brandNames.length?brandNames:(brandName?[brandName]:[]));
  if(names.length>1&&q)return null;
  if(names.length>1)params.set('or',`(${names.map(n=>`value->>brand.ilike.${n.replace(/[*,()]/g,' ')}`).join(',')})`);
  else if(names.length===1)params.set('value->>brand',`ilike.${names[0]}`);
  else if(brandId)params.set('value->>brand_id',`eq.${brandId}`);
  if(q){
    const safe=q.replace(/[*,()]/g,' ').trim();
    if(safe)params.set('or',`(value->>name.ilike.*${safe}*,value->>sku.ilike.*${safe}*,value->>brand.ilike.*${safe}*)`);
  }
  try{
    const response=await fetch(`${base}/rest/v1/app_kv?${params}`,{headers:{apikey:secret,authorization:`Bearer ${secret}`,prefer:'count=exact'}});
    if(!response.ok)throw new Error(`supabase_catalog_${response.status}`);
    const rows=await response.json(),range=response.headers.get('content-range')||'';
    const total=Number(range.split('/')[1]);
    return {products:(rows||[]).map(row=>row.value).filter(Boolean),total:Number.isFinite(total)?total:(rows||[]).length,source:'supabase'};
  }catch(error){console.warn('supabase catalog query failed; using compatibility fallback',error?.message||error);return null;}
}


/**
 * How many sellable products each category actually holds.
 *
 * Three of the ten categories on the front page — ท่อ PE, เครื่องมือช่างไร้สาย
 * and อื่นๆ — contain nothing at all, because 804 of the 1,015 imported
 * products landed in the catch-all เครื่องมือช่าง. Tapping one of those tiles
 * took a shopper to a page that said "ไม่พบสินค้าที่ตรงกับตัวกรองของคุณ", which
 * reads as a fault in their filter rather than an empty shelf.
 *
 * Only the category column is fetched, not the products: about 30 kB for the
 * whole catalogue, in one round trip. If that fails the whole thing returns
 * null and every category is shown, which is exactly what happened before
 * this existed — an unknown count must never hide a category that has stock.
 *
 * Products carry the Thai display name rather than the key, so counts come
 * back keyed by both.
 */
/**
 * Category counts from the Next relational catalogue.
 * Tenant id always comes from the request tenant context; never from a global
 * default, so one merchant cannot answer with another merchant's shelves.
 */
async function categoryCountsRelational() {
  if(!postgresEnabled())return null;
  try {
    const tenantId=String(activeTenant()?.id||'').trim();
    if(!tenantId)return null;
    const result=await database().pool.query(`
      SELECT category_key AS category, COUNT(*)::int AS n
        FROM catalog_products
       WHERE tenant_id=$1
         AND status NOT IN ('hidden','discontinued')
       GROUP BY category_key
    `,[tenantId]);
    const counts=Object.create(null);
    for(const row of result.rows||[]){
      const name=String(row?.category||'');
      if(name)counts[name]=Number(row?.n)||0;
    }
    return Object.keys(counts).length?counts:null;
  } catch (error) {
    console.warn('relational category counts unavailable', error?.message || error);
    return null;
  }
}

async function categoryProductCounts(ds){
  return cachedPublicRead('category-counts', async () => {
    // The relational catalogue first: the same answer as the pages below,
    // from one indexed query instead of three thousand-row scans of JSON.
    const relational = await categoryCountsRelational();
    if (relational) return relational;

    const rows = await categoryColumnSupabase();
    // When Supabase is the backend and the one cheap query did not work, give
    // up rather than fall back: loading all 1,015 products to find out which
    // shelves are bare would put a full catalogue read in front of the home
    // page every ten minutes, which is a worse problem than the one being
    // solved. An unknown count shows every category, exactly as before.
    // Cached as null, not retried: a backend that just refused this query will
    // refuse it again, and one failing round trip per page view is not worth
    // paying for the same answer.
    if (!rows && supabaseEnabled()) return null;
    const names = rows
      ? rows
      : (await listJSONByPrefix(ds,'product:','product-index'))
          .filter(p=>p && p.state!=='hidden' && p.state!=='discontinued')
          .map(p=>String(p.category||''));
    const counts = Object.create(null);
    for (const name of names) if (name) counts[name] = (counts[name]||0) + 1;
    return counts;
  }, CATEGORY_COUNT_TTL_MS).catch(()=>null);
}

/** Just the category of every sellable product, as strings. */
async function categoryColumnSupabase(){
  const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!base||!secret)return null;
  // The state comes back too, and the exclusion is done here rather than in a
  // filter, because `state` is not always set. `eq.active` counted 790 tools
  // where the catalogue's own facets count 804: the difference is products
  // with no state at all, which the shop sells. A filter that drops them could
  // make a stocked category look bare, which is the exact fault this is meant
  // to fix. Excluding the two states that mean not-for-sale, the way
  // products.list does, is the rule that matches what a shopper can buy.
  // Asked for in pages, because PostgREST will not answer with more than a
  // thousand rows however large a limit is sent. `limit: 5000` returned exactly
  // 1,000 of the 1,016 products and the front page reported 789 in
  // เครื่องมือช่าง where the catalogue holds 804 — a number that is now shown to
  // shoppers beside the category, so being roughly right is not good enough.
  const PAGE=1000;
  const names=[];
  try{
    for(let offset=0; offset<20000; offset+=PAGE){
      const params=new URLSearchParams({
        select:'cat:value->>category,st:value->>state', namespace:`eq.${dataNamespace()}`,
        key:'like.product:*', order:'key.asc', limit:String(PAGE), offset:String(offset),
      });
      const response=await fetch(`${base}/rest/v1/app_kv?${params}`,{headers:{apikey:secret,authorization:`Bearer ${secret}`}});
      if(!response.ok)throw new Error(`supabase_category_counts_${response.status}`);
      const rows=await response.json();
      if(!Array.isArray(rows))return null;
      // The projection normally answers with `{cat:"ปั๊มน้ำ",st:"active"}`. Read
      // the whole row as well, so a deployment where it is not honoured counts
      // out of `value` instead of counting nothing — an empty count here would
      // hide every category on the front page.
      for(const row of rows){
        const state=String(row?.st ?? row?.state ?? row?.value?.state ?? '');
        if(state==='hidden'||state==='discontinued')continue;
        names.push(String(row?.cat ?? row?.category ?? row?.value?.category ?? ''));
      }
      if(rows.length<PAGE)break;
    }
    return names;
  }catch(error){console.warn('supabase category counts failed; counting in memory',error?.message||error);return null;}
}

async function queryProductsPostgres({category='',brandId='',brandName='',q='',status='',minPrice=null,maxPrice=null,sort='default',page=1,perPage=60,admin=false,facets=false,expectedTotal=null}={}){
  // When Commerce storage is PostgreSQL, query it directly. A deployment that
  // explicitly selected the Supabase transport keeps the PostgREST path.
  if(storageBackend()==='supabase-postgres' || !postgresEnabled()) return null;
  try{
    const db=database(); const params=[dataNamespace()];
    if(Number.isFinite(expectedTotal)){
      const mirrorCount=await db.pool.query(`SELECT COUNT(*)::int AS count FROM app_kv WHERE namespace=$1 AND key LIKE 'product:%'`,[dataNamespace()]);
      const mirroredTotal=Number(mirrorCount.rows[0]?.count||0);
      if(mirroredTotal!==expectedTotal){
        console.warn('postgres product mirror incomplete; using blobs fallback',{expectedTotal,mirroredTotal});
        return null;
      }
    }
    const where=[`namespace=$1`,`key LIKE 'product:%'`];
    if(!admin) where.push(`COALESCE(value->>'state','active') NOT IN ('hidden','discontinued')`);
    if(category){params.push(category);where.push(`value->>'category'=$${params.length}`);}
    if(brandId){params.push(brandId);where.push(`value->>'brand_id'=$${params.length}`);}
    else if(brandName){params.push(brandName.toLowerCase());where.push(`LOWER(COALESCE(value->>'brand',''))=$${params.length}`);}
    // Held so the literal search can be swapped for a fuzzy one below without
    // rebuilding every other filter.
    let searchWhereIndex=-1,searchParamPos=0;
    if(q){params.push(`%${q.toLowerCase()}%`);searchParamPos=params.length;searchWhereIndex=where.length;where.push(`(LOWER(COALESCE(value->>'name','')) LIKE $${searchParamPos} OR LOWER(COALESCE(value->>'sku','')) LIKE $${searchParamPos} OR LOWER(COALESCE(value->>'brand','')) LIKE $${searchParamPos})`);}
    if(status){
      params.push(status);
      const statusPos=params.length;
      if(status==='สินค้าลดราคา')where.push(`(COALESCE(value->'status','[]'::jsonb) ? $${statusPos} OR (COALESCE(NULLIF(value->>'oldPrice','')::numeric,0)>COALESCE(NULLIF(value->>'price','')::numeric,0) AND COALESCE(NULLIF(value->>'price','')::numeric,0)>0))`);
      else where.push(`COALESCE(value->'status','[]'::jsonb) ? $${statusPos}`);
    }
    if(Number.isFinite(minPrice)){params.push(minPrice);where.push(`COALESCE((value->>'price')::numeric,0)>=$${params.length}`);}
    if(Number.isFinite(maxPrice)){params.push(maxPrice);where.push(`COALESCE((value->>'price')::numeric,0)<=$${params.length}`);}
    const countOf=async()=>Number((await db.pool.query(`SELECT COUNT(*)::int AS count FROM app_kv WHERE ${where.join(' AND ')}`,params)).rows[0]?.count||0);
    let total=await countOf();
    // A literal `LIKE` finds nothing for a word typed one letter or one tone
    // mark off, and a shop that stocks the item then says it does not. When the
    // literal search comes back empty — and only then, so an exact search keeps
    // its exact results — the same query is asked again by similarity, which is
    // what the trigram indexes in 20260901120000 exist to answer.
    let fuzzy=false;
    if(q&&total===0&&searchWhereIndex>=0){
      params[searchParamPos-1]=q.toLowerCase();
      where[searchWhereIndex]=`word_similarity($${searchParamPos},${SEARCH_TEXT_SQL})>=${SEARCH_SIMILARITY_FLOOR}`;
      total=await countOf();
      fuzzy=total>0;
      if(!fuzzy)return {products:[],total:0,facets:null};
    }
    const offset=(Math.max(1,page)-1)*perPage;
    /*
     * The same "sold out last" rule as the blobs path above, in SQL.
     *
     * Products carrying variants or an explicit unlimited flag are counted as
     * available here rather than unpacked: their stock lives in a nested array
     * this expression cannot sum, and treating an unknown as available keeps a
     * stocked product on the first page. A sold-out simple product — which is
     * every row a supplier import creates — sorts to the back either way.
     */
    const inStockFirst=`CASE WHEN jsonb_typeof(value->'variants')='array' OR COALESCE((value->>'stock_unlimited')::boolean,false) THEN 0
      WHEN COALESCE((value->>'stock')::numeric,0)-COALESCE((value->>'reserved')::numeric,0)>0 THEN 0 ELSE 1 END ASC`;
    const orderBy={
      // Always include the immutable KV key as a tie-breaker. Without this,
      // OFFSET pagination can repeat/skip rows when many imports share the
      // same updated_at timestamp, making the admin catalog look incomplete.
      'price-asc':`${inStockFirst}, COALESCE((value->>'price')::numeric,0) ASC, updated_at DESC, key ASC`,
      'price-desc':`${inStockFirst}, COALESCE((value->>'price')::numeric,0) DESC, updated_at DESC, key ASC`,
      'name-asc':`${inStockFirst}, LOWER(COALESCE(value->>'name','')) ASC, key ASC`,
      default:`${inStockFirst}, updated_at DESC, key ASC`
    }[sort]||`${inStockFirst}, updated_at DESC`;
    // Ranking is the whole point of a fuzzy answer: closest first, or the
    // shopper reads a list of near-misses before the product they meant. An
    // explicit sort still wins — they asked for cheapest, they get cheapest.
    const effectiveOrderBy=fuzzy&&sort==='default'?`${inStockFirst}, word_similarity(${searchParamPos},${SEARCH_TEXT_SQL}) DESC, updated_at DESC, key ASC`:orderBy;
    const listParams=[...params,perPage,offset]; const limPos=params.length+1, offPos=params.length+2;
    const listResult=await db.pool.query(`SELECT value FROM app_kv WHERE ${where.join(' AND ')} ORDER BY ${effectiveOrderBy} LIMIT $${limPos} OFFSET $${offPos}`,listParams);
    let productFacets=null;
    if(facets&&!admin){
      const publicWhere=`namespace=$1 AND key LIKE 'product:%' AND COALESCE(value->>'state','active') NOT IN ('hidden','discontinued')`;
      const [categoryResult,brandResult]=await Promise.all([
        db.pool.query(`SELECT COALESCE(value->>'category','') AS value,COUNT(*)::int AS count FROM app_kv WHERE ${publicWhere} GROUP BY value->>'category'`,[dataNamespace()]),
        db.pool.query(`SELECT COALESCE(value->>'brand','') AS value,COUNT(*)::int AS count FROM app_kv WHERE ${publicWhere} GROUP BY value->>'brand'`,[dataNamespace()])
      ]);
      productFacets={categories:Object.fromEntries(categoryResult.rows.map(row=>[row.value,Number(row.count)])),brands:Object.fromEntries(brandResult.rows.map(row=>[row.value,Number(row.count)]))};
    }
    return {products:listResult.rows.map(row=>row.value).filter(Boolean),total,facets:productFacets};
  }catch(error){
    console.warn('postgres product query failed; using blobs fallback',error?.message||error);
    return null;
  }
}


/**
 * The address every rate limit is counted against.
 *
 * This used to read `x-forwarded-for` and take the FIRST value in the chain,
 * which is the one the caller wrote. Cloudflare appends the real address to
 * whatever `X-Forwarded-For` arrives rather than replacing it, so a request
 * carrying `X-Forwarded-For: 1.2.3.4` is forwarded as `1.2.3.4, <real ip>` and
 * the first entry — the attacker's own invention — became the bucket key. A
 * new value per request meant a new quota per request, and every limit on this
 * API could be walked straight past: sign-in attempts, coupon guessing, the
 * guest chat, order creation, slip uploads.
 *
 * `cf-connecting-ip` is set by Cloudflare itself and overwritten on every
 * request, so it cannot be forged from outside. It is the only header trusted
 * here. The forwarded chain is used as a last resort — from the END, which is
 * the hop nearest our own edge and the least attacker-influenced entry
 * available.
 */
function clientIp(req){
  const trusted=clean(req?.headers?.get('cf-connecting-ip'),120).trim();
  if(trusted) return trusted;
  const chain=clean(req?.headers?.get('x-forwarded-for'),400).split(',').map(x=>x.trim()).filter(Boolean);
  return chain.length?chain[chain.length-1]:'unknown';
}
/**
 * Quotas that must not disappear when storage does.
 *
 * Every limit here used to be skipped entirely if the counter could not be
 * read or written: the whole function was wrapped in `catch{return {ok:true}}`.
 * A Supabase blip therefore removed every quota on the API at once — and a
 * storage outage is exactly when an attacker's traffic is most likely to be
 * what caused it. These scopes guard credentials, money and outbound messages,
 * so they refuse instead. The rest still fail open, because a shopper being
 * unable to search during an outage helps nobody.
 */
const FAIL_CLOSED_SCOPES = new Set([
  'admin-login-v2', 'agent-login', 'customer-login', 'supplier-login',
  'customer-register', 'partner-apply',
  'order-create', 'omise-charge', 'slip-upload', 'coupon-validate',
  'chat-send', 'contact', 'review', 'newsletter',
  // Next.js route scopes below reuse this limiter (imported). They guard
  // money and metered LLM calls, so they refuse rather than open up.
  // NOTE: 'next-search' is deliberately NOT here: search is cheap and public,
  // and a shopper being unable to search during a storage outage helps
  // nobody — its quota still enforces whenever storage answers.
  'kit-quote', 'kit-ai', 'ai-chat',
]);

/**
 * Counts one request against a quota, atomically.
 *
 * Exported for the Next.js Route Handlers (kits/quote, kits/ai, ai/chat,
 * search), which otherwise have no throttle at all. In a route there is no
 * tenant AsyncLocalStorage context, so buckets land in the fallback auth
 * namespace — counting stays correct because the caller passes the tenant id
 * as part of `identity`, and sharing a bucket across tenants only ever makes
 * the limit stricter, never looser.
 *
 * This read the counter, added one, and wrote it back, with nothing between
 * the read and the write. Requests sent in parallel all read the same value
 * and all wrote the same value, so a hundred simultaneous sign-in attempts
 * counted as one — which is precisely the shape of a brute-force attempt, and
 * precisely what the limit exists to stop. Sequential abuse was capped; the
 * fast kind walked straight past.
 *
 * The counter now moves by compare-and-set: a writer that loses the race
 * re-reads and counts again, so every request is counted exactly once. If it
 * cannot get a clean count after several attempts the request is refused —
 * under that much contention on one key, refusing is the safer answer.
 */
/**
 * The bot check that sits in front of a public form, beside its rate limit.
 *
 * A rate limit is keyed to one address and stops one script. This asks whether
 * a browser with a person at it produced the submission at all, which is the
 * half a hundred addresses under the ceiling get past. Answers 403 rather than
 * 429: the caller is not early, it is unproven.
 *
 * Silent until TURNSTILE_SECRET is set, so shipping this changes nothing until
 * the widget exists.
 */
async function requireHuman(req, b, action){
  const result=await verifyTurnstile(turnstileToken(b), action, clientIp(req));
  if(result.ok) return null;
  return json({ok:false,error:result.error},403);
}

export async function rateLimit(req, scope, maxHits, windowSeconds, identity=''){
  const now=Math.floor(Date.now()/1000);
  const key=`ratelimit:${scope}:${sha(clientIp(req)+'|'+String(identity).toLowerCase())}`;
  const denied=(startedAt)=>({ok:false,retry_after:Math.max(1,windowSeconds-(now-Number(startedAt||now)))});
  try{
    const st=authStore();
    // Enough rounds to settle a busy key without giving up on honest
    // traffic; a caller generating more contention than this is the case
    // where refusing is the right answer anyway.
    for(let attempt=0;attempt<10;attempt++){
      const entry=await st.getWithMetadata(key,{type:'json',consistency:'strong'});
      const stored=entry?.data;
      const live=stored&&now-Number(stored.window_start||0)<windowSeconds;
      const windowStart=live?Number(stored.window_start||now):now;
      const next={count:(live?Number(stored.count||0):0)+1,window_start:windowStart,updated_at:new Date().toISOString()};
      const write=entry
        ? await st.setJSON(key,next,{onlyIfMatch:entry.etag})
        : await st.setJSON(key,next,{onlyIfNew:true});
      // Somebody else counted between the read and the write. Re-read and
      // count again rather than overwriting their count with ours.
      if(!write?.modified) continue;
      if(next.count>maxHits) return denied(windowStart);
      return {ok:true,remaining:Math.max(0,maxHits-next.count)};
    }
    console.warn('rate limit could not settle a count',scope);
    return denied(now);
  }catch(error){
    console.warn('rate limit storage failed',scope,error?.message||error);
    return FAIL_CLOSED_SCOPES.has(scope)?denied(now):{ok:true};
  }
}
function tooMany(rl){ return json({ok:false,error:'rate_limited',retry_after:rl.retry_after||60},429,{'retry-after':String(rl.retry_after||60)}); }

/*
 * ======================================================= catalogue scraping
 *
 * The whole catalogue is public — it has to be, that is what a shop is — and
 * the sitemap hands a crawler all 1,015 addresses on purpose, because that is
 * how the products get found. So this is not about hiding anything. It is about
 * the difference between a shopper reading a shelf and a competitor copying the
 * price list every morning, which are the same requests at very different
 * speeds.
 *
 * Three cheap things, in order of how much they are worth:
 *
 *   A limit on rows, not just on requests. The existing cap counts calls, and a
 *   scraper asking for 100 products at a time reaches the whole catalogue in
 *   eleven of them — well inside any per-request budget. Counting what is
 *   actually served is the measure that matches the thing being protected.
 *
 *   A refusal for tools that are not browsers. curl, wget, python-requests,
 *   scrapy and the rest identify themselves honestly by default, and the
 *   laziest copying is done with exactly those. Real crawlers are named and let
 *   through: blocking Googlebot to stop a scraper would cost the shop far more
 *   than the scraper ever could.
 *
 *   A limit on single-product reads, because that endpoint had none at all — a
 *   scraper walking product pages one at a time was unmetered.
 *
 * What this is not: protection against somebody who rotates addresses and sends
 * a browser's user agent. Nothing inside the application can be, because by
 * then the requests are indistinguishable from a shopper's. That belongs at the
 * edge — Cloudflare's Bot Fight Mode and a rate-limiting rule on /api — and
 * this is what holds until that is switched on, and what keeps the careless
 * majority out afterwards.
 */

/** Tools that say what they are. Matched loosely, because they all do. */
const SCRAPER_AGENTS=/\b(curl|wget|python-requests|python-urllib|scrapy|httpx|aiohttp|go-http-client|okhttp|java\/|apache-httpclient|libwww-perl|guzzle|node-fetch|httrack|wpull|colly|puppeteer|playwright|headlesschrome|phantomjs|selenium)\b/i;
/**
 * Crawlers worth having. Named rather than matched on "bot", because half the
 * scrapers in the wild put "bot" in their string precisely to be mistaken for
 * one of these.
 *
 * The page-speed auditors belong here for the same reason the search engines
 * do: the shop wants to be measured by them. Lighthouse drives a headless
 * Chrome, and `headlesschrome` is in the refusal list directly above — this
 * list is tested first, so naming the auditor is the whole of what keeps a
 * PageSpeed run from being turned away as a scraper.
 *
 * That failure does not look like a bad score. Every category errors at once,
 * which is what a report showing "!" against Performance, Accessibility, Best
 * Practices and SEO together means — an audit that could not run rather than a
 * shop that scored nothing.
 *
 * They are read-only and they read one page, so the row budget below is no more
 * strained by them than by a shopper.
 */
const WELCOME_CRAWLERS=/\b(googlebot|google-inspectiontool|storebot-google|bingbot|slurp|duckduckbot|baiduspider|yandexbot|yandeximages|applebot|facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|pinterest|ahrefsbot|semrushbot|chrome-lighthouse|pagespeed|gtmetrix|webpagetest|pingdom)\b/i;

function looksLikeATool(req){
  const agent=String(req.headers.get('user-agent')||'');
  /*
   * A missing user agent is deliberately not enough to refuse on.
   *
   * It is tempting — every browser sends one — but the storefront's own
   * server-side render calls this API from inside the worker, and a
   * server-to-server fetch has no browser to name. Refusing on absence took
   * every page of the shop down across the test suite before it could do it
   * in production. The row budget is the limit that actually holds; this only
   * turns away the tools that announce themselves.
   */
  if(!agent.trim())return false;
  if(WELCOME_CRAWLERS.test(agent))return false;
  return SCRAPER_AGENTS.test(agent);
}

/**
 * Counts rows rather than calls.
 *
 * Generous on purpose. A shopper who opens the catalogue, pages through it and
 * filters a few times sees a few hundred rows in an hour; ten thousand is more
 * than anybody reads and a fraction of what copying the shop daily would need.
 */
async function catalogueRowBudget(req,rows){
  const spend=Math.max(1,Math.min(200,Math.floor(Number(rows)||1)));
  return rateLimit(req,'catalogue-rows',10000,60*60,String(spend));
}

function refusedAsATool(){
  return json({ok:false,error:'automated_access_refused',
    detail:'หน้านี้ให้บริการกับเบราว์เซอร์และเสิร์ชเอนจินที่รู้จักเท่านั้น หากต้องการไฟล์ข้อมูลสินค้า กรุณาติดต่อร้าน'},
    403,{'cache-control':'no-store'});
}

/**
 * Order and stock alerts — a separate bot from the live chat.
 *
 * One bot was doing both jobs, so the shop's own alerts landed in the same
 * thread as customers' questions and each buried the other. Alerts are
 * one-way and can go to a team channel; the chat bot has to stay a private
 * conversation the team replies into. They also want separate mute settings.
 *
 * TELEGRAM_ALERT_* is preferred; the older TELEGRAM_BOT_TOKEN /
 * TELEGRAM_CHAT_ID still work, so nothing stops until the new pair is set.
 */
async function notifyTelegram(text){
  let notifications={};
  try{ notifications=(await getBusinessSettings()).notifications||{}; }catch{}
  // A dedicated value entered in the console must win over the legacy shared
  // environment pair. Otherwise a shop can fill in two bots and still have
  // both channels silently delivered through the old one.
  const token=process.env.TELEGRAM_ALERT_BOT_TOKEN||notifications.telegram_alert_bot_token||process.env.TELEGRAM_BOT_TOKEN||notifications.telegram_bot_token;
  const chatId=process.env.TELEGRAM_ALERT_CHAT_ID||notifications.telegram_alert_chat_id||process.env.TELEGRAM_CHAT_ID||notifications.telegram_chat_id;
  if(!token||!chatId) return false;
  try{ const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true})}); return r.ok; }catch{return false;}
}
function moneyTh(v){ return Number(v||0).toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:2}); }
function orderItemsText(order){
  const items=order?.items||[];
  if(!items.length) return '  • (ไม่มีรายการสินค้า)';
  return items.map((x)=>[
    `  • รายการสินค้า: ${x.name||'-'}${x.variant_label?` (${x.variant_label})`:''}`,
    `    จำนวน: ${Number(x.qty||0)} ชิ้น × ${moneyTh(Number(x.price||0))} = ${moneyTh(Number(x.price||0)*Number(x.qty||0))} บาท`,
    x.sku?`    SKU: ${x.sku}`:'',
  ].filter(Boolean).join('\n')).join('\n');
}
function isLineOrder(order){ return /LINE/i.test(String(order?.payment_method||'')); }


async function verifySlipAutomatically(imageDataUrl, amount){
  const apiKey=clean(process.env.SLIPOK_API_KEY||'',300);
  const branchId=clean(process.env.SLIPOK_BRANCH_ID||'',120);
  if(!apiKey||!branchId) return {configured:false,verified:false,provider:'none'};
  try{
    const m=String(imageDataUrl||'').match(/^data:image\/(png|jpeg|jpg|webp|jfif);base64,(.+)$/i);
    if(!m) return {configured:true,verified:false,provider:'slipok',error:'unsupported_image'};
    const ext=m[1].toLowerCase()==='jpeg'?'jpg':m[1].toLowerCase();
    const buf=Buffer.from(m[2],'base64');
    const form=new FormData();
    form.append('files',new Blob([buf],{type:`image/${ext==='jpg'?'jpeg':ext}`}),`slip.${ext}`);
    form.append('log','true');
    form.append('amount',String(Number(amount||0)));
    const res=await fetch(`https://api.slipok.com/api/line/apikey/${encodeURIComponent(branchId)}`,{method:'POST',headers:{'x-authorization':apiKey},body:form});
    const data=await res.json().catch(()=>({}));
    const verified=!!(res.ok && data?.success===true && data?.data?.success===true);
    return {configured:true,verified,provider:'slipok',http_status:res.status,data:verified?{amount:Number(data.data.amount||0),transRef:clean(data.data.transRef,80),transTimestamp:clean(data.data.transTimestamp,80),sendingBank:clean(data.data.sendingBank,20),receivingBank:clean(data.data.receivingBank,20),receiverName:clean(data.data.receiver?.displayName||data.data.receiver?.name,120)}:null,error:verified?null:clean(data?.message||data?.data?.message||'verification_failed',220)};
  }catch(e){
    return {configured:true,verified:false,provider:'slipok',error:clean(e?.message||'verification_error',220)};
  }
}
/** Bangkok wall-clock time — the shop reads these on a phone, not in UTC. */
function orderTimeTh(value){
  const at=value?new Date(value):new Date();
  if(Number.isNaN(at.getTime())) return '-';
  return at.toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'});
}
/** Full delivery address on one readable block. */
function orderAddressTh(order){
  return [clean(order?.address,1000),clean(order?.province,100),clean(order?.zip,10)].filter(Boolean).join(' ')||'-';
}
/**
 * What the shop has to know the moment an order lands: whether money is owed
 * or already in, who to send it to, and what to pack. The previous message led
 * with an order number and buried the payment state in a sentence, so nobody
 * could tell a paid order from an unpaid one at a glance on a phone.
 */
function orderPaymentStateTh(order){
  if(order?.payment_status==='paid'||order?.status==='paid') return {label:'ชำระเงินแล้ว',note:''};
  if(isLineOrder(order)) return {label:'รอตรวจสอบ', note:'\n    ⚠️ สั่งผ่าน LINE — Super Admin ต้องยืนยันการชำระเงินเอง'};
  if(/COD|ปลายทาง/i.test(String(order?.payment_method||''))) return {label:'เก็บเงินปลายทาง',note:'\n    ⚠️ เก็บเงินกับลูกค้าเมื่อส่งถึง'};
  if(order?.slip_uploaded||order?.payment_status==='pending_review') return {label:'รอตรวจสอบสลิป',note:'\n    ⚠️ กรุณาตรวจสอบสลิปที่แนบมา'};
  return {label:'ยังไม่ชำระ',note:'\n    ⚠️ รอลูกค้าโอนและแนบสลิป'};
}
function orderNotificationText(order){
  const pay=orderPaymentStateTh(order);
  return [
    `🛒 คำสั่งซื้อใหม่ — ${order.order_no}`,
    '',
    '💳 สถานะการชำระเงิน:',
    `  • สถานะ: ${pay.label}${pay.note}`,
    `  • ยอดเงินที่ต้องชำระ / โอน: ${moneyTh(order.total)} บาท`,
    `  • วิธีชำระเงิน: ${order.payment_method||'-'}`,
    '',
    '👤 ข้อมูลลูกค้า:',
    `  • ชื่อ-นามสกุล: ${order.name||'-'}`,
    `  • เบอร์โทรศัพท์: ${order.phone||'-'}`,
    `  • ที่อยู่จัดส่ง: ${orderAddressTh(order)}`,
    '',
    '🛍️ รายละเอียดสินค้า:',
    orderItemsText(order),
    '',
    `⏰ เวลาที่สั่งซื้อ: ${orderTimeTh(order.created_at)}`,
  ].join('\n');
}
/** Returns whether the shop was actually told. See the order outbox below. */
async function notifyOrder(order){
  try{
    const settings=await getBusinessSettings();
    const mailer=await buildMailer(settings); const to=clean(process.env.ORDER_NOTIFY_EMAIL||settings.notifications?.order_notify_email||settings.email.from_email,190);
    const text=orderNotificationText(order);
    if(mailer&&to) await mailer.sendMail({from:`"${settings.email.from_name}" <${settings.email.from_email||settings.email.smtp_user}>`,to,subject:`ออเดอร์ใหม่ ${order.order_no} - THAISERKIT SUPPLY`,text}).catch(()=>{});
    return await notifyTelegram(text)!==false;
  }catch(error){
    console.warn('order notification failed',order?.order_no,error?.message||error);
    return false;
  }
}
/**
 * A customer attached a slip and it needs a human to look at it. The order
 * itself was already announced when it was placed, so this is short on purpose
 * — it is a nudge to go and check, not a second copy of the order.
 */
async function notifyOrderSlip(order){
  if(!order) return false;
  return notifyTelegram([
    `🧾 ลูกค้าแนบสลิปแล้ว — ${order.order_no}`,
    '',
    '💳 สถานะการชำระเงิน:',
    '  • สถานะ: รอตรวจสอบสลิป ⚠️ (กรุณาตรวจสอบสลิปที่แนบมา)',
    `  • ยอดที่แจ้งโอน: ${moneyTh(order.total)} บาท`,
    '',
    `👤 ลูกค้า: ${order.name||'-'} · ${order.phone||'-'}`,
    '',
    '🔍 ตรวจสอบได้ที่หน้า “ตรวจสลิป” ในระบบหลังบ้าน',
    `⏰ เวลาที่แนบสลิป: ${orderTimeTh()}`,
  ].join('\n'));
}
/**
 * The second message: payment checked and confirmed. Same shape as the order
 * notification so the two read as a pair in the Telegram thread, and it states
 * plainly that the order is now clear to pack and ship.
 */
async function notifyOrderPayment(order, by='system'){
  if(!order) return false;
  const mode=isLineOrder(order)?'ตรวจโดยแอดมิน':'ระบบ/ช่องทางชำระเงิน';
  return notifyTelegram([
    `✅ ยืนยันการชำระเงินแล้ว — ${order.order_no}`,
    '',
    '💳 สถานะการชำระเงิน:',
    '  • สถานะ: ชำระเงินแล้ว ✅ (ตรวจสอบเรียบร้อย)',
    `  • ยอดที่ได้รับ: ${moneyTh(order.total)} บาท`,
    `  • วิธีชำระเงิน: ${order.payment_method||'-'}`,
    `  • รูปแบบตรวจสอบ: ${mode}`,
    `  • ผู้ตรวจสอบ: ${by||'system'}`,
    '',
    '👤 ข้อมูลลูกค้า:',
    `  • ชื่อ-นามสกุล: ${order.name||'-'}`,
    `  • เบอร์โทรศัพท์: ${order.phone||'-'}`,
    `  • ที่อยู่จัดส่ง: ${orderAddressTh(order)}`,
    '',
    '🛍️ รายละเอียดสินค้า:',
    orderItemsText(order),
    '',
    '📦 ดำเนินการต่อ: จัดของและแจ้งเลขพัสดุได้เลย',
    `⏰ เวลาที่ยืนยัน: ${orderTimeTh()}`,
  ].join('\n'));
}
async function notifyOrderShipped(order, by='system'){
  if(!order) return false;
  const carrier=order.carrier||'-', tracking=order.tracking_number||'-';
  return notifyTelegram(`🚚 จัดส่งคำสั่งซื้อแล้ว\nเลขคำสั่งซื้อ: ${order.order_no}\nลูกค้า: ${order.name||'-'}\nขนส่ง: ${carrier}\nเลขพัสดุ: ${tracking}\nผู้ดำเนินการ: ${by||'system'}`);
}
async function notifyOrderCompleted(order, by='system'){
  if(!order) return false;
  return notifyTelegram(`✅ คำสั่งซื้อสำเร็จ\nเลขคำสั่งซื้อ: ${order.order_no}\nลูกค้า: ${order.name||'-'}\nยอดรวม: ${moneyTh(order.total)} บาท\nผู้ดำเนินการ: ${by||'system'}`);
}
async function notifyOrderCancelled(order, status, by='system'){
  if(!order) return false;
  const title=status==='refunded'?'↩️ คืนเงินคำสั่งซื้อ':'❌ ยกเลิกคำสั่งซื้อ';
  return notifyTelegram(`${title}\nเลขคำสั่งซื้อ: ${order.order_no}\nลูกค้า: ${order.name||'-'}\nยอดรวม: ${moneyTh(order.total)} บาท\nผู้ดำเนินการ: ${by||'system'}`);
}


/*
 * The ladder, cached like every other public read.
 *
 * It is one small record read on every completed order and on every view of the
 * agent console, and it changes when a super admin edits it — which is roughly
 * never. `forgetPublicRead('agent-levels')` is what makes an edit visible at
 * once rather than up to six seconds later.
 */
const AGENT_LEVELS_KEY='agent-levels';
async function agentLevelLadder(ds){
  return cachedPublicRead('agent-levels', async () =>
    normalizeAgentLevels(await getJSON(ds,AGENT_LEVELS_KEY)));
}

async function ensureAgentCommission(ds,order,by='system'){
  if(!order?.agent_id || order.status!=='completed') return null;
  const key=`commission-order:${order.id}`; const existingId=await getJSON(ds,key);
  if(existingId){const ex=await getJSON(ds,`commission:${existingId}`); if(ex) return ex;}
  const agent=await getJSON(ds,`agent:${order.agent_id}`); if(!agent) return null;
  const base=Math.max(0,Number(order.subtotal||0)-Number(order.discount||0));
  /*
   * The sale counts before the rate is worked out.
   *
   * A level is earned on what an agent has sold, so the order being completed
   * right now is part of that total — and an agent whose sale takes them over a
   * threshold should be paid at the new rate for it rather than told they
   * missed it by one order. It is the honest reading of the threshold too: it
   * says "has sold this much", and by the time this runs, they have.
   *
   * Kept on the agent record rather than recomputed from the commission rows,
   * which would mean reading every commission the shop has ever written on
   * every order that completes.
   */
  const levels=await agentLevelLadder(ds);
  if(base>0){
    const lifetime=Math.max(0,Number(agent.lifetime_sales||0))+base;
    agent.lifetime_sales=lifetime;
    agent.level=agentLevelStanding(lifetime,levels).level;
    agent.updated_at=new Date().toISOString();
    await ds.setJSON(`agent:${order.agent_id}`,agent);
  }
  const rate=effectiveCommissionRate(agent,levels);
  const now=new Date().toISOString(),created=[],idx=[];
  async function create(agentRow,commissionRate,level,sourceAgent){const id=crypto.randomUUID(),amount=Math.round(base*commissionRate)/100,row={id,agent_id:agentRow.id,agent_code:agentRow.referral_code||'',agent_store_name:agentRow.store_name||'',order_id:order.id,order_no:order.order_no,base_amount:base,rate:commissionRate,amount,level,source_agent_id:sourceAgent?.id||null,source_agent_code:sourceAgent?.referral_code||'',status:'available',created_at:now,available_at:now,created_by:by};await ds.setJSON(`commission:${id}`,row);idx.push(id);created.push(row);return row;}
  const direct=await create(agent,rate,1,agent);await ds.setJSON(key,direct.id);
  const upline=agent.upline_agent_id?await getJSON(ds,`agent:${agent.upline_agent_id}`):null;
  if(upline&&upline.status==='approved'&&upline.id!==agent.id){const level2Rate=Math.max(0,Math.min(100,Number(agent.upline_commission_rate??upline.level2_commission_rate??process.env.AGENT_LEVEL2_COMMISSION_RATE??1)||0));if(level2Rate>0)await create(upline,level2Rate,2,agent);}
  await mutateIndexAtomically(ds,'commission-index',(current)=>[...new Set([...current,...idx])]);await ds.setJSON(`commission-order-all:${order.id}`,created.map(x=>x.id));
  return direct;
}
async function reverseCommissionRow(ds,row,reason='order_reversed',by='system'){
  if(!row||row.status==='reversed'||row.status==='adjusted_refund')return row;const now=new Date().toISOString();
  let paidAllocated=0;
  for(const pid of (await getJSON(ds,'payout-index')||[])){
    const p=await getJSON(ds,`payout:${pid}`);if(!p||p.agent_id!==row.agent_id)continue;
    const allocation=(p.allocations||[]).find(x=>x.commission_id===row.id);if(p.status==='paid'&&allocation)paidAllocated+=Math.max(0,Number(allocation.amount||0));
    const legacyHit=(p.commission_ids||[]).includes(row.id);
    if(p.status==='pending'&&(allocation||legacyHit)){
      p.status='rejected';p.rejection_reason='ออเดอร์ต้นทางถูกยกเลิก/คืนเงิน';p.reviewed_by=by;p.reviewed_at=now;await ds.setJSON(`payout:${p.id}`,p);await ds.delete(`payout-lock:${p.agent_id}`);
      if(legacyHit){for(const cid of p.commission_ids||[]){const c=await getJSON(ds,`commission:${cid}`);if(c&&c.status==='payout_pending'){c.status='available';delete c.payout_id;c.updated_at=now;await ds.setJSON(`commission:${cid}`,c);}}}
    }
  }
  if(row.status==='paid')paidAllocated=Math.max(paidAllocated,Math.abs(Number(row.amount||0)));
  if(paidAllocated>0){
    const adjustmentKey=`commission-adjustment:${row.id}:refund`,existing=await getJSON(ds,adjustmentKey);if(existing)return await getJSON(ds,`commission:${existing}`);
    // Keep the original earning for audit, then post a full negative adjustment. Paid payouts remain
    // in history, so the resulting balance can become negative and will be offset by future earnings.
    row.status='adjusted_refund';row.adjusted_at=now;row.adjustment_reason=reason;await ds.setJSON(`commission:${row.id}`,row);
    const aid=crypto.randomUUID(),adj={id:aid,agent_id:row.agent_id,agent_code:row.agent_code,agent_store_name:row.agent_store_name,order_id:row.order_id,order_no:row.order_no,base_amount:row.base_amount,rate:row.rate,amount:-Math.abs(Number(row.amount||0)),type:'refund_adjustment',status:'available',source_commission_id:row.id,created_at:now,available_at:now,created_by:by,note:`หักคืนค่าคอมจาก ${reason}`};
    await ds.setJSON(`commission:${aid}`,adj);await ds.setJSON(adjustmentKey,aid);await appendToIndex(ds,'commission-index',aid);return adj;
  }
  row.status='reversed';row.reversed_at=now;row.reversal_reason=reason;row.reversed_by=by;await ds.setJSON(`commission:${row.id}`,row);return row;
}
async function reverseAgentCommission(ds,order,reason='order_reversed',by='system'){
  if(!order?.id)return null;let ids=await getJSON(ds,`commission-order-all:${order.id}`)||[];if(!ids.length){const legacy=await getJSON(ds,`commission-order:${order.id}`);if(legacy)ids=[legacy];}const reversed=[];for(const id of ids){const row=await getJSON(ds,`commission:${id}`);if(row)reversed.push(await reverseCommissionRow(ds,row,reason,by));}return reversed[0]||null;
}
async function expireOldReservations(ds){
  try{
    const idx=await getJSON(ds,'order-index')||[]; const now=Date.now();
    for(const id of idx.slice(-150)){
      const o=await getJSON(ds,`order:${id}`);
      if(!o||!o.stock_reserved||o.stock_deducted||!o.reservation_expires_at) continue;
      if(new Date(o.reservation_expires_at).getTime()>now) continue;
      await releaseReservationForOrder(ds,o); o.status='expired';
      await releaseCouponForOrder(ds,o);
      o.status_history=[...(o.status_history||[]),{status:'expired',at:new Date().toISOString(),by:'system'}];
      await ds.setJSON(`order:${id}`,o);
    }
  }catch{}
}
function productVariantReferenceIds(order,productId,variantIds){
  const hits=[];
  for(const item of order?.items||[]){
    if((item.id||item.product_id)!==productId)continue;
    const variantId=clean(item.variant_id,80);
    if(variantId&&variantIds.has(variantId))hits.push(variantId);
  }
  return [...new Set(hits)];
}
async function openOrderVariantReferenceBlockers(ds,productId,variantIds){
  const blockers=[],openStatuses=new Set(['pending_payment','new','awaiting_verification','paid','processing','packing','shipped']);
  const productOrderIds=await getJSON(ds,`orders-by-product:${productId}`),candidateOrderIds=Array.isArray(productOrderIds)?productOrderIds:(await getJSON(ds,'order-index')||[]);
  for(const orderId of candidateOrderIds){const order=await getJSON(ds,`order:${orderId}`);if(!order||!openStatuses.has(order.status))continue;for(const variantId of productVariantReferenceIds(order,productId,variantIds))blockers.push({variant_id:variantId,reason:'open_order_reference',order_id:order.id,order_no:order.order_no,status:order.status});}
  return blockers;
}
async function variantRemovalBlockers(ds,productId,current,next){
  const nextIds=new Set((next?.variants||[]).map(v=>v.id));
  const removed=(current?.variants||[]).filter(v=>!nextIds.has(v.id));
  if(!removed.length)return [];
  const blockers=inventoryVariantRemovalBlockers(current,next);
  const removedIds=new Set(removed.map(v=>v.id));
  if(removedIds.size)blockers.push(...await openOrderVariantReferenceBlockers(ds,productId,removedIds));
  return blockers;
}
function superAdminPasswordKey(username){
  return `superadmin-password:${sha(String(username||'').trim().toLowerCase())}`;
}
async function superAdminPasswordRecord(username){
  if(!username)return null;
  return await getJSON(authStore(),superAdminPasswordKey(username));
}
async function session(req){
  const token=parseCookies(req)[SESSION_COOKIE]; if(!token) return {token:null,data:null};
  try{
    let data=await getJSON(authStore(),`session:${sha(token)}`);
    if(data?.expires_at && Date.now()>new Date(data.expires_at).getTime()){ try{await authStore().delete(`session:${sha(token)}`);}catch{} data=null; }
    // A password rotation must end every previously-issued Super Admin
    // session. The session that performed the rotation is updated to the new
    // version by admin.password, so the person changing it is not locked out.
    if(data?.type==='admin'&&data?.role==='super_admin'){
      const credential=await superAdminPasswordRecord(data.username);
      if(credential?.version&&data.password_version!==credential.version){
        try{await authStore().delete(`session:${sha(token)}`);}catch{}
        data=null;
      }
    }
    return {token,data,unavailable:false};
  }catch(error){
    // A temporary database/storage interruption must not be mistaken for a
    // signed-out user. Protected routes return a retryable 503 instead of 401.
    console.error('[TSK] session store unavailable',error?.message||error);
    return {token,data:null,unavailable:true};
  }
}
async function saveSession(payload){
  const token=random(32); const csrf=random(18); const now=new Date(); const s={...payload,csrf,created_at:now.toISOString(),refreshed_at:now.toISOString(),expires_at:new Date(now.getTime()+MAX_AGE*1000).toISOString()};
  await authStore().setJSON(`session:${sha(token)}`,s); return {token,s};
}
async function refreshSession(ss){
  if(!ss?.token||!ss?.data)return false;
  const now=Date.now(),last=Date.parse(ss.data.refreshed_at||ss.data.created_at||0);
  if(Number.isFinite(last)&&now-last<SESSION_REFRESH_AFTER*1000)return false;
  ss.data={...ss.data,refreshed_at:new Date(now).toISOString(),expires_at:new Date(now+MAX_AGE*1000).toISOString()};
  await authStore().setJSON(`session:${sha(ss.token)}`,ss.data);
  return true;
}
async function deleteSession(token){ if(token) try{await authStore().delete(`session:${sha(token)}`);}catch{} }
function customerPublic(c){ if(!c)return null; const {password_hash,oauth_identities,...pub}=c; return {...pub,oauth_providers:Object.keys(oauth_identities&&typeof oauth_identities==='object'?oauth_identities:{})}; }

/**
 * Turn an Auth.js OAuth identity into the legacy customer session that the
 * commerce/account APIs already understand.
 *
 * Keeping the bridge here matters for multi-tenant safety: it runs inside the
 * same AsyncLocalStorage tenant context as every other customer/session write,
 * so an OAuth callback on shop A can never create or read a customer in shop B.
 *
 * Existing password accounts are linked automatically only when the OAuth
 * provider supplied a verified email. Otherwise the caller must sign in with
 * the existing account first; silently linking an unverified email would turn
 * a social account into an account-takeover primitive.
 */
export async function establishOauthCustomerSession(req, identity = {}) {
  const tenant = resolveTenant(new URL(req.url).hostname);
  if (!tenant) return { ok: false, error: 'unknown_tenant_host' };

  return tenantContext.run(tenant, async () => {
    const provider = clean(identity.provider, 32).toLowerCase();
    const providerAccountId = clean(identity.providerAccountId, 240);
    const email = clean(identity.email, 190).toLowerCase();
    const name = clean(identity.name, 150) || email.split('@')[0] || 'สมาชิก';
    const emailVerified = identity.emailVerified === true;
    if (!['google', 'facebook', 'line'].includes(provider) || !providerAccountId) {
      return { ok: false, error: 'oauth_identity_invalid' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'oauth_email_required' };
    }

    const limited = await rateLimit(req, 'customer-oauth-bridge', 30, 60 * 60, `${provider}:${providerAccountId}`);
    if (!limited.ok) return { ok: false, error: 'rate_limited', retry_after: limited.retry_after || 60 };

    const store = authStore();
    const providerKey = `oauth:${provider}:${sha(providerAccountId)}`;
    const providerRef = await getJSON(store, providerKey);
    const currentSession = await session(req);
    let customer = providerRef?.id ? await getJSON(store, `customer:${providerRef.id}`) : null;

    // If the browser is already signed in to a customer account, an OAuth
    // round-trip is an explicit account-link action. This is the safest path
    // and does not depend on an email comparison at all.
    if (!customer && currentSession?.data?.type === 'customer' && currentSession.data.customer?.id) {
      customer = await getJSON(store, `customer:${currentSession.data.customer.id}`);
    }

    if (!customer) {
      const emailRef = await getJSON(store, `email:${sha(email)}`);
      if (emailRef?.id) {
        if (!emailVerified) return { ok: false, error: 'oauth_account_exists' };
        customer = await getJSON(store, `customer:${emailRef.id}`);
      }
    }

    const now = new Date().toISOString();
    if (!customer) {
      const id = crypto.randomUUID();
      customer = {
        id,
        name,
        email,
        phone: '',
        address: '',
        province: '',
        zip: '',
        created_at: now,
        updated_at: now,
        password_hash: '',
        auth_mode: 'oauth',
        oauth_identities: {},
      };
      await store.setJSON(`customer:${id}`, customer);
      await store.setJSON(`email:${sha(email)}`, { id });
      await appendToIndex(dataStore(), 'customer-index', id);
    }

    const identities = customer.oauth_identities && typeof customer.oauth_identities === 'object'
      ? { ...customer.oauth_identities }
      : {};
    identities[provider] = {
      provider_account_id: providerAccountId,
      email,
      email_verified: emailVerified,
      linked_at: identities[provider]?.linked_at || now,
      last_login_at: now,
    };
    customer.oauth_identities = identities;
    customer.auth_mode = customer.password_hash ? 'password+oauth' : 'oauth';
    customer.updated_at = now;
    customer.last_login_at = now;
    if (!customer.name) customer.name = name;
    await store.setJSON(`customer:${customer.id}`, customer);
    await store.setJSON(providerKey, { id: customer.id });

    // Rotate any legacy customer session that survived the OAuth redirect.
    // Auth.js keeps its own signed JWT cookie; this is the commerce session.
    await deleteSession(currentSession?.token);
    const pub = customerPublic(customer);
    const nextSession = await saveSession({ type: 'customer', customer: pub });
    return {
      ok: true,
      customer: pub,
      csrf: nextSession.s.csrf,
      cookie: cookieHeader(nextSession.token),
      tenant: tenant.id,
    };
  });
}


// ---------- Audit log ----------
async function auditLog(req, ss, action, details){
  try{
    const ds=dataStore();
    const id=crypto.randomUUID();
    const entry={
      id, action, details: details||{},
      // One super-admin credential opens every merchant, so the log has to say
      // which merchant an action landed on to be worth anything afterwards.
      tenant: activeTenant().id,
      admin: ss?.data?.type==='admin' ? ss.data.username : null,
      role: ss?.data?.type==='admin' ? (ss.data.role||'admin') : null,
      ip: req?.headers?.get('x-nf-client-connection-ip') || req?.headers?.get('x-forwarded-for') || '',
      at: new Date().toISOString()
    };
    await ds.setJSON(`audit:${id}`, entry);
    await appendToIndex(ds,'audit-index',id,{unique:false,cap:2000});
  }catch(e){ /* never let logging break the main action */ }
}


function stockIsUnlimited(p){ return p && (p.stock===null || p.stock===undefined || p.stock===''); }
function stockAvailable(p){
  if(!p) return 0;
  if(Array.isArray(p.variants) || p.inventory_version) return (normalizeProductInventory(p)?.variants||[]).reduce((sum,v)=>{
    const available=variantAvailable(v); return !Number.isFinite(sum)||!Number.isFinite(available)?Number.POSITIVE_INFINITY:sum+available;
  },0);
  if(stockIsUnlimited(p)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Number(p.stock||0)-Number(p.reserved||0));
}
function publicAvailable(v){ return Number.isFinite(v) ? Math.max(0,Math.floor(v)) : null; }
function minOrderQuantity(product){
  const value=Math.floor(Number(product?.min_order_qty||1));
  return Number.isFinite(value)?Math.max(1,Math.min(999,value)):1;
}


async function ensureWarehouses(ds){
  let ids=await getJSON(ds,'warehouse-index')||[];
  const warehouses=[];
  for(const id of ids){const row=await getJSON(ds,`warehouse:${id}`);if(row)warehouses.push(row);}
  if(!warehouses.some(x=>x.id===DEFAULT_WAREHOUSE.id)){
    await ds.setJSON(`warehouse:${DEFAULT_WAREHOUSE.id}`,DEFAULT_WAREHOUSE);
    ids=[DEFAULT_WAREHOUSE.id,...ids.filter(x=>x!==DEFAULT_WAREHOUSE.id)];
    await ds.setJSON('warehouse-index',ids);
    warehouses.unshift({...DEFAULT_WAREHOUSE});
  }
  return warehouses.sort((a,b)=>Number(a.priority||999)-Number(b.priority||999)||String(a.name||'').localeCompare(String(b.name||''),'th'));
}
async function findProductByIdOrCode(ds,productId='',sku='',barcode='',activeOnly=true){
  let product=productId?await getJSON(ds,`product:${productId}`):null;
  const skuNeedle=clean(sku,120).toLowerCase(),barcodeNeedle=clean(barcode,120).toLowerCase();
  if(!product&&(skuNeedle||barcodeNeedle)){
    const ids=await productIdsFromStore(ds);
    for(const id of ids){const candidate=await getJSON(ds,`product:${id}`);if(!candidate)continue;const normalized=normalizeProductInventory(candidate);const match=(normalized.variants||[]).some(v=>(skuNeedle&&v.sku.toLowerCase()===skuNeedle)||(barcodeNeedle&&v.barcode.toLowerCase()===barcodeNeedle));if(match){product=candidate;break;}}
  }
  if(activeOnly&&product?.state!=='active')return null;
  return product;
}


function orderTransitionAllowed(order,next){
  const cur=String(order?.status||'');
  const cod=/COD|ปลายทาง/i.test(String(order?.payment_method||''));
  const map={
    pending_payment:['awaiting_verification','paid','cancelled','expired'],
    awaiting_verification:['paid','cancelled','expired'],
    new: cod?['processing','cancelled']:['paid','cancelled','expired'],
    paid:['processing','cancelled','refunded'],
    processing:['packing','cancelled','refunded'],
    packing:['shipped','cancelled','refunded'],
    shipped:['completed','refunded'],
    completed:['refunded'],
    cancelled:[], refunded:[], expired:[]
  };
  return cur===next || (map[cur]||[]).includes(next);
}
/**
 * Change a coupon's used_count with an etag compare-and-set, retrying on a
 * concurrent write. With enforceLimit, an increment that would pass
 * usage_limit is refused instead of written, so two simultaneous orders can
 * no longer both take the last use.
 */
async function atomicCouponUse(ds,code,delta,{enforceLimit=false}={},retries=8){
  const key=`coupon:${clean(code,40).toUpperCase()}`;
  for(let attempt=0;attempt<retries;attempt++){
    const entry=await ds.getWithMetadata(key,{type:'json',consistency:'strong'});
    const cp=entry?.data; if(!cp) return {ok:false,reason:'not_found'};
    const used=Number(cp.used_count||0), limit=Number(cp.usage_limit||0);
    if(delta>0&&enforceLimit&&limit>0&&used>=limit) return {ok:false,reason:'usage_limit'};
    const next={...cp,used_count:Math.max(0,used+delta)};
    const write=await ds.setJSON(key,next,{onlyIfMatch:entry.etag});
    if(write?.modified) return {ok:true,coupon:next};
  }
  return {ok:false,reason:'conflict'};
}
async function consumeCouponForOrder(ds,order){
  if(!order?.coupon_code || order.coupon_consumed) return;
  const result=await atomicCouponUse(ds,order.coupon_code,1,{enforceLimit:true});
  if(result.ok) order.coupon_consumed=true;
}
async function releaseCouponForOrder(ds,order){
  if(!order?.coupon_code || !order.coupon_consumed) return;
  try{ await atomicCouponUse(ds,order.coupon_code,-1); }catch{}
  order.coupon_consumed=false;
}


// ---------- Atomic inventory helpers (etag compare-and-set writes) ----------
async function atomicProductMutation(productId, mutator, retries=8){
  const store=rawBlobStore(dataNamespace()), key=`product:${productId}`;
  for(let attempt=0;attempt<retries;attempt++){
    const entry=await store.getWithMetadata(key,{type:'json',consistency:'strong'});
    if(!entry?.data) return {ok:false,error:'product_not_found'};
    const current=entry.data, result=await mutator({...current});
    if(result?.ok===false) return result;
    const next=result?.value||result||current; next.updated_at=new Date().toISOString();
    const write=await store.setJSON(key,next,{onlyIfMatch:entry.etag});
    if(write?.modified){await mirrorJSON(dataNamespace(),key,next);return {ok:true,product:next,meta:result?.meta||null};}
  }
  return {ok:false,error:'inventory_conflict'};
}
async function atomicProductCreate(product){
  const store=rawBlobStore(dataNamespace()),write=await store.setJSON(`product:${product.id}`,product,{onlyIfNew:true});
  if(write?.modified)await mirrorJSON(dataNamespace(),`product:${product.id}`,product);
  return write?.modified===true;
}
async function atomicReservedDelta(productId,delta){
  return atomicProductMutation(productId,p=>{
    p=normalizeProductInventory(p,{clone:false});const v=findProductVariant(p);
    const level=v?.inventory?.[DEFAULT_WAREHOUSE.id];
    if(level&&level.on_hand!==null)level.reserved=Math.max(0,Number(level.reserved||0)+Number(delta||0));
    return syncProductAggregates(p);
  });
}
function orderedWarehouseIds(variant,warehouses=[]){
  const configured=warehouses.filter(x=>x.active!==false).map(x=>x.id);
  return [...new Set([...configured,...Object.keys(variant?.inventory||{})])];
}
async function reverseAllocations(productId,variantId,allocations){
  return atomicProductMutation(productId,p=>{
    p=normalizeProductInventory(p,{clone:false});const variant=findProductVariant(p,variantId);
    if(!variant)return {ok:false,error:'variant_not_found'};
    for(const allocation of allocations||[]){const level=variant.inventory?.[allocation.warehouse_id];if(level&&level.on_hand!==null)level.reserved=Math.max(0,Number(level.reserved||0)-Number(allocation.qty||0));}
    return syncProductAggregates(p);
  });
}
async function reserveStockAtomically(lines,ds){
  const warehouses=await ensureWarehouses(ds);
  const held=[];
  for(const line of lines){
    const qty=Math.max(1,Math.floor(Number(line.qty)||0));
    const r=await atomicProductMutation(line.id,p=>{
      p=normalizeProductInventory(p,{clone:false});
      if(p.state!=='active') return {ok:false,error:'product_unavailable',product_id:line.id,sku:line.sku||''};
      const variant=findProductVariant(p,line.variant_id,line.sku,line.barcode);
      if(!variant||variant.state!=='active')return {ok:false,error:'variant_unavailable',product_id:line.id,variant_id:line.variant_id||'',sku:line.sku||''};
      const available=variantAvailable(variant);
      if(available<qty) return {ok:false,error:'insufficient_stock',product_id:line.id,sku:line.sku||'',available:publicAvailable(available)};
      let remaining=qty;const allocations=[];
      for(const warehouseId of orderedWarehouseIds(variant,warehouses)){
        if(remaining<=0)break;const level=variant.inventory[warehouseId]||normalizeLevel();
        variant.inventory[warehouseId]=level;
        if(level.on_hand===null){allocations.push({warehouse_id:warehouseId,qty:remaining,unlimited:true});remaining=0;break;}
        const canTake=Math.max(0,Number(level.on_hand||0)-Number(level.reserved||0));const take=Math.min(remaining,canTake);
        if(take>0){level.reserved=Number(level.reserved||0)+take;allocations.push({warehouse_id:warehouseId,qty:take});remaining-=take;}
      }
      if(remaining>0)return {ok:false,error:'insufficient_stock',product_id:line.id,sku:variant.sku||'',available:publicAvailable(available)};
      return {value:syncProductAggregates(p),meta:{allocations,variant_id:variant.id,variant_label:variant.label,sku:variant.sku,barcode:variant.barcode}};
    });
    if(!r.ok){
      for(const x of held) await reverseAllocations(x.id,x.variant_id,x.allocations);
      return r;
    }
    Object.assign(line,{variant_id:r.meta.variant_id,variant_label:r.meta.variant_label,sku:r.meta.sku,barcode:r.meta.barcode,inventory_allocations:r.meta.allocations});
    held.push({id:line.id,variant_id:r.meta.variant_id,allocations:r.meta.allocations});
  }
  return {ok:true,items:lines};
}
// ---------- Inventory helpers ----------
async function appendInventoryLog(ds,row){
  const logId=crypto.randomUUID();const log={id:logId,...row,at:new Date().toISOString()};
  await ds.setJSON(`inventory-log:${logId}`,log);await appendToIndex(ds,'inventory-log-index',logId,{unique:false,cap:10000});return log;
}
async function adjustStock(ds, productId, delta, reason, ss, orderNo, variantId='', warehouseId=DEFAULT_WAREHOUSE.id){
  let meta=null;
  const r=await atomicProductMutation(productId,p=>{
    p=normalizeProductInventory(p,{clone:false});const variant=findProductVariant(p,variantId);
    if(!variant)return {ok:false,error:'variant_not_found'};
    const level=variant.inventory[warehouseId]||normalizeLevel();variant.inventory[warehouseId]=level;
    if(level.on_hand===null)return {ok:false,error:'unlimited_stock'};
    const before=Number(level.on_hand||0),after=Math.max(Number(level.reserved||0),before+Number(delta||0));
    level.on_hand=after;meta={before,after,delta:after-before,sku:variant.sku||'',variant_id:variant.id,warehouse_id:warehouseId};
    return {value:syncProductAggregates(p),meta};
  });
  if(!r.ok) return null;
  await appendInventoryLog(ds,{product_id:productId,sku:r.meta.sku,variant_id:r.meta.variant_id,warehouse_id:r.meta.warehouse_id,delta:r.meta.delta,before:r.meta.before,after:r.meta.after,reason,order_no:orderNo||null,admin:ss?.data?.type==='admin'?ss.data.username:null});return r.product;
}
async function mutateOrderItemInventory(ds,item,mode,ss,orderNo){
  const pid=item.id||item.product_id,qty=Math.abs(Number(item.qty||item.quantity||0));if(!pid||!qty)return;
  const r=await atomicProductMutation(pid,p=>{
    p=normalizeProductInventory(p,{clone:false});const variant=findProductVariant(p,item.variant_id,item.sku,item.barcode);if(!variant)return {ok:false,error:'variant_not_found'};
    const allocations=Array.isArray(item.inventory_allocations)&&item.inventory_allocations.length?item.inventory_allocations:[{warehouse_id:DEFAULT_WAREHOUSE.id,qty}];const changes=[];
    for(const allocation of allocations){const warehouseId=allocation.warehouse_id||DEFAULT_WAREHOUSE.id;const amount=Math.abs(Number(allocation.qty||0));const level=variant.inventory[warehouseId]||normalizeLevel();variant.inventory[warehouseId]=level;if(level.on_hand===null)continue;const before=Number(level.on_hand||0);
      if(mode==='deduct'){level.on_hand=Math.max(0,before-amount);level.reserved=Math.max(0,Number(level.reserved||0)-amount);}
      if(mode==='release')level.reserved=Math.max(0,Number(level.reserved||0)-amount);
      if(mode==='restore')level.on_hand=before+amount;
      changes.push({warehouse_id:warehouseId,before,after:Number(level.on_hand||0),delta:Number(level.on_hand||0)-before,qty:amount});
    }
    return {value:syncProductAggregates(p),meta:{changes,variant_id:variant.id,sku:variant.sku||''}};
  });
  if(!r.ok)throw new Error(r.error||'inventory_conflict');
  if(mode!=='release')for(const change of r.meta.changes)await appendInventoryLog(ds,{product_id:pid,sku:r.meta.sku,variant_id:r.meta.variant_id,warehouse_id:change.warehouse_id,delta:change.delta,before:change.before,after:change.after,reason:mode==='deduct'?'order_paid':'order_cancelled',order_no:orderNo||null,admin:ss?.data?.type==='admin'?ss.data.username:null});
}
async function deductStockForOrder(ds, order, ss){
  if(!order || order.stock_deducted) return;
  for(const item of (order.items||[]))await mutateOrderItemInventory(ds,item,'deduct',ss,order.order_no);
  order.stock_reserved=false;order.stock_deducted=true;
}
async function releaseReservationForOrder(ds,order){
  if(!order||!order.stock_reserved||order.stock_deducted)return;
  for(const item of (order.items||[]))await mutateOrderItemInventory(ds,item,'release',null,order.order_no);order.stock_reserved=false;
}
async function restoreStockForOrder(ds,order,ss){
  if(!order||!order.stock_deducted)return;
  for(const item of (order.items||[]))await mutateOrderItemInventory(ds,item,'restore',ss,order.order_no);order.stock_deducted=false;
}
function slugify(name){
  const base=(name||'').trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g,'-').replace(/(^-+|-+$)/g,'');
  return base || 'item';
}


// ---------- Roles ----------
// The env-based admin (ADMIN_USERNAME/ADMIN_PASSWORD) is always super_admin.
// Additional admin accounts can be created BY a super_admin from the admin UI
// and are stored in Blobs with a limited 'admin' role (cannot touch settings/users).
function isAdmin(ss){ return ss.data?.type==='admin'; }
function isSupplier(ss){ return ss.data?.type==='supplier' && !!ss.data?.supplier_id; }
/**
 * The store manager: everything a super admin can reach, except the money and
 * the keys.
 *
 * A shop with one super-admin account has one person who can do anything and
 * everybody else locked out of half the console. This is the rung between them:
 * somebody who runs the shop day to day without being handed the ability to pay
 * agents or read the payment gateway's secret key.
 *
 * Named for the job rather than the rank. "รองผู้ดูแลระบบ" would say this person
 * is one step below the owner and nothing about what that step costs them;
 * "ผู้จัดการร้าน" is a role a Thai shop already understands — runs the place,
 * does not sign the cheques — and that is exactly the permission set.
 *
 * Written as a denial list rather than a permission list, deliberately, because
 * that is the shape of the instruction: reach everything except the API and the
 * finances. The obvious risk of a denial list is the action added next year that
 * nobody thinks to deny — so R142 fails when a super-admin-only action appears
 * that is not named in one of these two sets, which turns "somebody has to
 * remember" into "the suite will not pass".
 *
 * Two reasons an action is denied, kept apart because they are different
 * arguments and a future reader deserves to see which one applies.
 */

/* Money leaving the business, or the rules that decide how much leaves. A
   manager runs the shop; paying out against it is the owner's signature. */
const MANAGER_DENIED_MONEY = new Set([
  'admin.payouts.list',        // who is owed
  'admin.payout.get',
  'admin.payout.action',       // and paying them
  'admin.settlements.list',    // what the shop owes its suppliers
  'admin.settlements.action',
  'admin.commissions.list',    // the agent ledger
  'admin.agents.levels.save',  // the rates that ledger is computed from
  'admin.agents.action',       // approve, suspend and set_rate — the rate is why
]);

/*
 * Credentials, integrations, and anything reaching the platform underneath the
 * shop. "API" in the owner's words: the places a token, a secret key or a whole
 * database lives.
 *
 * `business.settings.save` is the sharpest of these — one screen holds the Omise
 * secret key, the SMTP password and both Telegram bot tokens. A backup is the
 * same problem in one file: it contains every one of them, so exporting it is
 * reading them.
 */
const MANAGER_DENIED_KEYS = new Set([
  'business.settings.save',            // payment, SMTP and bot credentials
  'business.settings.test_email',      // uses the SMTP password
  'admin.suppliers.credentials',       // a supplier's own login
  'telegram.chat.setup',               // bot tokens
  'telegram.chat.test',
  'admin.backup.export',               // every secret above, in one file
  'admin.backup.restore',              // and overwriting the shop with one
  'admin.users.list',                  // the admin accounts themselves —
  'admin.users.create',                // a manager who can mint a super admin
  'admin.users.update',                // is a super admin with extra steps
  'admin.users.delete',
  'admin.production.status',           // infrastructure
  'admin.production.test_telegram',
  'admin.errors.list',                 // the failure log: internals and payloads
  'admin.inventory.migrate',           // a one-way data migration
  'platform.tenants',                  // the platform above this shop
  'admin.site.marketing',              // the shop's advertising accounts
]);

/**
 * The three rungs, and the only strings the API will store as a role.
 *
 * Anything else becomes 'admin', the narrowest of them — a typo in a role name
 * has to cost somebody access rather than grant it.
 */
const ADMIN_ROLES=['admin','manager','super_admin'];

/** True for the owner account. Nothing narrows this. */
function isSuperAdmin(ss){ return ss.data?.type==='admin' && ss.data?.role==='super_admin'; }
/** True for a store manager, whatever they are or are not allowed to do next. */
function isManager(ss){ return ss.data?.type==='admin' && ss.data?.role==='manager'; }

/**
 * May this session perform this super-admin action?
 *
 * The action name is passed in rather than inferred, so the denial is decided by
 * the same string the dispatcher matched on and the two cannot drift apart.
 */
function maySuperAdmin(ss,actionName){
  if(isSuperAdmin(ss))return true;
  if(!isManager(ss))return false;
  return !MANAGER_DENIED_MONEY.has(actionName)&&!MANAGER_DENIED_KEYS.has(actionName);
}
function requireCsrf(b, ss){
  return !!ss.data?.csrf && String(b?.csrf||'')===ss.data.csrf;
}
async function getBusinessSettings(){
  const saved = await getJSON(dataStore(),'business-settings')||{};
  const merged={
    payment: { ...DEFAULT_BUSINESS_SETTINGS.payment, ...(saved.payment||{}) },
    email: { ...DEFAULT_BUSINESS_SETTINGS.email, ...(saved.email||{}) },
    facebook: { ...DEFAULT_BUSINESS_SETTINGS.facebook, ...(saved.facebook||{}) },
    shopee: { ...DEFAULT_BUSINESS_SETTINGS.shopee, ...(saved.shopee||{}) },
    lazada: { ...DEFAULT_BUSINESS_SETTINGS.lazada, ...(saved.lazada||{}) },
    notifications: { ...DEFAULT_BUSINESS_SETTINGS.notifications, ...(saved.notifications||{}) },
    updated_at: saved.updated_at||null,
    updated_by: saved.updated_by||null
  };
  // Environment variables are the production source of truth for secrets/API credentials.
  if(process.env.PROMPTPAY_ID) merged.payment.promptpay_id=process.env.PROMPTPAY_ID;
  if(process.env.OMISE_SECRET_KEY) merged.payment.omise_secret_key=process.env.OMISE_SECRET_KEY;
  if(process.env.SMTP_HOST) merged.email.smtp_host=process.env.SMTP_HOST;
  if(process.env.SMTP_PORT) merged.email.smtp_port=Number(process.env.SMTP_PORT);
  if(process.env.SMTP_USER) merged.email.smtp_user=process.env.SMTP_USER;
  if(process.env.SMTP_PASS) merged.email.smtp_pass=process.env.SMTP_PASS;
  if(process.env.FB_PAGE_ACCESS_TOKEN) merged.facebook.page_access_token=process.env.FB_PAGE_ACCESS_TOKEN;
  if(process.env.SHOPEE_PARTNER_ID) merged.shopee.partner_id=process.env.SHOPEE_PARTNER_ID;
  if(process.env.SHOPEE_PARTNER_KEY) merged.shopee.partner_key=process.env.SHOPEE_PARTNER_KEY;
  if(process.env.SHOPEE_SHOP_ID) merged.shopee.shop_id=process.env.SHOPEE_SHOP_ID;
  if(process.env.LAZADA_APP_KEY) merged.lazada.app_key=process.env.LAZADA_APP_KEY;
  if(process.env.LAZADA_APP_SECRET) merged.lazada.app_secret=process.env.LAZADA_APP_SECRET;
  if(process.env.TELEGRAM_ALERT_BOT_TOKEN) merged.notifications.telegram_alert_bot_token=process.env.TELEGRAM_ALERT_BOT_TOKEN;
  if(process.env.TELEGRAM_ALERT_CHAT_ID) merged.notifications.telegram_alert_chat_id=process.env.TELEGRAM_ALERT_CHAT_ID;
  if(process.env.TELEGRAM_CHAT_BOT_TOKEN) merged.notifications.telegram_chat_bot_token=process.env.TELEGRAM_CHAT_BOT_TOKEN;
  if(process.env.TELEGRAM_CHAT_CHAT_ID) merged.notifications.telegram_chat_chat_id=process.env.TELEGRAM_CHAT_CHAT_ID;
  if(process.env.TELEGRAM_BOT_TOKEN) merged.notifications.telegram_bot_token=process.env.TELEGRAM_BOT_TOKEN;
  if(process.env.TELEGRAM_CHAT_ID) merged.notifications.telegram_chat_id=process.env.TELEGRAM_CHAT_ID;
  if(process.env.ORDER_NOTIFY_EMAIL) merged.notifications.order_notify_email=process.env.ORDER_NOTIFY_EMAIL;
  return merged;
}
function supplierPublicView(s){
  if(!s) return null;
  return {id:s.id,name:s.name,code:s.code,status:s.status,logo_url:s.logo_url||'',description:s.description||'',categories:Array.isArray(s.categories)?s.categories:[],fulfillment_sla_days:Number(s.fulfillment_sla_days||0)};
}
async function supplierById(ds,id){ return id?await getJSON(ds,`supplier:${id}`):null; }
async function createOrderSettlement(ds,order){
  const key=`settlement-order:${order.id}`;
  const existing=await getJSON(ds,key); if(existing) return existing;
  const groups=new Map();
  for(const item of order.items||[]){
    const supplierId=clean(item.supplier_id,80)||'platform';
    const current=groups.get(supplierId)||{supplier_id:supplierId,supplier_name:clean(item.supplier_name,160)||'Platform inventory',product_cost:0,sales_subtotal:0,items:[]};
    current.product_cost+=Math.max(0,Number(item.cost_price||0))*Math.max(1,Number(item.qty||1));
    current.sales_subtotal+=Math.max(0,Number(item.price||0))*Math.max(1,Number(item.qty||1));
    current.items.push({product_id:item.id,sku:item.sku||'',name:item.name||'',qty:Number(item.qty||0),unit_cost:Number(item.cost_price||0),unit_price:Number(item.price||0)});
    groups.set(supplierId,current);
  }
  const now=new Date().toISOString();
  const rows=[...groups.values()].map(group=>({
    id:crypto.randomUUID(), settlement_no:`SET-${Date.now().toString(36).toUpperCase()}-${random(2).slice(0,4).toUpperCase()}`,
    order_id:order.id,order_no:order.order_no,supplier_id:group.supplier_id,supplier_name:group.supplier_name,
    sales_subtotal:Math.round(group.sales_subtotal*100)/100, product_cost:Math.round(group.product_cost*100)/100,
    agent_commission_reserve:0, platform_gross_margin:Math.round((group.sales_subtotal-group.product_cost)*100)/100,
    status:'pending_payment',items:group.items,created_at:now,updated_at:now
  }));
  const ids=[]; for(const row of rows){await ds.setJSON(`settlement:${row.id}`,row);ids.push(row.id);}
  await mutateIndexAtomically(ds,'settlement-index',(idx)=>[...new Set([...idx,...ids])]);
  const record={order_id:order.id,order_no:order.order_no,settlement_ids:ids,created_at:now}; await ds.setJSON(key,record); return record;
}
async function syncOrderSettlementStatus(ds,order){
  const record=await getJSON(ds,`settlement-order:${order.id}`); if(!record)return;
  const status=['cancelled','refunded','expired'].includes(order.status)?'void':order.status==='completed'?'ready_to_remit':['paid','processing','packing','shipped'].includes(order.status)?'fulfillment':'pending_payment';
  for(const id of record.settlement_ids||[]){const row=await getJSON(ds,`settlement:${id}`);if(!row||row.status==='remitted')continue;row.status=status;row.updated_at=new Date().toISOString();await ds.setJSON(`settlement:${id}`,row);}
}
function maskSettingsForAdmin(s){
  // Non-super-admins get masked secrets (existence flags only), never raw secrets.
  return {
    payment: { ...s.payment, omise_secret_key: s.payment.omise_secret_key ? '••••••••' : '' },
    email: { ...s.email, smtp_pass: s.email.smtp_pass ? '••••••••' : '' },
    facebook: { ...s.facebook, page_access_token: s.facebook.page_access_token ? '••••••••' : '', verify_token: s.facebook.verify_token ? '••••••••' : '' },
    shopee: { ...s.shopee, partner_key: s.shopee.partner_key ? '••••••••' : '' },
    lazada: { ...s.lazada, app_secret: s.lazada.app_secret ? '••••••••' : '' },
    notifications: {
      ...s.notifications,
      telegram_alert_bot_token: s.notifications.telegram_alert_bot_token ? '••••••••' : '',
      telegram_chat_bot_token: s.notifications.telegram_chat_bot_token ? '••••••••' : '',
      telegram_bot_token: s.notifications.telegram_bot_token ? '••••••••' : ''
    },
    updated_at: s.updated_at
  };
}
function preservedSecret(input,current=''){
  const value=String(input??'').trim();
  // Admin reads are deliberately masked. Saving an unrelated field used to
  // replace the real credential with these bullets and break the integration.
  if(!value||/^[•*]+$/.test(value))return String(current||'');
  return value;
}
async function buildMailer(settings){
  const env = process.env;
  const host = settings.email.smtp_host || env.SMTP_HOST;
  const port = Number(settings.email.smtp_port || env.SMTP_PORT || 587);
  const user = settings.email.smtp_user || env.SMTP_USER;
  const pass = settings.email.smtp_pass || env.SMTP_PASS;
  if(!host||!user||!pass) return null;
  // Cloudflare Workers have no raw TCP sockets, so nodemailer cannot run
  // there. Load the transport only when the current runtime supports it.
  if(globalThis.WebSocketPair)return null;
  const moduleName='nodemailer';
  const nodemailer=(await import(moduleName)).default;
  return nodemailer.createTransport({
    host, port, secure: !!(settings.email.smtp_secure ?? port===465),
    auth: { user, pass }, connectionTimeout:5000, greetingTimeout:5000, socketTimeout:8000
  });
}
async function sendFacebookMessage(settings, psid, text){
  const token = settings.facebook.page_access_token || process.env.FB_PAGE_ACCESS_TOKEN;
  if(!token) return { ok:false, error:'facebook_not_configured' };
  const res = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(token)}`,{
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ recipient:{ id: psid }, message:{ text } })
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok) return { ok:false, error: data?.error?.message || 'facebook_send_failed' };
  return { ok:true, data };
}


/**
 * Binds the request to its merchant, then runs the real handler inside that
 * context. Everything downstream — sessions, rate limits, the catalogue, the
 * admin console — is scoped to this tenant's namespaces, so two merchants on
 * the same deployment can never see each other's data.
 */
/**
 * The identifier that ties a shopper's complaint to a line in the log.
 *
 * Cloudflare stamps every request with a ray id, which is also what appears on
 * its own error pages and in its dashboard, so reusing it means one identifier
 * spans the edge and the application instead of two that cannot be joined.
 * Anything else gets a fresh one.
 */
function requestId(req) {
  return clean(req?.headers?.get('cf-ray'), 60) || crypto.randomUUID().slice(0, 12);
}

/**
 * One line per request, with the four things an incident actually needs.
 *
 * Until now the only trace of a request was whatever ad-hoc console.warn it
 * happened to trip over on the way through. There was no way to answer "the
 * shop was slow at 14:20" or "this customer says their order failed" — no id
 * to search for, no timing, no record that a request had even arrived.
 *
 * Deliberately narrow: an id, which shop, which action, the status and how
 * long it took. No path, no query string, no body, no headers. Those carry
 * email addresses, phone numbers, addresses, coupon codes and session cookies,
 * and a log is the easiest place in a system to leak them — logs get shipped to
 * third parties, read over shoulders and kept long after the data they describe
 * was deleted. The action name is enough to know what someone was doing.
 */
function logRequest({ id, tenant, action, status, startedAt, error, cache }) {
  const line = {
    request_id: id,
    tenant_id: tenant,
    action: action || 'unknown',
    status,
    latency_ms: Math.round(performance.now() - startedAt),
  };
  // Present only on an answer the edge cache served, so a log filtered for it
  // says how much of the read traffic never reached Supabase at all.
  if (cache) line.cache = cache;
  if (error) line.error = String(error).slice(0, 200);
  // A failure is worth a warning; everything else is informational, so an
  // operator filtering for problems is not reading every catalogue request.
  if (status >= 500 || error) console.warn('request', JSON.stringify(line));
  else console.log('request', JSON.stringify(line));
}

/**
 * `platformEnv` is the Cloudflare binding object, passed in by whichever entry
 * called this — `functions/api/[[path]].js` or `server/api/index.ts`. Both
 * already had it and both threw it away after copying its string values onto
 * `process.env`, which is where every secret in this file is read from. A KV
 * namespace is not a string: `Object.assign(process.env, env)` turns it into
 * `"[object Object]"`, so a binding can only arrive as an argument. Optional on
 * purpose — the API has to keep answering on a deployment with no bindings at
 * all, which is every deployment before this one.
 */
export default async (req, platformEnv = null) => {
  const startedAt = performance.now();
  const id = requestId(req);
  const url = new URL(req.url);
  const action = clean(url.searchParams.get('action'), 80);
  const tenant = resolveTenant(url.hostname);

  // No tenant owns this host. On a multi-merchant deployment that request has
  // nowhere legitimate to go, and answering it out of whichever merchant
  // happens to be first in the registry is how one shop ends up serving
  // another's catalogue and writing into another's namespace. Refuse instead.
  if (!tenant) {
    logRequest({ id, tenant: 'unknown', action, status: 404, startedAt, error: 'unknown_tenant_host' });
    return json({ ok: false, error: 'unknown_tenant_host' }, 404);
  }

  /**
   * Keep the failure, not just print it.
   *
   * `logRequest` writes to the worker's console, which on this plan has no
   * retention and nobody watching. A failure that only exists there is a
   * failure nobody can look up tomorrow, which is how the storefront spent
   * hours answering 1102 with no record of it anywhere.
   *
   * Only failures are stored — a 5xx or a throw. A shop answering normally
   * writes nothing, so this costs nothing on the path that matters.
   */
  const keep = (status, message) => tenantContext.run(tenant, () => recordFailure(dataStore(), {
    action, status, message, requestId: id, path: url.pathname,
  })).catch(() => {});

  try {
    /*
     * The edge's own copy, before anything reaches Supabase.
     *
     * Only public reads, only GET, and only answers that carried no cookie when
     * they were stored — see api/lib/edge-cache.js for why each of those is a
     * condition rather than a precaution. A hit is logged like any other
     * answer, with its status, so the shop's own log shows how often this is
     * saving a round trip instead of the saving being invisible.
     */
    const cached = await edgeCacheMatch(req, action);
    if (cached) {
      logRequest({ id, tenant: tenant.id, action, status: cached.status, startedAt, cache: 'HIT' });
      return cached;
    }
    const response = await tenantContext.run(tenant, () => handleRequest(req, tenant, platformEnv));
    const status = response?.status ?? 0;
    logRequest({ id, tenant: tenant.id, action, status, startedAt });
    if (status === 200) return await edgeCachePut(req, action, response);
    // Not awaited. A shopper waiting on a failing request must not also wait
    // on the record of it, and a lost line costs less than a slower outage.
    if (status >= 500) void keep(status, `answered ${status}`);
    return response;
  } catch (error) {
    // A throw is how this API reports a storage outage — see the catalogue
    // reads, which refuse rather than answer 200 with an empty shop. Record it
    // before it leaves, or the one request that mattered is the one with no
    // line in the log.
    logRequest({ id, tenant: tenant.id, action, status: 500, startedAt, error: error?.message || error });
    void keep(500, error?.message || String(error));
    throw error;
  }
};



/**
 * How stale a backup may be before the readiness report stops calling it good.
 *
 * A week: long enough that a shop taking one export after each busy weekend
 * stays green, short enough that "we have a backup" cannot quietly mean one
 * from last quarter. Losing a week of orders is already a bad day.
 */
/**
 * Where the ids of the products a merchant put on the home shelf are kept.
 *
 * The flag lives on each product; this is the list of which ones carry it, so
 * the storefront never has to read a catalogue to find a dozen.
 */
const FEATURED_INDEX='home-featured-index';
/*
 * Every path that can set `home_featured` has to say so here.
 *
 * The index was written in one place — the แนะนำ button in the product table —
 * but three other actions can turn the same flag on: the product edit form
 * (`admin.products.update`), a new product created with it already set
 * (`admin.products.create`), and `admin.products.bulk_patch`, whose allow-list
 * has always included `home_featured`. A product flagged through any of those
 * had the flag on the record and no entry in the index, and the storefront
 * reads the index — so the merchant ticked สินค้าแนะนำ, saved, and the shelf
 * never changed. Deleting a featured product left its id behind as well.
 *
 * Turning the flag off is safe either way, because the read side re-checks
 * `home_featured` on each product it loads; it is turning it *on* that is lost.
 * Both directions are kept correct here regardless, so the index does not
 * accumulate ids nothing will ever clear.
 */
/*
 * slug → id, so a keyword URL costs one read.
 *
 * Product pages are addressed by slug now, because the ids in this catalogue
 * are hashes of the import source and carry no words for a search engine or a
 * person to read. Resolving a slug used to mean an indexed query when Postgres
 * was on and a scan of every product when it was not — and it is not: the live
 * shop reports `"database":"not-enabled"`, so every product page view would
 * have read all 1,015 rows.
 *
 * One small object instead. A thousand short strings is a few tens of
 * kilobytes, read once per page and written only when a slug changes.
 *
 * Stale entries are harmless: `products.get` re-checks that the product it
 * found actually carries the slug it was asked for, so a mapping left behind by
 * a rename resolves to nothing rather than to the wrong product.
 */
const SLUG_INDEX='product-slug-index';
/*
 * Where a renamed product used to live.
 *
 * A slug is built from the product name, so editing the name moves the page.
 * Dropping the old slug on the floor turns every link to it — a search result,
 * a bookmark, a message somebody sent a customer — into a 404, and hands back
 * whatever ranking that address had earned. Retired slugs are kept here and
 * answered with a permanent redirect to where the product is now, which is the
 * one response that moves the ranking across with it.
 *
 * Capped, because this only ever grows. The cap is generous enough that a shop
 * renaming its whole catalogue keeps every address, and the oldest are the
 * first to go when it is reached — an address nobody has linked to in a
 * thousand renames is the safest one to forget.
 */
const SLUG_HISTORY='product-slug-history';
const SLUG_HISTORY_MAX=5000;
async function syncSlugIndex(ds,id,slug){
  const key=String(slug||'').trim();
  const map=await getJSON(ds,SLUG_INDEX)||{};
  const retired=[];
  let changed=false;
  // A rename leaves the old slug pointing here. It comes out of the live map —
  // two live addresses for one page is the duplicate the canonical exists to
  // prevent — and goes into the history, so the old address still leads
  // somewhere.
  for(const [existing,target] of Object.entries(map)) if(target===id&&existing!==key){delete map[existing];retired.push(existing);changed=true;}
  if(key&&map[key]!==id){map[key]=id;changed=true;}
  if(changed)await ds.setJSON(SLUG_INDEX,map);
  if(!retired.length)return;
  const history=await getJSON(ds,SLUG_HISTORY)||{};
  for(const old of retired) history[old]=id;
  // Never shadow a live address: a slug freed by one product and taken by
  // another must resolve to the product holding it, not redirect away from it.
  for(const live of Object.keys(map)) delete history[live];
  const keys=Object.keys(history);
  if(keys.length>SLUG_HISTORY_MAX) for(const old of keys.slice(0,keys.length-SLUG_HISTORY_MAX)) delete history[old];
  await ds.setJSON(SLUG_HISTORY,history);
}

async function syncFeaturedIndex(ds,id,enabled){
  if(!id)return;
  /*
   * The shelf is cached in the worker, and this is the one function every path
   * that can change it already calls — the console button, the edit form,
   * create, delete and the spreadsheet import. Clearing it beside one of those
   * six call sites would mean the seventh, added later, quietly served a stale
   * shelf for two minutes. Clearing it here cannot be forgotten.
   */
  forgetPublicRead('products.featured');
  const index=await getJSON(ds,FEATURED_INDEX)||[];
  const without=index.filter(x=>x!==id);
  const next=enabled?[...without,id]:without;
  // An unchanged list is not worth a write: bulk_patch runs this once per row.
  if(next.length===index.length&&(!enabled||index.includes(id)))return;
  await ds.setJSON(FEATURED_INDEX,next);
}

const BACKUP_MAX_AGE_DAYS=7;

const TSK_CHAT_MAX_TEXT=2000;
const TSK_CHAT_MAX_MESSAGES=200;
const TSK_CHAT_MAX_CONVERSATIONS=200;
/**
 * A room with no message either way for this long is finished.
 *
 * Closed, not deleted: a customer's question is the whole point of the channel,
 * and losing one because nobody happened to be at the console for ten minutes
 * would be worse than a cluttered list. The thread and its messages stay
 * readable; it just stops occupying the open queue and stops counting on the
 * navigation badge.
 */
const TSK_CHAT_IDLE_CLOSE_MS=10*60*1000;
/**
 * How long a conversation is kept before it is deleted for good.
 *
 * Closing a room and keeping a room are different decisions. A room goes quiet
 * after ten minutes and is closed, because the question has been answered; it
 * stays readable, because a customer coming back next week to check what they
 * were told is the entire reason an account has a chat history at all.
 *
 * Thirty days is where that stops being useful and starts being a liability.
 * These threads carry names, phone numbers and delivery addresses — everything
 * a shopper types while arranging a delivery — and keeping that indefinitely is
 * a growing pile of somebody else's personal data with no one asking for it.
 * The shop's own answer is in the order record, which is where it belongs and
 * is not touched by this.
 *
 * Swept opportunistically, a few rooms per request, in the same places the
 * guest-room collector already runs: a scheduled job would be a second thing to
 * keep alive, and this catalogue's traffic is more than enough to keep the
 * sweep moving.
 */
const TSK_CHAT_RETENTION_MS=30*24*60*60*1000;
/** Rooms examined per request. Bounded so a sweep never delays a reply. */
const TSK_CHAT_SWEEP_BATCH=6;

/** True once a room is past the retention window, whoever it belongs to. */
function tskChatIsExpired(conversation){
  if(!conversation)return false;
  const last=Date.parse(conversation.updated_at||conversation.created_at||'');
  return Number.isFinite(last)&&(Date.now()-last)>TSK_CHAT_RETENTION_MS;
}

/**
 * Delete a handful of rooms that are past the window, and forget them.
 *
 * The record, the account's list and the shop-wide index all have to lose it
 * together — a deleted room still named in an index is a read that returns
 * nothing on every future sweep, for ever.
 */
/**
 * Remove chat rooms, and everything that points at them.
 *
 * A room is three things: the record, its place in `chat-conversation-index`,
 * and its place in that customer's own `chat-by-customer` list. Deleting only
 * the record leaves two indexes naming a room that is gone, and the inbox then
 * spends a read per ghost on every listing.
 *
 * `expiredOnly` is what separates the retention sweep from a deliberate
 * deletion. The sweep re-checks each room's age before removing it, because it
 * works from a list gathered earlier and a room can have been replied to since;
 * an operator deleting a room they are looking at means that room.
 */
async function tskChatRemove(ds,candidateIds,{expiredOnly=true,limit=TSK_CHAT_SWEEP_BATCH}={}){
  const ids=(Array.isArray(candidateIds)?candidateIds:[]).slice(0,limit);
  const removed=[];
  for(const id of ids){
    try{
      const room=await getJSON(ds,'chat-conversation:'+id);
      if(!room){removed.push(id);continue;}
      if(expiredOnly&&!tskChatIsExpired(room))continue;
      await ds.delete('chat-conversation:'+id);
      if(room.customer_id){
        const key='chat-by-customer:'+room.customer_id;
        const list=await getJSON(ds,key)||[];
        const kept=list.filter(x=>x!==id);
        if(kept.length!==list.length)await ds.setJSON(key,kept);
      }
      removed.push(id);
    }catch(error){ /* a room that will not delete is retried next time */ }
  }
  if(removed.length){
    const index=await getJSON(ds,'chat-conversation-index')||[];
    const kept=index.filter(x=>!removed.includes(x));
    if(kept.length!==index.length)await ds.setJSON('chat-conversation-index',kept);
  }
  return removed;
}

/** The retention sweep: only rooms old enough to have expired. */
const tskChatSweepExpired=(ds,candidateIds)=>tskChatRemove(ds,candidateIds,{expiredOnly:true});

async function tskTelegramConfig(){
  const settings=await getBusinessSettings().catch(()=>({}))||{};
  const notifications=settings.notifications&&typeof settings.notifications==='object'?settings.notifications:{};
  // The live chat's own bot, separate from the alert bot in notifyTelegram.
  // Customers' questions and the shop's own order alerts were arriving in one
  // thread and burying each other. TELEGRAM_CHAT_* is preferred; the older
  // shared pair still works until it is set.
  return {
    token:String(process.env.TELEGRAM_CHAT_BOT_TOKEN||notifications.telegram_chat_bot_token||process.env.TELEGRAM_BOT_TOKEN||notifications.telegram_bot_token||'').trim(),
    chatId:String(process.env.TELEGRAM_CHAT_CHAT_ID||notifications.telegram_chat_chat_id||process.env.TELEGRAM_CHAT_ID||notifications.telegram_chat_id||'').trim(),
    webhookSecret:String(process.env.TELEGRAM_WEBHOOK_SECRET||'').trim(),
    adminIds:String(process.env.TELEGRAM_ADMIN_IDS||'').split(',').map(x=>x.trim()).filter(Boolean)
  };
}

async function tskTelegramCall(config,method,payload={}){
  if(!config.token||!config.chatId){
    const error=new Error('telegram_not_configured');error.code='telegram_not_configured';throw error;
  }
  const response=await fetch('https://api.telegram.org/bot'+config.token+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||result.ok!==true){
    const error=new Error('telegram_request_failed');error.code='telegram_request_failed';throw error;
  }
  return result.result;
}

async function tskChatConversation(ds,id){
  return id?getJSON(ds,'chat-conversation:'+id).catch(()=>null):null;
}

async function tskChatSave(ds,conversation){
  conversation.updated_at=new Date().toISOString();
  await ds.setJSON('chat-conversation:'+conversation.id,conversation);
  return conversation;
}

async function tskChatCreate(ds,visitorToken,customerId=''){
  const conversation={id:random(16),visitor_token_hash:sha(visitorToken),customer_id:customerId||null,status:'open',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),message_seq:0,messages:[]};
  const index=await getJSON(ds,'chat-conversation-index')||[];
  const ordered=[conversation.id,...index.filter(x=>x!==conversation.id)];
  // Rooms pushed past the cap were only dropped from this index; the record
  // itself stayed in `app_kv` for ever, so a run of guest chats grew the table
  // without bound and nothing could ever reach those rows again. An account's
  // rooms are its history and are still listed under `chat-by-customer:`, so
  // only ownerless guest rooms are collected. A few per call keeps the work
  // bounded even if the index was left long by an older release.
  const dropped=ordered.slice(TSK_CHAT_MAX_CONVERSATIONS,TSK_CHAT_MAX_CONVERSATIONS+5);
  await ds.setJSON('chat-conversation-index',ordered.slice(0,TSK_CHAT_MAX_CONVERSATIONS));
  for(const staleId of dropped){
    try{
      const stale=await getJSON(ds,'chat-conversation:'+staleId);
      if(stale&&!stale.customer_id)await ds.delete('chat-conversation:'+staleId);
    }catch(error){ /* collecting an old room must never fail a new one */ }
  }
  await tskChatSave(ds,conversation);
  if(customerId)await tskChatIndexForCustomer(ds,conversation,customerId);
  return conversation;
}

/** The signed-in customer on this request, if there is one. */
function tskChatCustomerId(ss){ return ss?.data?.type==='customer'?String(ss.data.customer?.id||''):''; }

/**
 * Who is asking, and what they were looking at.
 *
 * The shop's answer to a question is usually in the shop's own records, and
 * until now none of it reached the person answering: a message arrived in the
 * Telegram group as a room id and a line of text, so "where is my order" began
 * with the operator asking who they were talking to. This is the one thing a
 * hosted help desk cannot do and we can — it reads the customer we already
 * have a session for, and the order they already placed.
 *
 * Deliberately cheap: one index read and at most one order read. Rule 9 in
 * CLAUDE.md exists because a page that awaited one id at a time timed out, and
 * a chat message must not become the next instance of that.
 *
 * Returns '' for a guest with nothing on file, so callers can append it
 * unconditionally without producing an empty heading.
 */
/**
 * The text an n8n workflow meant to answer with, wherever it put it.
 *
 * There is no one shape. A Respond-to-Webhook node returns the object it was
 * given; a workflow ending on an AI node returns n8n's own item wrapper,
 * `[{json:{...}}]`; an OpenAI node inside it returns `message.content`; and
 * plenty of workflows just return a string. The four spellings this used to
 * read — reply, output, text, response — covered some of that and silently
 * returned '' for the rest.
 *
 * `raw` is the last resort rather than the first: a workflow that answered
 * with a JSON object nobody can read should say so, not have its own braces
 * quoted back at the customer. Only genuinely unparseable bodies fall through
 * to it, and only when they are short enough to be a sentence.
 */
function aiReplyText(data,raw){
  const text=(value)=>String(value==null?'':value).trim();
  const fromObject=(node,depth)=>{
    if(node==null||depth>3)return '';
    if(typeof node==='string')return node.trim();
    if(Array.isArray(node)){
      for(const item of node){const found=fromObject(item,depth+1);if(found)return found;}
      return '';
    }
    if(typeof node!=='object')return '';
    for(const key of ['reply','output','text','response','answer','message','content','result','data','json']){
      if(!(key in node))continue;
      const value=node[key];
      const found=typeof value==='string'?value.trim():fromObject(value,depth+1);
      if(found)return found;
    }
    return '';
  };
  const found=fromObject(data,0);
  if(found)return found.slice(0,6000);
  // A bare string body is an answer. A page of HTML from a proxy in front of
  // the workflow is not, and length is the cheapest way to tell them apart.
  const body=text(raw);
  return (!data&&body&&body.length<=6000&&!/^\s*[<{[]/.test(body))?body:'';
}

/**
 * Give the chat model a small, verified slice of the catalogue.
 *
 * Gemini is an explainer here, not the catalogue search engine. The search
 * backend (Postgres now, Meilisearch when enabled) selects the candidates;
 * only those rows are placed in the prompt. That keeps prices and stock tied
 * to the shop's records and prevents a model from inventing a SKU.
 */
function chatProductLine(product){
  if(!product)return '';
  const variants=Array.isArray(product.variants)
    ? product.variants.slice(0,8).map(v=>clean(v?.label||v?.name||v?.sku,80)).filter(Boolean).join(', ')
    : '';
  return [
    `สินค้า: ${clean(product.name,180)}`,
    product.brand?`แบรนด์: ${clean(product.brand,80)}`:'',
    product.category?`หมวด: ${clean(product.category,80)}`:'',
    product.sku?`SKU: ${clean(product.sku,60)}`:'',
    Number.isFinite(Number(product.price))?`ราคาในระบบ: ${Number(product.price).toLocaleString('th-TH')} บาท`:'',
    Number.isFinite(stockAvailable(product))?`สต็อกในระบบ: ${publicAvailable(stockAvailable(product))} ชิ้น`:'',
    product.description?`รายละเอียด: ${clean(product.description,700)}`:'',
    variants?`ตัวเลือก: ${variants}`:'',
  ].filter(Boolean).join(' | ');
}

function productFinderQuery(message){
  const text=clean(message,500).toLowerCase();
  const intents=[
    [/(น้ำไม่แรง|บ้าน.*ชั้น|น้ำไหลเบา|แรงดันน้ำ|ดูดน้ำ)/,'ปั๊มน้ำ'],
    [/(ตัดหญ้า|สนามหญ้า|วัชพืช)/,'เครื่องตัดหญ้า'],
    [/(เจาะปูน|เจาะผนัง|โรตารี่)/,'สว่านโรตารี่'],
    [/(ขันน็อต|ถอดล้อ|บล็อกกระแทก)/,'บล็อกกระแทก'],
    [/(ล้างรถ|ฉีดน้ำ|ล้างพื้น)/,'เครื่องฉีดน้ำ'],
    [/(เจียร|ตัดเหล็ก)/,'เครื่องเจียร'],
    [/(เลื่อย|ตัดไม้)/,'เลื่อย'],
    [/(พ่นยา|ฉีดยา)/,'เครื่องพ่นยา'],
  ];
  for(const [pattern,query] of intents)if(pattern.test(text))return query;
  return clean(message,120).trim();
}

async function tskChatProducts(ds,message){
  const q=productFinderQuery(message);
  if(q.length<2)return '';
  let rows=[];
  try{
    const fast=await queryProductsPostgres({q,page:1,perPage:5,admin:false});
    if(fast?.products?.length)rows=fast.products;
  }catch{}
  if(!rows.length){
    try{
      const fast=await queryProductsSupabase({q,page:1,perPage:5,admin:false});
      if(fast?.products?.length)rows=fast.products;
    }catch{}
  }
  if(!rows.length){
    try{
      const all=(await listJSONByPrefix(ds,'product:','product-index')).filter(p=>p&&p.state!=='hidden'&&p.state!=='discontinued');
      const exact=all.filter(p=>matchesSearch(p,q));
      rows=(exact.length?exact:fuzzySearch(all,q)).slice(0,5);
    }catch{}
  }
  return rows.slice(0,5);
}

async function tskChatProductContext(ds,message){
  const rows=await tskChatProducts(ds,message);
  const lines=Array.isArray(rows)?rows.map(chatProductLine).filter(Boolean).slice(0,5):[];
  return lines.length?`สินค้าที่ค้นจากฐานข้อมูลร้าน:\n${lines.join('\n')}`:'';
}

async function tskChatContext(ds, ss, page, message=''){
  const lines=[];
  const where=String(page||'').trim().slice(0,200);
  if(/^\/[\w\-/?=&.%]*$/.test(where)) lines.push('\ud83d\udcc4 กำลังดู: '+where);

  const productContext=await tskChatProductContext(ds,message);
  if(productContext)lines.push(productContext);

  const customerId=tskChatCustomerId(ss);
  if(!customerId){
    lines.push('\ud83d\udc64 ผู้เยี่ยมชม (ยังไม่ได้เข้าสู่ระบบ)');
    return lines.join('\n');
  }

  const customer=ss?.data?.customer||{};
  lines.push('\ud83d\udc64 '+(clean(customer.name,80)||'ลูกค้า')+(customer.phone?' \u00b7 '+clean(customer.phone,30):''));

  try{
    const orderIds=await getJSON(ds,'orders-by-customer:'+customerId)||[];
    lines.push('\ud83d\udce6 สั่งซื้อมาแล้ว '+orderIds.length+' ครั้ง');
    // Newest last: appendToIndex pushes. One read, not a loop over the index.
    const latestId=orderIds[orderIds.length-1];
    if(latestId){
      const order=await getJSON(ds,'order:'+latestId);
      if(order)lines.push('\ud83e\uddfe ล่าสุด: '+clean(order.order_no,40)+' \u00b7 '+clean(order.status,30)+' \u00b7 '+Number(order.total||0).toLocaleString('th-TH')+' บาท');
    }
  }catch(error){
    // Context is a courtesy. A shop that cannot read its own orders still has
    // to deliver the customer's message.
  }
  return lines.join('\n');
}

/** Files a room under the account, newest first, so the profile can list it. */
async function tskChatIndexForCustomer(ds,conversation,customerId){
  const key='chat-by-customer:'+customerId;
  const list=await getJSON(ds,key)||[];
  if(list[0]===conversation.id)return;
  await ds.setJSON(key,[conversation.id,...list.filter(x=>x!==conversation.id)].slice(0,TSK_CHAT_MAX_CONVERSATIONS));
}

/**
 * Ties a room to the account that owns it.
 *
 * A guest's thread lives on one browser, because the only thing identifying it
 * is a token in that browser's storage. Once they sign in the room is claimed
 * for the account, so it is still theirs on their phone, and still there weeks
 * later when the browser has forgotten the token.
 */
async function tskChatClaim(ds,conversation,customerId){
  if(!conversation||!customerId)return conversation;
  if(conversation.customer_id&&conversation.customer_id!==customerId)return conversation;
  if(conversation.customer_id!==customerId){
    conversation.customer_id=customerId;
    await tskChatSave(ds,conversation);
  }
  await tskChatIndexForCustomer(ds,conversation,customerId);
  return conversation;
}

/** Either the browser's token or the account it belongs to may open a room. */
function tskChatMayRead(conversation,visitorToken,customerId){
  if(!conversation)return false;
  if(customerId&&conversation.customer_id===customerId)return true;
  return Boolean(visitorToken)&&sha(visitorToken)===conversation.visitor_token_hash;
}

/**
 * Every room this account still has, newest first.
 *
 * "Ever had" until the retention window closed on it. Anything past thirty days
 * is deleted here rather than merely hidden, so the promise the account page
 * makes — history for thirty days — is the same promise the store keeps.
 */
async function tskChatCustomerRooms(ds,customerId){
  const ids=await getJSON(ds,'chat-by-customer:'+customerId)||[];
  const expired=[];
  const rooms=[];
  for(const id of ids){
    const room=await tskChatConversation(ds,id);
    if(!room)continue;
    if(tskChatIsExpired(room)){expired.push(id);continue;}
    rooms.push(room);
  }
  if(expired.length)await tskChatSweepExpired(ds,expired);
  return rooms.sort((a,z)=>String(z.updated_at||'').localeCompare(String(a.updated_at||'')));
}

/** True once a still-open room has gone quiet for longer than the idle limit. */
function tskChatIsStale(conversation){
  if(!conversation||conversation.status!=='open')return false;
  const last=Date.parse(conversation.updated_at||conversation.created_at||'');
  return Number.isFinite(last)&&(Date.now()-last)>TSK_CHAT_IDLE_CLOSE_MS;
}
/**
 * Closes a room that has gone quiet, wherever one is read.
 *
 * There is no scheduler on this deployment, so the check happens on read. That
 * is enough: a room only matters when somebody looks at it, and the console
 * polls, so a stale room is closed within a poll of becoming stale.
 */
async function tskChatCloseIfStale(ds,conversation){
  if(!tskChatIsStale(conversation))return conversation;
  conversation.status='closed';
  conversation.closed_at=new Date().toISOString();
  conversation.closed_reason='idle_timeout';
  // Clears it off the navigation badge too, which counts rooms awaiting a reply.
  conversation.awaiting_reply=false;
  await tskChatSave(ds,conversation);
  return conversation;
}
async function tskChatAppend(ds,conversation,input){
  conversation.message_seq=Number(conversation.message_seq||0)+1;
  const item={id:random(12),seq:conversation.message_seq,role:input.role,text:clean(input.text,TSK_CHAT_MAX_TEXT),created_at:new Date().toISOString(),sender:clean(input.sender,120),delivery:clean(input.delivery,30)||'stored'};
  if(input.telegram_message_id!=null)item.telegram_message_id=String(input.telegram_message_id);
  if(input.telegram_user_id!=null)item.telegram_user_id=String(input.telegram_user_id);
  conversation.messages=[...(Array.isArray(conversation.messages)?conversation.messages:[]),item].slice(-TSK_CHAT_MAX_MESSAGES);
  // Who spoke last, so the console can show how many customers are still
  // waiting. Stored on the conversation rather than derived, so counting them
  // is one indexed query instead of reading every thread.
  conversation.last_role=item.role;
  conversation.awaiting_reply=item.role==='customer';
  if(item.telegram_message_id)conversation.last_telegram_message_id=item.telegram_message_id;
  await tskChatSave(ds,conversation);
  return item;
}

async function tskChatMap(ds,messageId,conversationId){
  if(messageId==null)return;
  await ds.setJSON('chat-telegram-map:'+String(messageId),{conversation_id:conversationId,created_at:new Date().toISOString()});
}

async function tskChatList(ds){
  if(typeof ds.listPrefix==='function'){
    try{return (await ds.listPrefix('chat-conversation:',{limit:TSK_CHAT_MAX_CONVERSATIONS})).map(x=>x.value).filter(Boolean);}
    catch(error){console.warn('[TSK] chat list failed',error?.message||error);}
  }
  const ids=await getJSON(ds,'chat-conversation-index')||[],out=[];
  for(const id of ids){const row=await tskChatConversation(ds,id);if(row)out.push(row);}
  return out;
}


const handleRequest = async (req, tenant, platformEnv = null) => {
  /**
   * The edge cache, or null wherever it is not bound — which is every
   * deployment so far, and every Node process the test suite starts. Nothing
   * here may require it.
   */
  const edgeCache = platformEnv?.EDGE_CACHE || null;
  const url=new URL(req.url); const b=req.method==='GET'?{}:await body(req); const ss=await session(req);
  // The storefront posts `{action, ...params}` as a JSON body while the legacy
  // pages put the action in the query string. Reading only the query string
  // meant every write from the Nuxt app — sign-in for all four roles, register,
  // contact, checkout, the whole admin console — fell through to the 404 at the
  // bottom of this handler. Accept either position, query string first.
  const action=url.searchParams.get('action')||clean(b?.action,120);
  // Where the Report-Only policy sends what it would have blocked. Public by
  // necessity — the browser posts it with no session — so it is quota'd, it
  // stores nothing, and it logs only the four fields that identify a rule and
  // the source that tripped it. A report body can carry a URL the visitor was
  // on, so nothing else from it is kept.
  if(action==='csp.report'){
    const rl=await rateLimit(req,'csp-report',60,60*60); if(!rl.ok) return tooMany(rl);
    const report=(b&&(b['csp-report']||b))||{};
    console.warn('csp report',JSON.stringify({
      tenant:tenant.id,
      directive:clean(report['effective-directive']||report['violated-directive'],120),
      blocked:clean(report['blocked-uri'],200),
      disposition:clean(report.disposition,40),
    }));
    // 204: the browser is not waiting for anything and must not retry.
    return new Response(null,{status:204});
  }
  // `build` answers the question that came up twice during this work and could
  // not be answered either time: has what I just pushed actually gone live?
  // A push succeeding is not a deploy — Cloudflare served the previous build
  // for several minutes after one of them, and there was no way to tell from
  // outside except by finding some visible change to look for, which does not
  // exist for a commit that only touches logging or scripts.
  //
  // CF_PAGES_COMMIT_SHA is set by Cloudflare Pages on every build. Comparing
  // its first characters against `git rev-parse --short HEAD` settles it in one
  // request. It is a public commit id on a repository the owner controls, not
  // a secret.
  if(action==='health'){
    const runtimeCaches=globalThis.caches;
    const mediaReady=Boolean(((process.env.MEDIA_S3_ENDPOINT||process.env.S3_ENDPOINT)&&(process.env.MEDIA_BUCKET||process.env.S3_BUCKET))||(process.env.SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY));
    const build=clean(process.env.CF_PAGES_COMMIT_SHA||process.env.GIT_COMMIT_SHA||process.env.COMMIT_SHA,40).slice(0,12)||'unknown';
    return json({ok:true,platform:process.env.CF_PAGES?'cloudflare-pages':'cloudflare-workers',build,branch:clean(process.env.CF_PAGES_BRANCH||process.env.GIT_BRANCH,60)||'unknown',storage:storageBackend(),database:postgresEnabled()?'postgres-mirror':'not-enabled',edge_cache:runtimeCaches?.default?'available':'not-available',media_storage:mediaReady?'configured':'not-configured',admin_configured:!!(process.env.ADMIN_USERNAME&&process.env.ADMIN_PASSWORD),tenant:tenant.id,time:new Date().toISOString()});
  }
  // Server-side proxy keeps the n8n webhook and secret out of the browser.
  if(action==='ai.n8n' && req.method==='POST'){
    const message=String(b?.message||'').trim().slice(0,2000);
    if(!message) return json({ok:false,error:'message_required'},400);
    const webhook=String(process.env.N8N_AI_WEBHOOK_URL||'').trim();
    if(!webhook) return json({ok:false,error:'ai_not_configured'},503);
    // Unauthenticated, and every call spends a request on an external service
    // that bills per run and may spend model tokens of its own. This is the
    // same reasoning as the quota on `chat.send`, and keyed the same way: on
    // the address alone, because anything the caller supplies it could rotate
    // to earn itself a fresh bucket. Twenty an hour is a long conversation and
    // nothing like a script.
    const aiLimit=await rateLimit(req,'ai-n8n',20,60*60); if(!aiLimit.ok)return tooMany(aiLimit);
    // The widget has been sending `history` since it was written and this
    // proxy dropped it, so every question reached n8n as the first thing the
    // customer had ever said — "how much is it" with no idea what "it" was.
    // Trimmed hard: the last few turns, short, and only the two roles the
    // widget produces, so a caller cannot post a transcript of its own
    // invention or use this as an errand boy for a large upstream payload.
    const history=Array.isArray(b?.history)
      ? b.history.slice(-8)
          .filter(turn=>turn&&(turn.role==='user'||turn.role==='ai'))
          .map(turn=>({role:turn.role,text:String(turn.text||'').slice(0,600)}))
      : [];
    const finderProducts=await tskChatProducts(dataStore(),message);
    const finderCards=Array.isArray(finderProducts)?finderProducts.map(productCardView).slice(0,5):[];
    try{
      // Do not leave the browser waiting forever when an n8n worker is cold or
      // temporarily unreachable. A bounded request lets the composer recover
      // and keeps the first-message delay from looking like a frozen chat.
      const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),25000);
      const upstream=await fetch(webhook,{method:'POST',headers:{'content-type':'application/json','x-api-key':String(process.env.N8N_AI_API_KEY||'')},body:JSON.stringify({message,history,customer_context:await tskChatContext(dataStore(),ss,b?.page,message),tenant:tenant.id,source:'storefront'}),signal:controller.signal});
      clearTimeout(timeout);
      const raw=await upstream.text();
      if(!upstream.ok) return json({ok:false,error:'ai_upstream_error'},502);
      let data; try{data=JSON.parse(raw);}catch{data=null;}
      const reply=aiReplyText(data,raw);
      // An empty answer used to be returned as `{ok:true,reply:''}`, and the
      // widget turned that into "ขออภัยครับ ยังไม่มีคำตอบกลับมา" — a sentence
      // the AI never said, shown as though it had. Whatever went wrong upstream
      // was invisible from here: a workflow answering in a field this did not
      // read looked exactly like a workflow with nothing to say.
      //
      // The field names the payload *did* carry come back as `shape`. Names
      // only, never values, and they are the whole diagnosis when a workflow is
      // returning `{ answer: ... }` to a reader that only knew four other
      // spellings.
      if(!reply){
        // The workflow said nothing usable. Before telling a customer the
        // assistant is broken, ask whichever other model this shop has a key
        // for — an empty n8n reply is a workflow that needs building, not a
        // reason for the chat window to stop working in the meantime.
        const fallback=await chatFallback({message,history,context:await tskChatContext(dataStore(),ss,b?.page,message)}).catch(()=>null);
        if(fallback?.reply) return json({ok:true,reply:fallback.reply,products:finderCards,answered_by:fallback.provider});
        const shape=data&&typeof data==='object'?Object.keys(Array.isArray(data)?(data[0]||{}):data).slice(0,12):typeof data;
        // `shape` says what the workflow answered with; `tried` says what
        // happened to every other model this shop has a key for. Without the
        // second one a chat box that has stopped working looks the same
        // whether n8n is returning an empty array, the Gemini key has
        // expired, or nobody ever set one — and all three were true at once.
        //
        // Error classes only, never a provider's message: those quote the
        // failing request back and the failing request carries the key.
        return json({ok:false,error:'ai_empty_response',shape,tried:fallback?.attempts||[]},502);
      }
      return json({ok:true,reply,products:finderCards,answered_by:'n8n'});
    }catch{ return json({ok:false,error:'ai_unavailable'},502); }
  }
  // Which merchant this request resolved to. The storefront uses it for
  // per-shop branding; it is public because the visitor is already on that
  // shop's domain and it exposes nothing the page does not already show.
  if(action==='platform.tenant') return json({ok:true,tenant:{id:tenant.id,name:tenant.name,host:tenant.primaryHost}},200,PUBLIC_READ_CACHE);
  // The full merchant list is the platform operator's view, not a shop's.
  if(action==='platform.tenants'){
    if(!maySuperAdmin(ss,'platform.tenants'))return json({ok:false,error:'forbidden_super_admin_only'},403);
    return json({ok:true,current:tenant.id,tenants:tenantRegistry().map(t=>({id:t.id,name:t.name,hosts:t.hosts}))});
  }
  const sessionRequired=action==='session'||/^(?:admin|customer|supplier|agent)\./.test(action);
  if(ss.unavailable&&sessionRequired)return json({ok:false,error:'session_store_unavailable',retryable:true},503,{'retry-after':'2'});
  // Signing out changes state, so it takes a POST. `SameSite=Lax` already keeps
  // the session cookie off cross-site POSTs, but this dispatcher also reads
  // `action` from the query string, and a top-level navigation does carry a Lax
  // cookie — so a plain link on another site could sign our visitors out. Both
  // clients already POST here, so nothing legitimate is refused.
  if(/^(?:admin|customer|supplier|agent)\.logout$/.test(action)&&req.method!=='POST')
    return json({ok:false,error:'method_not_allowed'},405);


  // ---------- Multi-supplier network: suppliers own fulfilment; the platform owns the ledger ----------
  if(action==='suppliers.list'){
    const rows=await listJSONByPrefix(dataStore(),'supplier:','supplier-index');
    return json({ok:true,suppliers:rows.filter(s=>s&&s.status==='active').map(supplierPublicView)});
  }
  if(action==='admin.suppliers.list'){
    if(!maySuperAdmin(ss,'admin.suppliers.list'))return json({ok:false,error:'forbidden_super_admin_only'},403);
    const rows=await listJSONByPrefix(dataStore(),'supplier:','supplier-index');
    return json({ok:true,suppliers:rows.filter(Boolean)});
  }
  if(action==='admin.suppliers.save'){
    if(!maySuperAdmin(ss,'admin.suppliers.save')||!requireCsrf(b,ss))return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore(), id=clean(b.id,80)||crypto.randomUUID(), current=await supplierById(ds,id)||{}, name=clean(b.name,160);
    if(!name)return json({ok:false,error:'supplier_name_required'},422);
    const code=(clean(b.code,40)||current.code||name.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,16)).toUpperCase();
    const email=clean(b.email,190).toLowerCase();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({ok:false,error:'invalid_supplier_email'},422);
    const supplier={...current,id,name,code,email:email||current.email||'',logo_url:clean(b.logo_url,1200),description:clean(b.description,1000),categories:Array.isArray(b.categories)?b.categories.slice(0,20).map(x=>clean(x,80)).filter(Boolean):current.categories||[],fulfillment_sla_days:Math.max(0,Math.min(60,Number(b.fulfillment_sla_days)||0)),settlement_terms_days:Math.max(0,Math.min(90,Number(b.settlement_terms_days)||0)),status:['active','paused','inactive'].includes(b.status)?b.status:(current.status||'active'),updated_at:new Date().toISOString(),updated_by:ss.data.username,created_at:current.created_at||new Date().toISOString()};
    await ds.setJSON(`supplier:${id}`,supplier);await appendToIndex(ds,'supplier-index',id);await auditLog(req,ss,'admin.suppliers.save',{id,name,code,status:supplier.status});return json({ok:true,supplier});
  }
  if(action==='admin.suppliers.credentials'){
    if(!maySuperAdmin(ss,'admin.suppliers.credentials')||!requireCsrf(b,ss))return json({ok:false,error:'unauthorized'},401);const ds=dataStore(),supplier=await supplierById(ds,clean(b.supplier_id,80)),email=clean(b.email||supplier?.email,190).toLowerCase(),password=String(b.temporary_password||'');
    if(!supplier||!email||!/^\S+@\S+\.\S+$/.test(email)||password.length<10)return json({ok:false,error:'invalid_supplier_credentials'},422);const existing=await getJSON(authStore(),`supplier-email:${sha(email)}`);if(existing?.id&&existing.id!==supplier.id)return json({ok:false,error:'supplier_email_taken'},409);
    supplier.email=email;supplier.updated_at=new Date().toISOString();await ds.setJSON(`supplier:${supplier.id}`,supplier);await authStore().setJSON(`supplier-auth:${supplier.id}`,{id:supplier.id,email,password_hash:hashPassword(password),must_change_password:true,updated_at:supplier.updated_at});await authStore().setJSON(`supplier-email:${sha(email)}`,{id:supplier.id});await auditLog(req,ss,'admin.suppliers.credentials',{supplier_id:supplier.id});return json({ok:true});
  }
  if(action==='admin.settlements.list'){
    if(!maySuperAdmin(ss,'admin.settlements.list'))return json({ok:false,error:'forbidden_super_admin_only'},403);
    const ds=dataStore(),idx=await getJSON(ds,'settlement-index')||[],settlements=[];for(const id of idx.slice().reverse().slice(0,1000)){const row=await getJSON(ds,`settlement:${id}`);if(row)settlements.push(row);}return json({ok:true,settlements});
  }
  if(action==='admin.suppliers.assign_products'){
    if(!maySuperAdmin(ss,'admin.suppliers.assign_products')||!requireCsrf(b,ss))return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore(), supplier=await supplierById(ds,clean(b.supplier_id,80));if(!supplier||supplier.status!=='active')return json({ok:false,error:'supplier_not_active'},422);
    const ids=Array.isArray(b.product_ids)?b.product_ids.map(x=>clean(x,80)).filter(Boolean).slice(0,500):[];if(!ids.length)return json({ok:false,error:'product_ids_required'},422);
    const updated=[];for(const id of ids){const p=await getJSON(ds,`product:${id}`);if(!p)continue;p.supplier_id=supplier.id;p.supplier_name=supplier.name;p.updated_at=new Date().toISOString();await ds.setJSON(`product:${id}`,p);updated.push(id);}await auditLog(req,ss,'admin.suppliers.assign_products',{supplier_id:supplier.id,count:updated.length});return json({ok:true,updated});
  }
  if(action==='admin.settlements.action'){
    if(!maySuperAdmin(ss,'admin.settlements.action')||!requireCsrf(b,ss))return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore(),id=clean(b.id,100),op=clean(b.operation,40),row=await getJSON(ds,`settlement:${id}`);if(!row)return json({ok:false,error:'settlement_not_found'},404);
    const map={mark_ready:'ready_to_remit',mark_remitted:'remitted',hold:'on_hold',void:'void'};if(!map[op])return json({ok:false,error:'invalid_operation'},422);
    row.status=map[op];row.updated_at=new Date().toISOString();row.updated_by=ss.data.username;row.note=clean(b.note,1000)||row.note||'';if(op==='mark_remitted'){row.remitted_at=row.updated_at;row.remittance_reference=clean(b.reference,300);}await ds.setJSON(`settlement:${id}`,row);await auditLog(req,ss,'admin.settlements.action',{id,operation:op,supplier_id:row.supplier_id});return json({ok:true,settlement:row});
  }
  if(action==='supplier.login'){
    const email=clean(b.email,190).toLowerCase(),password=String(b.password||''),rl=await rateLimit(req,'supplier-login',10,15*60,email);if(!rl.ok)return tooMany(rl);const ref=await getJSON(authStore(),`supplier-email:${sha(email)}`),auth=ref?.id?await getJSON(authStore(),`supplier-auth:${ref.id}`):null,supplier=ref?.id?await supplierById(dataStore(),ref.id):null;
    if(!auth||!supplier||supplier.status!=='active'||!verifyPassword(password,auth.password_hash))return json({ok:false,error:'invalid_credentials'},401);await deleteSession(ss.token);const ns=await saveSession({type:'supplier',supplier_id:supplier.id,supplier_name:supplier.name});return json({ok:true,csrf:ns.s.csrf,supplier:supplierPublicView(supplier),must_change_password:!!auth.must_change_password},200,{'set-cookie':cookieHeader(ns.token)});
  }
  if(action==='supplier.logout'){if(isSupplier(ss))await deleteSession(ss.token);return json({ok:true},200,{'set-cookie':cookieHeader('',true)});}
  if(action==='supplier.password'){
    if(!isSupplier(ss)||!requireCsrf(b,ss))return json({ok:false,error:'unauthorized'},401);const auth=await getJSON(authStore(),`supplier-auth:${ss.data.supplier_id}`),next=String(b.new_password||'');if(!auth||!verifyPassword(String(b.old_password||''),auth.password_hash))return json({ok:false,error:'invalid_password'},401);if(next.length<10)return json({ok:false,error:'weak_password'},422);auth.password_hash=hashPassword(next);auth.must_change_password=false;auth.updated_at=new Date().toISOString();await authStore().setJSON(`supplier-auth:${ss.data.supplier_id}`,auth);return json({ok:true});
  }
  if(action==='supplier.dashboard'){
    if(!isSupplier(ss))return json({ok:false,error:'unauthorized'},401);const ds=dataStore(),supplier=await supplierById(ds,ss.data.supplier_id);if(!supplier||supplier.status!=='active')return json({ok:false,error:'supplier_inactive'},403);const products=[],orders=[],settlements=[];
    for(const id of await productIdsFromStore(ds)){const p=await getJSON(ds,`product:${id}`);if(p?.supplier_id===supplier.id)products.push({id:p.id,name:p.name,sku:p.sku||'',stock:p.stock,state:p.state,price:p.price,cost_price:p.cost_price});}
    for(const id of (await getJSON(ds,'settlement-index')||[]).slice().reverse()){const row=await getJSON(ds,`settlement:${id}`);if(!row||row.supplier_id!==supplier.id)continue;settlements.push(row);const o=await getJSON(ds,`order:${row.order_id}`);if(o)orders.push({id:o.id,order_no:o.order_no,status:o.status,name:o.name,phone:o.phone,address:o.address,province:o.province,zip:o.zip,items:row.items,created_at:o.created_at,fulfillment:(o.fulfillment||[]).find(x=>x.supplier_id===supplier.id)||null});}
    const ready=settlements.filter(x=>x.status==='ready_to_remit').reduce((a,x)=>a+Number(x.product_cost||0),0);return json({ok:true,supplier:supplierPublicView(supplier),products,orders,settlements,totals:{products:products.length,orders:orders.length,ready_to_remit:ready}});
  }
  if(action==='supplier.fulfillment.update'){
    if(!isSupplier(ss)||!requireCsrf(b,ss))return json({ok:false,error:'unauthorized'},401);const ds=dataStore(),order=await getJSON(ds,`order:${clean(b.order_id,80)}`);if(!order)return json({ok:false,error:'order_not_found'},404);const record=await getJSON(ds,`settlement-order:${order.id}`);let allowed=false;for(const sid of record?.settlement_ids||[]){const row=await getJSON(ds,`settlement:${sid}`);if(row?.supplier_id===ss.data.supplier_id)allowed=true;}if(!allowed)return json({ok:false,error:'forbidden'},403);const now=new Date().toISOString(),entry={supplier_id:ss.data.supplier_id,carrier:clean(b.carrier,100),tracking_number:clean(b.tracking_number,100),status:clean(b.status,40)||'packed',updated_at:now};if(!entry.tracking_number)return json({ok:false,error:'tracking_required'},422);order.fulfillment=[...(order.fulfillment||[]).filter(x=>x.supplier_id!==entry.supplier_id),entry];await ds.setJSON(`order:${order.id}`,order);await mirrorOrderProjection(dataNamespace(),order);await auditLog(req,ss,'supplier.fulfillment.update',{order_id:order.id,tracking_number:entry.tracking_number});return json({ok:true,fulfillment:entry});
  }


  if(action==='admin.media.presign'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401); if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    if(!mediaConfigured()) return json({ok:false,error:'media_storage_not_configured'},503);
    const mime=clean(b.mime_type,120); if(!/^image\/(png|jpeg|webp|gif|avif)$/i.test(mime)) return json({ok:false,error:'unsupported_media_type'},422);
    const out=await presignUpload({filename:clean(b.filename,180),mime_type:mime,owner_type:clean(b.owner_type,40)||'product',owner_id:clean(b.owner_id,100),created_by:ss.data.username});
    return json({ok:true,...out});
  }
  if(action==='admin.media.commit'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401); if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const key=clean(b.key,600); if(!key) return json({ok:false,error:'missing_key'},422);
    const out=await commitMedia({key,public_url:clean(b.public_url,1200),mime_type:clean(b.mime_type,120),size_bytes:Math.max(0,Number(b.size_bytes||0)),width:Math.max(0,Number(b.width||0))||null,height:Math.max(0,Number(b.height||0))||null,owner_type:clean(b.owner_type,40),owner_id:clean(b.owner_id,100),created_by:ss.data.username});
    await auditLog(req,ss,'admin.media.upload',{key,owner_type:b.owner_type||'',owner_id:b.owner_id||''}); return json(out);
  }
  if(action==='admin.media.delete'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401); if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const key=clean(b.key,600); if(!key) return json({ok:false,error:'missing_key'},422); await deleteMedia(key); await auditLog(req,ss,'admin.media.delete',{key}); return json({ok:true});
  }
  if(action==='admin.media.list'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401); const assets=await listMedia({owner_type:clean(url.searchParams.get('owner_type'),40),owner_id:clean(url.searchParams.get('owner_id'),100),limit:Number(url.searchParams.get('limit')||100)}); return json({ok:true,assets});
  }
  if(action==='session'){
    let renewed=false;
    if(ss.data){try{renewed=await refreshSession(ss);}catch(error){console.error('[TSK] session refresh failed',error?.message||error);return json({ok:false,error:'session_store_unavailable',retryable:true},503,{'retry-after':'2'});}}
    return json({ok:true,admin:ss.data?.type==='admin',admin_role:ss.data?.type==='admin'?(ss.data.role||'admin'):null,admin_username:ss.data?.type==='admin'?ss.data.username:null,customer:ss.data?.type==='customer'?ss.data.customer:null,agent:ss.data?.type==='agent',agent_profile:ss.data?.type==='agent'?{id:ss.data.agent_id||'',agent_code:ss.data.agent_code||'',store_name:ss.data.store_name||''}:null,supplier:ss.data?.type==='supplier',csrf:ss.data?.csrf||'',session_expires_at:ss.data?.expires_at||null,session_renewed:renewed,social:{},promptpay_id:process.env.PROMPTPAY_ID||''},200,renewed?{'set-cookie':cookieHeader(ss.token)}:{});
  }


  if(action==='site.settings'){
    const saved=await readSiteSettings(dataStore());
    const settings={...DEFAULT_SITE_SETTINGS,...saved,entry_popup:normalizeEntryPopup(saved.entry_popup),banners:normalizeManagedBanners(saved.banners),promo_banners:normalizeManagedBanners(saved.promo_banners),article_banners:normalizeManagedBanners(saved.article_banners),home_cards:normalizeHomeCards(saved.home_cards),theme:{...DEFAULT_SITE_SETTINGS.theme,...(saved.theme||{})},
      /*
       * Normalised here rather than in one of the two responses below, because
       * doing it in one of them is how a field removed from the code kept being
       * served by the other. Tawk.to's two ids stayed in this payload after the
       * integration was taken out — nothing had deleted them from the stored
       * row, and nothing was going to. Reading through the current shape means
       * storage can hold whatever it likes and the API answers with what this
       * release actually has.
       */
      marketing:Object.fromEntries(Object.keys(DEFAULT_SITE_SETTINGS.marketing)
        .map(key=>[key,String(saved.marketing?.[key]??DEFAULT_SITE_SETTINGS.marketing[key]??'')]))};
    if(url.searchParams.get('compact')==='1'){
      const version=encodeURIComponent(settings.updated_at||'1');
      const managedImage=(value,imageAction)=>{
        const raw=clean(value,6000000);
        if(/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,/i.test(raw))return `/api?action=${imageAction}&v=${version}`;
        return cleanPublicUrl(raw,1600);
      };
      const compactPopup={...settings.entry_popup,image_url:managedImage(settings.entry_popup?.image_url,'site.popup-image')};
      return json({ok:true,settings:{
        site_title:settings.site_title,
        company_name:settings.company_name,
        company_subtitle:settings.company_subtitle,
        announcement:settings.announcement||'',
        logo_url:`/api?action=site.logo&v=${version}`,
        favicon_url:managedImage(settings.favicon_data_url,'site.favicon'),
        chat_avatar_url:managedImage(settings.chat_avatar_data_url,'site.chat-avatar'),
        entry_popup:compactPopup,
        // Forty characters of date, read by the home page's flash shelf. Empty
        // for a shop that has not set one, which is most shops most days.
        flash_sale_ends_at:settings.flash_sale_ends_at||'',
        flash_sale_count:Number(settings.flash_sale_count)||4,
        home_headings:{...DEFAULT_SITE_SETTINGS.home_headings,...(settings.home_headings||{})},
        banners:bannerAddresses(settings.banners,'banners',version),
        promo_banners:bannerAddresses(settings.promo_banners,'promo',version),
        article_banners:bannerAddresses(settings.article_banners,'article',version),
        // Addresses, never the bytes: the home page fetches this payload on
        // every visit, and two data URLs would put megabytes of base64 into a
        // response that is cached and re-parsed on each one. R112 is about
        // exactly this cost.
        home_cards:{
          about_image_url:managedImage(settings.home_cards?.about_image_url,'site.home-about-image'),
          featured_image_url:managedImage(settings.home_cards?.featured_image_url,'site.home-featured-image'),
          articles_image_url:managedImage(settings.home_cards?.articles_image_url,'site.home-articles-image')
        },
        // The footer and the legal pages render these on every page, so they
        // travel with the compact payload the storefront already fetches.
        business:{...DEFAULT_SITE_SETTINGS.business,...(settings.business||{})},
        // Public by nature: a tracking id is visible in the page source of
        // every site that uses one. It travels with the payload the storefront
        // already fetches rather than costing a second request.
        /*
         * Only the fields this release knows about.
         *
         * Spreading whatever was stored meant a field that had been removed
         * kept riding along in every page payload for ever — Tawk.to's two ids
         * were still being sent to every visitor after the integration was
         * taken out, because nothing had deleted them from the record. Reading
         * through the current shape means a removed field stops being published
         * the moment it stops existing, whatever is left in storage.
         */
        marketing:settings.marketing,
        updated_at:settings.updated_at||null
      }},200,PUBLIC_READ_CACHE);
    }
    return json({ok:true,settings});
  }

  // ================= Home page content =================
  // News posts, articles and videos used to live in the browser's local
  // storage: whoever wrote a post saw it, nobody else did, and it vanished when
  // that browser cleared its data. They are stored server-side now, per
  // merchant, so what an admin publishes is what every visitor reads.
  if(action==='content.image'){
    const kind=contentKind(url.searchParams.get('kind')),id=clean(url.searchParams.get('id'),80);
    if(!kind||!id)return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
    const row=await getJSON(dataStore(),`content-${kind}:${id}`);
    if(!row||(row.published===false&&!isAdmin(ss)))return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
    const image=String(row.image_url||'');
    // Same-origin redirector, not an open one: the address comes from an
    // admin-written content row, and a compromised row must not turn this
    // shop's own image endpoint into a phishing hop. Only our own storage
    // addresses redirect; anything else falls through to the inline-image
    // path below (and 404s when it is not one).
    if(/^https:\/\//i.test(image)&&isOwnMedia(image))return Response.redirect(image,302);
    const match=image.match(/^data:image\/(png|jpeg|webp|gif);base64,([a-z0-9+/=]+)$/i);
    if(!match)return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
    const bytes=Buffer.from(match[2],'base64');
    return new Response(bytes,{status:200,headers:{
      'content-type':`image/${match[1].toLowerCase()}`,
      'content-length':String(bytes.length),
      'cache-control':row.published===false?'private, no-store':'public, max-age=86400, stale-while-revalidate=604800',
      'x-content-type-options':'nosniff'
    }});
  }
  if(action==='content.list'){
    const kind=contentKind(url.searchParams.get('kind'));
    if(!kind) return json({ok:false,error:'invalid_kind'},422);
    const rows=await cachedPublicRead(`content.${kind}`, async () =>
      (await listJSONByPrefix(dataStore(),`content-${kind}:`,`content-${kind}-index`))
        .filter(x=>x&&x.published!==false)
        .sort((a,z)=>Number(a.sort_order||0)-Number(z.sort_order||0)||String(z.created_at||'').localeCompare(String(a.created_at||''))));
    return json({ok:true,kind,items:rows.map(contentPublicView)},200,PUBLIC_READ_CACHE);
  }
  if(action==='admin.content.list'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    const kind=contentKind(url.searchParams.get('kind'));
    if(!kind) return json({ok:false,error:'invalid_kind'},422);
    const rows=(await listJSONByPrefix(dataStore(),`content-${kind}:`,`content-${kind}-index`))
      .filter(Boolean)
      .sort((a,z)=>Number(a.sort_order||0)-Number(z.sort_order||0)||String(z.created_at||'').localeCompare(String(a.created_at||'')));
    return json({ok:true,kind,items:rows.map(contentAdminView)});
  }
  if(action==='admin.content.save'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const kind=contentKind(b.kind);
    if(!kind) return json({ok:false,error:'invalid_kind'},422);
    const title=clean(b.title,220);
    if(!title) return json({ok:false,error:'title_required'},422);
    const ds=dataStore();
    const id=clean(b.id,80)||crypto.randomUUID();
    const current=await getJSON(ds,`content-${kind}:${id}`)||{};
    // Images may be pasted as a data URL or linked from managed media; video is
    // a link to wherever it is hosted, so nothing large is stored inline twice.
    // List responses replace a large inline image with content.image. When an
    // admin edits only the text, keep the original bytes rather than saving the
    // generated read URL back over them.
    const requestedImage=b.image_url!==undefined?b.image_url:current.image_url;
    const image=clean(isContentImageReference(requestedImage,kind,id)?current.image_url:requestedImage,4000000);
    const safeImage=/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(image)?image:cleanPublicUrl(image,1600);
    const row={
      ...current,
      id,kind,title,
      excerpt:clean(b.excerpt!==undefined?b.excerpt:current.excerpt,600),
      body:clean(b.body!==undefined?b.body:current.body,20000),
      image_url:safeImage,
      video_url:cleanPublicUrl(clean(b.video_url!==undefined?b.video_url:current.video_url,1200),1200),
      link_url:clean(b.link_url!==undefined?b.link_url:current.link_url,1200),
      published:b.published!==undefined?b.published===true:current.published!==false,
      sort_order:Math.max(0,Number(b.sort_order!==undefined?b.sort_order:current.sort_order)||0),
      created_at:current.created_at||new Date().toISOString(),
      updated_at:new Date().toISOString(),
      updated_by:ss.data.username
    };
    forgetPublicRead(`content.${kind}`);await ds.setJSON(`content-${kind}:${id}`,row);
    const indexKey=`content-${kind}-index`;
    await appendToIndex(ds,indexKey,id);
    await auditLog(req,ss,'admin.content.save',{kind,id,title});
    return json({ok:true,item:row});
  }
  if(action==='admin.content.delete'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const kind=contentKind(b.kind), id=clean(b.id,80);
    if(!kind||!id) return json({ok:false,error:'invalid_input'},422);
    const ds=dataStore();
    forgetPublicRead(`content.${kind}`);await ds.delete(`content-${kind}:${id}`).catch(()=>{});
    const indexKey=`content-${kind}-index`;
    forgetPublicRead(`content.${kind}`);await removeFromIndex(ds,indexKey,id);
    await auditLog(req,ss,'admin.content.delete',{kind,id});
    return json({ok:true});
  }

  if(['site.logo','site.favicon','site.chat-avatar','site.popup-image','site.home-featured-image','site.home-articles-image','site.home-about-image'].includes(action)){
    const saved=await readSiteSettings(dataStore());
    const field=action==='site.logo'?'logo_data_url':action==='site.favicon'?'favicon_data_url':action==='site.chat-avatar'?'chat_avatar_data_url':null;
    const homeCardField=action==='site.home-featured-image'?'featured_image_url':action==='site.home-articles-image'?'articles_image_url':action==='site.home-about-image'?'about_image_url':null;
    const value=homeCardField
      ? clean(normalizeHomeCards(saved.home_cards)[homeCardField],2200000)
      : clean(field?saved[field]:normalizeEntryPopup(saved.entry_popup).image_url,field==='logo_data_url'?2200000:field?800000:6000000);
    const match=value.match(/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,([a-z0-9+/=]+)$/i);
    if(!match){
      if(action==='site.logo')return Response.redirect(new URL('/legacy-assets/logo.png',url.origin),302);
      return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
    }
    const kind=match[1].toLowerCase();
    const mime=kind==='jpg'?'jpeg':kind;
    const body=Buffer.from(match[2],'base64');
    return new Response(body,{status:200,headers:{
      'content-type':`image/${mime}`,
      'content-length':String(body.length),
      'cache-control':'public, max-age=86400, stale-while-revalidate=604800',
      'x-content-type-options':'nosniff'
    }});
  }
  /**
   * The bytes of a banner that is still stored inline.
   *
   * Same trade as site.logo above: the settings payload carries an address and
   * the picture is fetched once and cached for a day, instead of every reader of
   * the settings — the home page on every visit, the admin on every load —
   * carrying megabytes of base64 they mostly do not look at.
   */
  if(action==='site.banner-image'){
    const listKey=BANNER_LISTS[clean(url.searchParams.get('list'),20)];
    const id=clean(url.searchParams.get('id'),120);
    if(!listKey||!id) return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
    const saved=await readSiteSettings(dataStore());
    const row=normalizeManagedBanners(saved[listKey]).find(item=>String(item.id)===id);
    const match=String(row?.img||'').match(/^data:image\/(png|jpeg|webp|gif);base64,([a-z0-9+/=]+)$/i);
    if(!match) return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
    const body=Buffer.from(match[2],'base64');
    return new Response(body,{status:200,headers:{
      'content-type':`image/${match[1].toLowerCase()}`,
      'content-length':String(body.length),
      'cache-control':'public, max-age=86400, stale-while-revalidate=604800',
      'x-content-type-options':'nosniff'
    }});
  }

  if(action==='checkout.settings'){
    const settings=await getBusinessSettings();
    const p=settings.payment||{};
    const hasBank=!!(p.promptpay_id || (p.bank_accounts||[]).some(x=>x.account_no));
    return json({ok:true,payment:{
      bank_transfer_enabled:p.bank_transfer_enabled!==false && hasBank,
      cod_enabled:p.cod_enabled!==false,
      line_order_enabled:!!p.line_order_enabled && !!p.line_oa_url,
      line_oa_url:clean(p.line_oa_url,500),
      line_oa_name:clean(p.line_oa_name,120)||'LINE Official ร้าน',
      // PromptPay is not a secret. The checkout page needs the recipient ID
      // to build the QR locally when the serverless PNG encoder is unavailable.
      promptpay_id:clean(p.promptpay_id,20),
      promptpay_name:clean(p.promptpay_name,120)
    }});
  }
  if(action==='admin.site.settings'){
    if(ss.data?.type!=='admin') return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const current=await readSiteSettings(dataStore());
    const site_title=b.site_title!==undefined?(clean(b.site_title,180)||DEFAULT_SITE_SETTINGS.site_title):(current.site_title||DEFAULT_SITE_SETTINGS.site_title);
    const company_name=b.company_name!==undefined?(clean(b.company_name,120)||DEFAULT_SITE_SETTINGS.company_name):(current.company_name||DEFAULT_SITE_SETTINGS.company_name);
    const company_subtitle=b.company_subtitle!==undefined?clean(b.company_subtitle,120):clean(current.company_subtitle,120);
    const logo_data_url=b.logo_data_url!==undefined?clean(b.logo_data_url,2200000):clean(current.logo_data_url,2200000);
    const favicon_data_url=b.favicon_data_url!==undefined?clean(b.favicon_data_url,800000):clean(current.favicon_data_url,800000);
    // Storefront chat launcher avatar. Usually a cut-out PNG of a staff member,
    // so it is stored the same way as the logo and shown on the bubble.
    const chat_avatar_data_url=b.chat_avatar_data_url!==undefined?clean(b.chat_avatar_data_url,800000):clean(current.chat_avatar_data_url,800000);
    /*
     * A picture is valid as bytes or as an address.
     *
     * This accepted base64 only, which was true of every upload until the admin
     * forms started sending the bucket address instead — and then saving a home
     * card failed with "invalid image" over a perfectly good PNG that had just
     * finished uploading. https is what banners and categories have always been
     * allowed to carry, and it is what keeps the record small enough to serve.
     */
    const validImage=(v)=>!v||/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/i.test(v)||/^https:\/\//i.test(v);
    if(!validImage(logo_data_url)||!validImage(favicon_data_url)||!validImage(chat_avatar_data_url)) return json({ok:false,error:'invalid_image'},422);
    const entry_popup=b.entry_popup!==undefined?normalizeEntryPopup(b.entry_popup,current.entry_popup):normalizeEntryPopup(current.entry_popup);
    if(entry_popup.enabled&&!entry_popup.image_url)return json({ok:false,error:'popup_image_required'},422);
    const banners=await bucketBanners(normalizeManagedBanners(b.banners!==undefined?resolveBannerAddresses(b.banners,current.banners):current.banners),'site-banner',ss);
    const home_cards=normalizeHomeCards(b.home_cards!==undefined?b.home_cards:current.home_cards);
    /*
     * The same safety net the banners have.
     *
     * A card picture stored inline is decoded and re-sent by
     * site.home-*-image on every request — one of them was 1.29 MB behind a
     * frame that draws at 168px, and it was most of why the home page took
     * three and a half seconds while the products page took four tenths. The
     * admin form uploads to the bucket now, so this is for what is already
     * stored: re-saving the settings moves it. A failure leaves the value
     * exactly as it was.
     */
    for(const field of ['featured_image_url','articles_image_url','about_image_url']){
      if(!String(home_cards[field]||'').startsWith('data:')) continue;
      const stored=await storeInlineImage(home_cards[field],{owner_type:'site-home-card',owner_id:field,created_by:ss.data.username});
      if(stored.ok) home_cards[field]=stored.url;
    }
    const promo_banners=await bucketBanners(normalizeManagedBanners(b.promo_banners!==undefined?resolveBannerAddresses(b.promo_banners,current.promo_banners):current.promo_banners),'site-promo-banner',ss);
    const article_banners=await bucketBanners(normalizeManagedBanners(b.article_banners!==undefined?resolveBannerAddresses(b.article_banners,current.article_banners):current.article_banners),'site-article-banner',ss);
    // Same check the logo and the favicon get. These are rendered on the home
    // page of a public shop; whatever is stored here is served to everyone.
    if(!validImage(home_cards.featured_image_url)||!validImage(home_cards.articles_image_url)) return json({ok:false,error:'invalid_image'},422);
    /*
     * Tracking ids, each checked against the shape its provider issues.
     *
     * Not politeness — safety. These are rendered into the page, so a field
     * that accepted arbitrary text would be a way to put a <script> into a shop
     * that takes addresses and payment slips. A value that does not look like
     * the id it claims to be is refused rather than stored and rendered.
     * Clearing a field is always allowed: that is how a shop stops tracking.
     */
    const MARKETING_SHAPES={
      ga4_id:/^G-[A-Z0-9]{4,16}$/i,
      gtm_id:/^GTM-[A-Z0-9]{4,12}$/i,
      meta_pixel_id:/^[0-9]{8,20}$/,
      tiktok_pixel_id:/^[A-Z0-9]{10,32}$/i,
      floodlight_advertiser_id:/^(?:DC-)?[0-9]{4,20}$/i,
      floodlight_activity_group:/^[A-Z0-9_-]{1,64}$/i,
      floodlight_activity_tag:/^[A-Z0-9_-]{1,64}$/i,
      floodlight_bot_activity_group:/^[A-Z0-9_-]{1,64}$/i,
      floodlight_bot_activity_tag:/^[A-Z0-9_-]{1,64}$/i,
    };
    const marketing={...DEFAULT_SITE_SETTINGS.marketing,...(current.marketing||{})};
    /*
     * The tracking ids are the owner's, not the shop floor's.
     *
     * The rest of this action — the shop name, the logo, the popup, the home
     * cards — is ordinary admin work, so the action itself stays open to any
     * admin. Only this block is narrowed: GA4, Tag Manager and the Meta pixel
     * are the shop's advertising accounts, and the owner asked that a manager
     * not reach the API side of the shop.
     *
     * Enforced here rather than only by hiding the tab, because a hidden tab is
     * a hidden form and not a closed door.
     */
    if(b.marketing!==undefined&&!maySuperAdmin(ss,'admin.site.marketing'))
      return json({ok:false,error:'forbidden_super_admin_only'},403);
    if(b.marketing!==undefined&&b.marketing&&typeof b.marketing==='object'){
      for(const [key,shape] of Object.entries(MARKETING_SHAPES)){
        if(!Object.prototype.hasOwnProperty.call(b.marketing,key))continue;
        const value=clean(b.marketing[key],64).trim();
        if(!value){marketing[key]='';continue;}
        if(!shape.test(value))return json({ok:false,error:'invalid_marketing_id',field:key},422);
        marketing[key]=value;
      }
    }
    /*
     * Left alone unless the field was sent, so a console that predates it —
     * or any other caller posting a partial settings body — cannot clear a
     * running sale by omission. An unparseable date is stored as empty rather
     * than rejected: the shelf without a clock is a working shelf, and refusing
     * the whole save would take the rest of the settings down with it.
     */
    /*
     * Bounded at both ends. Zero would hide the shelf by arithmetic rather than
     * by a switch that says so, and a shop asking for two hundred is asking the
     * browser to lay out two hundred cards nobody will scroll to.
     */
    const flash_sale_count=b.flash_sale_count!==undefined
      ? Math.max(1,Math.min(24,Math.trunc(Number(b.flash_sale_count))||4))
      : (Number(current.flash_sale_count)||4);
    const flash_sale_ends_at=b.flash_sale_ends_at!==undefined
      ? (()=>{const out=clean(b.flash_sale_ends_at,40).trim();return out&&!Number.isNaN(Date.parse(out))?out:'';})()
      : (current.flash_sale_ends_at||'');
    /*
     * Same rule as the sale date: only written when sent, so a partial body
     * cannot blank a shop’s headings by omission. Sixty characters is a
     * heading; anything longer is somebody pasting a paragraph into a title.
     */
    const home_headings=b.home_headings!==undefined
      ? {bestseller:clean(b.home_headings?.bestseller,60).trim(),flash:clean(b.home_headings?.flash,60).trim(),promotion:clean(b.home_headings?.promotion,60).trim()}
      : {...DEFAULT_SITE_SETTINGS.home_headings,...(current.home_headings||{})};
    const settings={...current,site_title,company_name,company_subtitle,logo_data_url,favicon_data_url,chat_avatar_data_url,entry_popup,flash_sale_ends_at,flash_sale_count,home_headings,banners,promo_banners,article_banners,home_cards,marketing,updated_at:new Date().toISOString()};
    forgetSiteSettings();await dataStore().setJSON('site-settings',settings);await purgeSettingsPages(req);
    // Written first, cleaned up after: a delete that fails must never be able to
    // take the save with it. Every list is compared, so a picture that moved
    // between them is kept.
    const bannerUrls=source=>[...(source.banners||[]),...(source.promo_banners||[]),...(source.article_banners||[])].map(row=>row?.img);
    await deleteOrphanedMedia(bannerUrls(current),bannerUrls(settings));
    return json({ok:true,settings});
  }
  if(action==='admin.theme.settings'){
    if(!maySuperAdmin(ss,'admin.theme.settings')) return json({ok:false,error:'forbidden_super_admin_only'},403);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const current=await readSiteSettings(dataStore());
    const hex=(v,fallback)=>/^#[0-9a-fA-F]{3,8}$/.test(String(v||'').trim())?String(v).trim():fallback;
    const d=DEFAULT_SITE_SETTINGS.theme, t=b.theme||{};
    const theme={
      dark_1:hex(t.dark_1,current.theme?.dark_1||d.dark_1),
      dark_2:hex(t.dark_2,current.theme?.dark_2||d.dark_2),
      dark_3:hex(t.dark_3,current.theme?.dark_3||d.dark_3),
      pink:hex(t.pink,current.theme?.pink||d.pink),
      pink_light:hex(t.pink_light,current.theme?.pink_light||d.pink_light),
      pink_deep:hex(t.pink_deep,current.theme?.pink_deep||d.pink_deep),
      gold_accent:hex(t.gold_accent,current.theme?.gold_accent||d.gold_accent),
      gold_soft:hex(t.gold_soft,current.theme?.gold_soft||d.gold_soft),
      rose_shadow:hex(t.rose_shadow,current.theme?.rose_shadow||d.rose_shadow),
      gray:hex(t.gray,current.theme?.gray||d.gray),
      border:hex(t.border,current.theme?.border||d.border),
      font_family: clean(t.font_family,120) || current.theme?.font_family || d.font_family,
      radius_scale: Math.min(2, Math.max(0, Number(t.radius_scale ?? current.theme?.radius_scale ?? d.radius_scale) || 1))
    };
    const settings={...current,theme,updated_at:new Date().toISOString()};
    forgetSiteSettings();await dataStore().setJSON('site-settings',settings);await purgeSettingsPages(req);
    return json({ok:true,settings});
  }
  if(action==='admin.theme.reset'){
    if(!maySuperAdmin(ss,'admin.theme.reset')) return json({ok:false,error:'forbidden_super_admin_only'},403);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const current=await readSiteSettings(dataStore());
    const settings={...current,theme:DEFAULT_SITE_SETTINGS.theme,updated_at:new Date().toISOString()};
    forgetSiteSettings();await dataStore().setJSON('site-settings',settings);await purgeSettingsPages(req);
    return json({ok:true,settings});
  }


  if(action==='admin.login'){
    const username=clean(b.username,120), password=String(b.password||'');
    // Version the limiter key when owner credentials are rotated so attempts
    // made against an old password cannot lock the newly configured account.
    const rl=await rateLimit(req,'admin-login-v2',8,15*60,username); if(!rl.ok) return tooMany(rl);
    // Values pasted into a dashboard often carry an accidental trailing
    // newline. Accept boundary whitespace only; the secret is never exposed.
    const au=String(process.env.ADMIN_USERNAME||'').trim().replace(/^['\"]|['\"]$/g,''), ap=String(process.env.ADMIN_PASSWORD||'').trim().replace(/^['\"]|['\"]$/g,'');
    if(!au||!ap) return json({ok:false,error:'admin_not_configured'},503);
    if(ap.length<14) return json({ok:false,error:'admin_password_too_weak'},503);
    const ownerMatches=!!(username&&au&&crypto.timingSafeEqual(Buffer.from(sha(username)),Buffer.from(sha(au))));
    const ownerCredential=ownerMatches?await superAdminPasswordRecord(au):null;
    // Once an owner has changed the password in the admin UI, the persisted
    // hash replaces the bootstrap environment password. Falling back to the
    // old environment value would make a password change ineffective.
    // Keep the encrypted environment credential as the owner's break-glass
    // login even when an older password hash exists in persistent storage.
    const environmentPasswordMatches=crypto.timingSafeEqual(Buffer.from(sha(password)),Buffer.from(sha(ap)));
    const persistedPasswordMatches=!!ownerCredential?.password_hash&&verifyPassword(password,ownerCredential.password_hash);
    const ownerPasswordMatches=ownerMatches&&(environmentPasswordMatches||persistedPasswordMatches);
    if(ownerPasswordMatches){
      await deleteSession(ss.token); const ns=await saveSession({type:'admin',username:au,role:'super_admin',password_version:ownerCredential?.version||null});
      await auditLog(req,{data:{type:'admin',username:au,role:'super_admin'}},'admin.login',{username:au});
      return json({ok:true,csrf:ns.s.csrf,role:'super_admin'},200,{'set-cookie':cookieHeader(ns.token)});
    }
    // sub-admin account created by a super_admin
    const sub = await getJSON(authStore(), `adminuser:${sha(username.toLowerCase())}`);
    if(sub && sub.active!==false && verifyPassword(password, sub.password_hash)){
      await deleteSession(ss.token); const ns=await saveSession({type:'admin',username:sub.username,role:sub.role||'admin',admin_id:sub.id});
      await auditLog(req,{data:{type:'admin',username:sub.username,role:sub.role||'admin'}},'admin.login',{username:sub.username});
      return json({ok:true,csrf:ns.s.csrf,role:sub.role||'admin'},200,{'set-cookie':cookieHeader(ns.token)});
    }
    return json({ok:false,error:'invalid_credentials'},401);
  }
  if(action==='admin.logout'){
    if(ss.data?.type!=='admin') return json({ok:false,error:'unauthorized'},401);
    await auditLog(req,ss,'admin.logout',{});
    await deleteSession(ss.token); return json({ok:true},200,{'set-cookie':cookieHeader('',true)});
  }
  if(action==='admin.password'){
    if(ss.data?.type!=='admin') return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const oldPassword=String(b.old_password||''),newPassword=String(b.new_password||'');
    // A manager holds nearly everything a super admin does, so their password
    // is held to the same length. An ordinary admin reaches products and orders.
    const minimumLength=(ss.data.role==='super_admin'||ss.data.role==='manager')?14:10;
    if(newPassword.length<minimumLength) return json({ok:false,error:'weak_password'},422);
    if(ss.data.role==='super_admin'){
      const username=String(process.env.ADMIN_USERNAME||'').trim();
      const bootstrapPassword=String(process.env.ADMIN_PASSWORD||'').trim();
      if(!username||!bootstrapPassword)return json({ok:false,error:'admin_not_configured'},503);
      const current=await superAdminPasswordRecord(username);
      const oldPasswordMatches=current
        ? !!current.password_hash&&verifyPassword(oldPassword,current.password_hash)
        : crypto.timingSafeEqual(Buffer.from(sha(oldPassword)),Buffer.from(sha(bootstrapPassword)));
      if(!oldPasswordMatches)return json({ok:false,error:'invalid_password'},401);
      const now=new Date().toISOString(),version=random(16);
      await authStore().setJSON(superAdminPasswordKey(username),{
        password_hash:hashPassword(newPassword),version,
        created_at:current?.created_at||now,updated_at:now
      });
      ss.data={...ss.data,password_version:version,refreshed_at:now};
      await authStore().setJSON(`session:${sha(ss.token)}`,ss.data);
      await auditLog(req,ss,'admin.password.change',{account:'primary_super_admin',sessions_revoked:true});
      return json({ok:true});
    }
    const id=clean(ss.data.admin_id,80),u=id?await getJSON(authStore(),`adminuser-byid:${id}`):null;
    if(!u||!verifyPassword(oldPassword,u.password_hash)) return json({ok:false,error:'invalid_password'},401);
    u.password_hash=hashPassword(newPassword);u.updated_at=new Date().toISOString();
    await authStore().setJSON(`adminuser-byid:${u.id}`,u);await authStore().setJSON(`adminuser:${sha(u.username)}`,u);
    await auditLog(req,ss,'admin.password.change',{admin_id:u.id});
    return json({ok:true});
  }


  if(action==='customer.register'){
    const rl=await rateLimit(req,'customer-register',5,60*60); if(!rl.ok) return tooMany(rl);
    const human=await requireHuman(req,b,'register'); if(human) return human;
    const name=clean(b.name,150), email=clean(b.email,190).toLowerCase(), ph=phone(b.phone), password=String(b.password||'');
    // Which field, not just "something". Four different mistakes all answered
    // `invalid_input`, so the form could only say "ข้อมูลไม่ถูกต้อง" and a shopper
    // whose password was one character short went looking at their email.
    // `field` is additive — the code and the status are unchanged, so anything
    // reading `error` is unaffected.
    const bad=!name?'name':!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?'email':ph.length<9?'phone':password.length<10?'password':'';
    if(bad) return json({ok:false,error:'invalid_input',field:bad},422);
    const s=authStore(); const ek=`email:${sha(email)}`, pk=`phone:${sha(ph)}`;
    // Which one is already registered. The 409 already told the caller that one
    // of the two exists, so naming it discloses nothing the status code was not
    // disclosing anyway — and "เบอร์นี้สมัครแล้ว" is the difference between a
    // shopper signing in and a shopper giving up.
    const emailTaken=!!await getJSON(s,ek), phoneTaken=!!await getJSON(s,pk);
    if(emailTaken||phoneTaken) return json({ok:false,error:'email_or_phone_exists',field:emailTaken&&phoneTaken?'both':emailTaken?'email':'phone'},409);
    const id=crypto.randomUUID(); const c={id,name,email,phone:ph,address:'',province:'',zip:'',created_at:new Date().toISOString(),password_hash:hashPassword(password)};
    await s.setJSON(`customer:${id}`,c); await s.setJSON(ek,{id}); await s.setJSON(pk,{id});
    { await appendToIndex(dataStore(),'customer-index',id); }
    await deleteSession(ss.token); const pub=customerPublic(c); const ns=await saveSession({type:'customer',customer:pub});
    return json({ok:true,customer:pub,csrf:ns.s.csrf},200,{'set-cookie':cookieHeader(ns.token)});
  }
  if(action==='customer.login'){
    const identifier=clean(b.identifier,190); const rl=await rateLimit(req,'customer-login',12,15*60,identifier); if(!rl.ok) return tooMany(rl);
    const password=String(b.password||''); const s=authStore();
    const ref=identifier.includes('@')?await getJSON(s,`email:${sha(identifier.toLowerCase())}`):await getJSON(s,`phone:${sha(phone(identifier))}`);
    const c=ref?.id?await getJSON(s,`customer:${ref.id}`):null;
    if(!c||!verifyPassword(password,c.password_hash)) return json({ok:false,error:'invalid_credentials'},401);
    await deleteSession(ss.token); const pub=customerPublic(c); const ns=await saveSession({type:'customer',customer:pub});
    return json({ok:true,customer:pub,csrf:ns.s.csrf},200,{'set-cookie':cookieHeader(ns.token)});
  }
  if(action==='customer.logout'){
    await deleteSession(ss.token); return json({ok:true},200,{'set-cookie':cookieHeader('',true)});
  }
  if(action==='customer.profile'){
    if(ss.data?.type!=='customer') return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const old=ss.data.customer, s=authStore(), c=await getJSON(s,`customer:${old.id}`); if(!c)return json({ok:false,error:'unauthorized'},401);
    const name=clean(b.name,150), email=clean(b.email,190).toLowerCase(), ph=phone(b.phone), address=clean(b.address,1000), province=clean(b.province,100), zip=clean(b.zip,10);
    if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||ph.length<9) return json({ok:false,error:'invalid_input'},422);
    const er=await getJSON(s,`email:${sha(email)}`), pr=await getJSON(s,`phone:${sha(ph)}`); if((er&&er.id!==c.id)||(pr&&pr.id!==c.id))return json({ok:false,error:'email_or_phone_exists'},409);
    if(email!==c.email){await s.delete(`email:${sha(c.email)}`);await s.setJSON(`email:${sha(email)}`,{id:c.id});}
    if(ph!==c.phone){await s.delete(`phone:${sha(c.phone)}`);await s.setJSON(`phone:${sha(ph)}`,{id:c.id});}
    Object.assign(c,{name,email,phone:ph,address,province,zip}); await s.setJSON(`customer:${c.id}`,c); const pub=customerPublic(c);
    ss.data.customer=pub; await s.setJSON(`session:${sha(ss.token)}`,ss.data); return json({ok:true,customer:pub});
  }
  if(action==='customer.password'){
    if(ss.data?.type!=='customer') return json({ok:false,error:'unauthorized'},401); if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403); const s=authStore(), c=await getJSON(s,`customer:${ss.data.customer.id}`); const np=String(b.new_password||'');
    if(np.length<10)return json({ok:false,error:'weak_password'},422);
    if(!c)return json({ok:false,error:'unauthorized'},401);
    // OAuth-created accounts have no password to prove yet. Their signed
    // customer session is the proof, so the first password can be set without
    // inventing an unusable "old" password. Once one exists, the old password
    // is required exactly as before.
    if(c.password_hash&&!verifyPassword(String(b.old_password||''),c.password_hash))return json({ok:false,error:'invalid_password'},401);
    c.password_hash=hashPassword(np);c.auth_mode=Object.keys(c.oauth_identities||{}).length?'password+oauth':'password';c.updated_at=new Date().toISOString();await s.setJSON(`customer:${c.id}`,c);
    const pub=customerPublic(c);ss.data.customer=pub;await s.setJSON(`session:${sha(ss.token)}`,ss.data);return json({ok:true,customer:pub});
  }
  if(action==='customer.oauth.unlink'){
    if(ss.data?.type!=='customer')return json({ok:false,error:'unauthorized'},401);if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);
    const provider=clean(b.provider,32).toLowerCase();if(!['google','facebook','line'].includes(provider))return json({ok:false,error:'invalid_provider'},422);
    const s=authStore(),c=await getJSON(s,`customer:${ss.data.customer.id}`);if(!c)return json({ok:false,error:'unauthorized'},401);
    const identities=c.oauth_identities&&typeof c.oauth_identities==='object'?{...c.oauth_identities}:{};const linked=identities[provider];if(!linked)return json({ok:true,customer:customerPublic(c)});
    if(!c.password_hash&&Object.keys(identities).length<=1)return json({ok:false,error:'cannot_unlink_last_login'},409);
    const providerAccountId=clean(linked.provider_account_id,240);if(providerAccountId)await s.delete(`oauth:${provider}:${sha(providerAccountId)}`);delete identities[provider];c.oauth_identities=identities;c.auth_mode=c.password_hash?(Object.keys(identities).length?'password+oauth':'password'):'oauth';c.updated_at=new Date().toISOString();await s.setJSON(`customer:${c.id}`,c);
    const pub=customerPublic(c);ss.data.customer=pub;await s.setJSON(`session:${sha(ss.token)}`,ss.data);return json({ok:true,customer:pub});
  }
  if(action==='customer.orders'){
    if(ss.data?.type!=='customer') return json({ok:false,error:'unauthorized'},401);
    if(relationalOrderReadsEnabled()){
      try{
        const rows=await readRelationalOrders(activeTenant().id,{customerId:ss.data.customer.id,limit:100});
        if(rows.length){
          const orders=rows.map(({upload_token_hash,...safeOrder})=>safeOrder);
          return json({ok:true,orders,source:'relational'});
        }
      }catch(error){console.warn('relational customer orders failed',error?.message||error);}
    }
    const ds=dataStore(); const list=await getJSON(ds,`orders-by-customer:${ss.data.customer.id}`)||[]; const orders=[];
    for(const id of list.slice(-100).reverse()){ const o=await getJSON(ds,`order:${id}`); if(o){ const {upload_token_hash,...safeOrder}=o; orders.push(safeOrder); } }
    return json({ok:true,orders,source:'commerce'});
  }
  if(action==='checkout.stock.validate'){
    const rl=await rateLimit(req,'checkout-stock-validate',60,60*60); if(!rl.ok) return tooMany(rl);
    const items=Array.isArray(b.items)?b.items:[];
    if(!items.length) return json({ok:false,error:'invalid_cart'},422);
    const ds=dataStore(); await expireOldReservations(ds);
    const checked=[]; const problems=[];
    for(const raw of items){
      const pid=clean(raw?.id,80), sku=clean(raw?.sku,120),barcode=clean(raw?.barcode,120),variantId=clean(raw?.variant_id,80); const qty=Math.max(1,Math.min(999,Math.floor(Number(raw?.qty)||0)));
      const prod=await findProductByIdOrCode(ds,pid,sku,barcode,true);
      if(!prod || prod.state!=='active'){
        problems.push({type:'product_unavailable',product_id:pid,sku,name:clean(raw?.name,180)||sku||pid||'สินค้า'});
        continue;
      }
      const minimum=minOrderQuantity(prod);
      if(qty<minimum){problems.push({type:'minimum_order_quantity',product_id:prod.id,variant_id:variantId,requested:qty,minimum});continue;}
      const normalized=normalizeProductInventory(prod);const variant=findProductVariant(normalized,variantId,sku,barcode);
      if(!variant||variant.state!=='active'){problems.push({type:'variant_unavailable',product_id:prod.id,variant_id:variantId,sku,name:prod.name});continue;}
      const available=variantAvailable(variant);
      if(available<qty){
        problems.push({type:'insufficient_stock',product_id:prod.id,variant_id:variant.id,sku:variant.sku||sku,name:prod.name||clean(raw?.name,180)||'สินค้า',requested:qty,available:publicAvailable(available)});
      }
      checked.push({id:prod.id,variant_id:variant.id,variant_label:variant.label,sku:variant.sku||'',barcode:variant.barcode||'',name:prod.name,requested:qty,available:publicAvailable(available),unlimited:!Number.isFinite(available),state:variant.state});
    }
    if(problems.length) return json({ok:false,error:'stock_unavailable',problems,checked},409);
    return json({ok:true,checked,validated_at:new Date().toISOString()});
  }


  if(action==='order.create'){
    const rl=await rateLimit(req,'order-create',20,60*60); if(!rl.ok) return tooMany(rl);
    // Orders require an account. Enforced here rather than only in the
    // checkout page, because the page is only a form — anything can POST to
    // this endpoint. It also means every order now has a customer to trace it
    // back to, which guest checkout did not give us.
    if(ss.data?.type!=='customer') return json({ok:false,error:'login_required'},401);
    const name=clean(b.name,150), ph=phone(b.phone), address=clean(b.address,1000), province=clean(b.province,100), zip=clean(b.zip,10), method=clean(b.payment_method,80), clientTotal=Number(b.total||0), items=Array.isArray(b.items)?b.items:[];
    // Optional. The checkout only requires a phone number, so an order with no
    // email is normal; when one is given it is kept on the order so receipts
    // and status mails have somewhere to go.
    const email=clean(b.email,190).toLowerCase();
    const taxInvoiceRequested=b.tax_invoice_requested===true;
    const taxCompanyName=clean(b.tax_company_name,200), taxId=clean(b.tax_id,20).replace(/[^0-9]/g,''), taxBranch=clean(b.tax_branch,80)||'สำนักงานใหญ่', taxAddress=clean(b.tax_address,1000), taxEmail=clean(b.tax_email,190).toLowerCase();
    if(!name||ph.length<9||ph.length>15||!address||!province||!/^\d{5}$/.test(zip)||!items.length||!(clientTotal>0)||b.terms_accepted!==true)return json({ok:false,error:'invalid_order'},422);
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({ok:false,error:'invalid_email'},422);
    if(taxInvoiceRequested && (!taxCompanyName||!/^[0-9]{13}$/.test(taxId)||!taxAddress|| (taxEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(taxEmail))))return json({ok:false,error:'invalid_tax_invoice'},422);
    const checkoutBusiness=await getBusinessSettings(), payCfg=checkoutBusiness.payment||{};
    const isBank=/โอนเงิน|พร้อมเพย์/i.test(method), isCod=/COD|ปลายทาง/i.test(method), isLine=/LINE/i.test(method);
    const bankReady=payCfg.bank_transfer_enabled!==false && !!(payCfg.promptpay_id || (payCfg.bank_accounts||[]).some(x=>x.account_no));
    const lineReady=!!payCfg.line_order_enabled && !!payCfg.line_oa_url;
    if((isBank&&!bankReady)||(isCod&&payCfg.cod_enabled===false)||(isLine&&!lineReady)||(!isBank&&!isCod&&!isLine)) return json({ok:false,error:'payment_method_unavailable'},409);
    const ds=dataStore(); await expireOldReservations(ds); const canonical=[]; let subtotal=0;
    for(const raw of items){
      const pid=clean(raw?.id,80), sku=clean(raw?.sku,120),barcode=clean(raw?.barcode,120),variantId=clean(raw?.variant_id,80); const qty=Math.max(1,Math.min(999,Math.floor(Number(raw?.qty)||0)));
      const prod=await findProductByIdOrCode(ds,pid,sku,barcode,true);
      if(!prod || prod.state!=='active') return json({ok:false,error:'product_unavailable',product_id:pid,sku},409);
      const minimum=minOrderQuantity(prod);
      if(qty<minimum)return json({ok:false,error:'minimum_order_quantity',product_id:prod.id,requested:qty,minimum},409);
      const normalized=normalizeProductInventory(prod);const variant=findProductVariant(normalized,variantId,sku,barcode);
      if(!variant||variant.state!=='active')return json({ok:false,error:'variant_unavailable',product_id:prod.id,variant_id:variantId,sku},409);
      const available=variantAvailable(variant);
      if(available<qty) return json({ok:false,error:'insufficient_stock',product_id:pid,available:publicAvailable(available)},409);
      const price=Math.max(0,Number(variant.price||0)); subtotal += price*qty;
      canonical.push({id:prod.id,variant_id:variant.id,variant_label:variant.label,sku:variant.sku||'',barcode:variant.barcode||'',name:prod.name,qty,price,cost_price:Math.max(0,Number(variant.cost_price||0)),supplier_id:clean(prod.supplier_id,80),supplier_name:clean(prod.supplier_name,160)});
    }
    // Curated equipment-set discounts are quoted by the Next.js server from the
    // tenant's relational bundle tables and signed with an HMAC. The browser
    // cannot choose the amount: order.create only accepts the signed claim and
    // rechecks that every claimed line is still present in the canonical cart.
    let bundleDiscount=0,bundleSetId='',bundleSetName='';
    const bundleQuoteToken=clean(b.bundle_quote_token,12000);
    if(bundleQuoteToken){
      const verified=verifyKitQuote(bundleQuoteToken,{tenantId:activeTenant().id,items:canonical});
      if(!verified.ok)return json({ok:false,error:'kit_quote_invalid',reason:verified.error},409);
      bundleDiscount=Math.min(subtotal,Math.max(0,Number(verified.payload.discount_amount||0)));
      bundleSetId=clean(verified.payload.set_id,100);bundleSetName=clean(verified.payload.set_name,240);
    }
    let shipping=subtotal>1500?0:80; const couponCode=clean(b.coupon_code,40).toUpperCase(); let couponDiscountAmount=0,shippingDiscount=0,coupon=null; if(couponCode){coupon=await findCoupon(ds,couponCode); if(!couponIsUsable(coupon,subtotal))return json({ok:false,error:'coupon_invalid'},409); const cd=couponDiscount(coupon,subtotal,shipping); couponDiscountAmount=cd.product_discount; shippingDiscount=cd.shipping_discount;} const discount=Math.min(subtotal,bundleDiscount+couponDiscountAmount); const payableShipping=Math.max(0,shipping-shippingDiscount); const total=Math.max(0,subtotal+payableShipping-discount);
    // The server is authoritative for price, shipping and discounts. A stale browser cart must not
    // make checkout fail; save the order with the freshly calculated server total instead.
    const totalAdjusted=Math.abs(total-clientTotal)>0.01;
    // An order was created once per request that reached this line, and
    // nothing stopped the same request arriving twice. A double-clicked
    // button, a browser retry on a dropped response, a phone flipping from
    // wifi to mobile mid-POST — each produced a second complete order: stock
    // reserved twice, two rows in the admin list, two Telegram messages, and
    // a customer who paid for one of them.
    //
    // The claim is taken before the stock is, with onlyIfNew, so of two
    // requests carrying the same key exactly one proceeds. A client that
    // wants an explicit key sends one; otherwise the order is its own key —
    // same customer, same basket, same total, same payment method, inside the
    // same short window is a retry, not a second order.
    const idempotencyKey=clean(b.idempotency_key,120)||sha(JSON.stringify({
      customer:ss.data.customer.id,
      items:canonical.map(i=>[i.id,i.variant_id,i.qty]).sort(),
      total,method,coupon:couponCode,bundle:bundleSetId,bundle_discount:bundleDiscount,
      // Retry window bucket, aligned with the KV claim TTL below. The key is
      // persisted on the order AND enforced by a partial unique index in
      // Postgres — without a time component, a legitimate repeat purchase of
      // the same basket weeks later would collide with the first order and
      // its projection would be rejected. Same window = retry (deduped);
      // different window = new order. An explicit client key passes through
      // untouched and stays the client's responsibility to keep unique.
      window:Math.floor(Date.now()/ORDER_CLAIM_TTL_MS),
    })).slice(0,48);
    const claimKey=`order-claim:${idempotencyKey}`;
    const priorClaim=await getJSON(ds,claimKey);
    if(priorClaim&&Number(priorClaim.expires_at||0)>Date.now()){
      // Finished already: answer with what the first request produced rather
      // than making a second order. The upload token is deliberately not
      // replayed — only its hash is ever stored — so a client that lost the
      // first response reaches the slip upload through its order history.
      if(priorClaim.order_no) return json({ok:true,duplicate:true,...priorClaim.result});
      // Still in flight. Refusing is right: claiming success would be a lie,
      // and letting it through is the duplicate this exists to prevent.
      return json({ok:false,error:'order_in_progress'},409);
    }
    if(priorClaim) await ds.delete(claimKey).catch(()=>{});
    const claimed=await ds.setJSON(claimKey,{claimed_at:new Date().toISOString(),expires_at:Date.now()+ORDER_CLAIM_TTL_MS,order_no:null},{onlyIfNew:true});
    if(!claimed?.modified) return json({ok:false,error:'order_in_progress'},409);

    // Bank transfers take their coupon use when the payment is confirmed
    // (consumeCouponForOrder). Every other method takes it now, atomically and
    // before any stock is held, so the last use cannot be taken twice.
    let couponTaken=false;
    if(coupon&&!isBank){
      const taken=await atomicCouponUse(ds,coupon.code,1,{enforceLimit:true});
      if(!taken.ok){
        await ds.delete(claimKey).catch(()=>{});
        return json({ok:false,error:'coupon_invalid',reason:taken.reason},409);
      }
      couponTaken=true;
    }
    const releaseTakenCoupon=async()=>{ if(couponTaken) await atomicCouponUse(ds,coupon.code,-1).catch(()=>{}); };
    const reservation=await reserveStockAtomically(canonical,ds);
    if(!reservation.ok){
      // Nothing was reserved, so the claim must not linger and stop the
      // customer fixing their basket and trying again.
      await releaseTakenCoupon();
      await ds.delete(claimKey).catch(()=>{});
      return json({ok:false,error:reservation.error||'inventory_conflict',product_id:reservation.product_id||'',sku:reservation.sku||'',available:reservation.available},409);
    }
    const id=crypto.randomUUID(), order_no=`TSK${new Date().toISOString().slice(2,10).replaceAll('-','')}${random(3).slice(0,6).toUpperCase()}`;
    const upload_token=random(24); const createdAt=new Date(); const reservationExpiry=new Date(createdAt.getTime()+24*60*60*1000).toISOString();
    const autoSlipConfigured=!!(process.env.SLIPOK_API_KEY&&process.env.SLIPOK_BRANCH_ID);
    const initialStatus=isLine?'awaiting_verification':(isBank?'pending_payment':'new');
    const paymentReviewMode=isLine?'manual_admin':(isCod?'cod':(autoSlipConfigured?'automatic_slip':'manual_slip'));
    const paymentStatus=isLine?'pending_manual':(isBank?'pending_payment':'pending');
    const lockedAttribution=await currentAgentAttribution(req,ds); let agentRef=lockedAttribution?.agent_code||clean(b.agent_ref,60).toUpperCase(), agentId=null, agentCode='', agentStore='', agentFraudFlags=[]; if(agentRef){const aid=await getJSON(ds,`agent-code:${agentRef}`), ag=aid?await getJSON(ds,`agent:${aid}`):null;if(ag?.status==='approved'){const selfPhone=phone(ag.phone)&&phone(ag.phone)===phone(ph),selfEmail=ss.data?.type==='customer'&&String(ss.data.customer?.email||'').toLowerCase()===String(ag.email||'').toLowerCase();if(selfPhone||selfEmail){agentFraudFlags.push('self_referral');agentRef='';await auditLog(req,{data:{type:'system'}},'agent.referral.blocked',{agent_id:ag.id,reason:'self_referral',phone:phone(ph).slice(-4)});}else{agentId=ag.id;agentCode=ag.referral_code;agentStore=ag.store_name;}}}
    const o={id,order_no,name,phone:ph,email,address,province,zip,tax_invoice_requested:taxInvoiceRequested,tax_invoice_status:taxInvoiceRequested?'requested':'not_requested',tax_invoice:taxInvoiceRequested?{type:'company',company_name:taxCompanyName,tax_id:taxId,branch:taxBranch,address:taxAddress,email:taxEmail}:null,agent_id:agentId,agent_code:agentCode,agent_store_name:agentStore,agent_fraud_flags:agentFraudFlags,payment_method:method,payment_review_mode:paymentReviewMode,payment_status:paymentStatus,total,subtotal,shipping:payableShipping,shipping_before_discount:shipping,shipping_discount:shippingDiscount,discount,coupon_discount:couponDiscountAmount,bundle_discount:bundleDiscount,bundle_set_id:bundleSetId,bundle_set_name:bundleSetName,coupon_code:couponCode||'',coupon_consumed:!!coupon&&!isBank,idempotency_key:idempotencyKey,items:canonical,status:initialStatus,stock_reserved:true,stock_deducted:false,upload_token_hash:sha(upload_token),reservation_expires_at:reservationExpiry,terms_accepted_at:createdAt.toISOString(),customer_id:ss.data?.type==='customer'?ss.data.customer.id:null,created_at:createdAt.toISOString(),status_history:[{status:initialStatus,at:createdAt.toISOString(),by:'system'}]};
    if(couponTaken){ o.coupon_code=o.coupon_code||coupon.code; o.coupon_consumed=true; }
    try{
      await ds.setJSON(`order:${id}`,o);
    }catch(error){
      await releaseTakenCoupon();
      // The stock is reserved and the order does not exist. Give the stock
      // back rather than leaving a reservation nothing will release — the
      // expiry sweep would otherwise hold it for twenty-four hours.
      await releaseReservationForOrder(ds,o).catch(()=>{});
      await ds.delete(claimKey).catch(()=>{});
      throw error;
    }
    await mirrorOrderProjection(dataNamespace(),o);
    await createOrderSettlement(ds,o);
    if(o.customer_id){const key=`orders-by-customer:${o.customer_id}`;await appendToIndex(ds,key,id);}
    await appendToIndex(ds,'order-index',id);
    for(const productId of [...new Set(canonical.map(item=>item.id))]){const key=`orders-by-product:${productId}`;await appendToIndex(ds,key,id);}
    // Every order, not just LINE and COD. Bank transfer is the default method
    // here, and it was silent: the shop learned an order existed only if and
    // when the customer got around to uploading a slip. An order placed at
    // midnight with no slip simply never appeared anywhere.
    // The order is durable now; the notification is not part of that. It is
    // recorded as an outbox row first, attempted, and the row cleared on
    // success — so what is left behind is exactly the list of orders nobody
    // was told about, for the reconciliation job to replay.
    const outboxKey=`order-outbox:${id}`;
    await ds.setJSON(outboxKey,{order_id:id,order_no,created_at:new Date().toISOString(),attempts:1}).catch(()=>{});
    if(await notifyOrder(o)) await ds.delete(outboxKey).catch(()=>{});

    const claimResult={order_no,total,subtotal,shipping:payableShipping,shipping_before_discount:shipping,shipping_discount:shippingDiscount,discount,coupon_discount:couponDiscountAmount,bundle_discount:bundleDiscount,bundle_set_id:bundleSetId,bundle_set_name:bundleSetName,total_adjusted:totalAdjusted,payment_status:o.payment_status,payment_review_mode:o.payment_review_mode};
    await ds.setJSON(claimKey,{claimed_at:o.created_at,expires_at:Date.now()+ORDER_CLAIM_TTL_MS,order_no,result:claimResult}).catch(()=>{});
    return json({ok:true,order_no,total,subtotal,shipping:payableShipping,shipping_before_discount:shipping,shipping_discount:shippingDiscount,discount,coupon_discount:couponDiscountAmount,bundle_discount:bundleDiscount,bundle_set_id:bundleSetId,bundle_set_name:bundleSetName,total_adjusted:totalAdjusted,upload_token,payment_status:o.payment_status,payment_review_mode:o.payment_review_mode,agent_attribution:agentId?{agent_id:agentId,agent_code:agentCode,agent_store_name:agentStore}:null});
  }
  // ---------- Super Admin Production Center ----------
  if(action==='admin.production.status'){
    if(!maySuperAdmin(ss,'admin.production.status')) return json({ok:false,error:'forbidden_super_admin_only'},403);
    const settings=await getBusinessSettings(); const ds=dataStore();
    const chatConfig=await tskTelegramConfig().catch(()=>({token:'',chatId:''}));
    const notifications=settings.notifications||{};
    const alertConfigured=!!((process.env.TELEGRAM_ALERT_BOT_TOKEN||notifications.telegram_alert_bot_token||process.env.TELEGRAM_BOT_TOKEN||notifications.telegram_bot_token)&&(process.env.TELEGRAM_ALERT_CHAT_ID||notifications.telegram_alert_chat_id||process.env.TELEGRAM_CHAT_ID||notifications.telegram_chat_id));
    const chatConfigured=!!(chatConfig.token&&chatConfig.chatId);
    const host=clean(req.headers.get('host')||url.host,240); const proto=clean(req.headers.get('x-forwarded-proto')||url.protocol.replace(':',''),20);
    const orderIdx=await getJSON(ds,'order-index')||[], productIdx=await productIdsFromStore(ds), slipIdx=await getJSON(ds,'slip-index')||[];
    // How long ago the shop was last backed up, and whether that is recent
    // enough to count. This used to be reported as `backup:true` no matter what
    // — a shop that had never once been exported scored full marks for disaster
    // recovery, which is the one place a false green is worst.
    const backupMeta=await getJSON(ds,'backup-meta');
    const lastBackupAt=backupMeta?.last_backup_at||null;
    const backupAgeDays=lastBackupAt&&Number.isFinite(Date.parse(lastBackupAt))
      ? Math.floor((Date.now()-Date.parse(lastBackupAt))/86400000)
      : null;
    const backupFresh=backupAgeDays!==null&&backupAgeDays<=BACKUP_MAX_AGE_DAYS;
    const customDomain=!!host && !/\.pages\.dev(?::\d+)?$/i.test(host) && !/localhost|127\.0\.0\.1/i.test(host);
    const checks={
      api:true, storage:true, database:postgresEnabled(), media_storage:mediaConfigured(),
      admin:!!(process.env.ADMIN_USERNAME&&process.env.ADMIN_PASSWORD&&String(process.env.ADMIN_PASSWORD).length>=14),
      https:proto==='https', custom_domain:customDomain,
      payment:!!(settings.payment.promptpay_id || (settings.payment.bank_accounts||[]).some(x=>x.account_no)),
      email:!!((settings.email.smtp_host||process.env.SMTP_HOST)&&(settings.email.smtp_user||process.env.SMTP_USER)&&(settings.email.smtp_pass||process.env.SMTP_PASS)),
      telegram_alert:alertConfigured,
      telegram_chat:chatConfigured,
      telegram:alertConfigured&&chatConfigured,
      products:productIdx.length>0,
      policies:true,
      backup:backupFresh
    };
    const core=['api','storage','database','admin','https','custom_domain','payment','email','telegram','products','policies','backup'];
    const score=Math.round(core.filter(k=>checks[k]).length/core.length*100);
    return json({ok:true,host,origin:`${proto}://${host}`,storage_backend:storageBackend(),checks,score,counts:{orders:orderIdx.length,products:productIdx.length,slips:slipIdx.length},last_backup_at:lastBackupAt,backup_age_days:backupAgeDays,backup_max_age_days:BACKUP_MAX_AGE_DAYS,last_backup_by:backupMeta?.last_backup_by||null});
  }
  if(action==='admin.production.test_telegram'){
    if(!maySuperAdmin(ss,'admin.production.test_telegram')) return json({ok:false,error:'forbidden_super_admin_only'},403); if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const ok=await notifyTelegram('✅ THAISERKIT SUPPLY: ทดสอบบอทแจ้งเตือนออเดอร์สำเร็จ'); return json({ok, error:ok?null:'telegram_alert_not_configured_or_send_failed'},ok?200:422);
  }
  /**
   * The failures, for the person who can act on them.
   *
   * Super admin only and read-only: the rows name actions and paths, which is
   * a map of the shop's surface and not something to hand out. Nothing here
   * carries a customer's data — see api/lib/error-log.js for what is left out
   * on purpose.
   */
  if(action==='admin.errors.list'){
    if(!maySuperAdmin(ss,'admin.errors.list')) return json({ok:false,error:'forbidden_super_admin_only'},403);
    const limit=Math.max(1,Math.min(200,Number(b.limit||url.searchParams.get('limit'))||50));
    const rows=await recentFailures(dataStore(),limit);
    const dayMs=24*60*60*1000;
    const since=(ms)=>rows.filter(r=>{const at=Date.parse(r?.at||'');return Number.isFinite(at)&&at>=Date.now()-ms;}).length;
    return json({ok:true,errors:rows,counts:{last_hour:since(60*60*1000),last_day:since(dayMs)}});
  }

  if(action==='admin.backup.export'){
    if(!maySuperAdmin(ss,'admin.backup.export')) return json({ok:false,error:'forbidden_super_admin_only'},403);
    const ds=dataStore(), au=authStore(); const out={version:1,created_at:new Date().toISOString(),data:{},auth:{}};
    const specs=[['order-index','order:'],['warehouse-index','warehouse:'],['category-index','category:'],['brand-index','brand:'],['contact-index','contact:'],['slip-index','slip:'],['inventory-log-index','inventory-log:'],['audit-index','audit:'],['coupon-index','coupon:'],['review-index','review:'],['return-index','return:'],['subscriber-index','subscriber:']];
    /*
     * Read in bounded batches rather than one key at a time.
     *
     * This export walked every index with `await` inside the loop — products,
     * orders, warehouses, categories, brands, contacts, slips, inventory logs,
     * customers, reviews and returns, each id its own round trip. Rule 9 in
     * CLAUDE.md forbids exactly this, and for a shop with two thousand products
     * it is not merely slow: ten thousand sequential trips to Singapore do not
     * finish inside a worker's wall clock, so the backup this shop's readiness
     * score counts as fresh is one it very likely cannot complete. Fifty at a
     * time is the same shape `listJSONByPrefix` already uses.
     */
    const readMany=async (store,keys)=>{const values=[];for(let i=0;i<keys.length;i+=50){values.push(...await Promise.all(keys.slice(i,i+50).map(k=>getJSON(store,k))));}return values;};
    const collect=async (store,keys,into)=>{const values=await readMany(store,keys);keys.forEach((k,i)=>{if(values[i])into[k]=values[i];});};
    /**
     * One section at a time, when asked for one.
     *
     * Whole-shop export is a single request that reads every product, every
     * order, every customer, every review index and every return, then builds
     * one JSON document out of all of it. At 2,143 products that request now
     * fails: 503 in about three seconds, with the bridge in server/api/index.ts
     * reporting the worker threw. A shop is at its least backed-up exactly when
     * it has grown enough to need one.
     *
     * `section` is additive and optional. Absent, this behaves exactly as it
     * did — same shape, same keys, same `backup-meta` write — so the console's
     * export button and any existing caller are untouched, which rule 6
     * requires. Given, only that part is gathered, and the caller assembles the
     * same document from the pieces. scripts/backup-export.mjs does that.
     *
     * The sections are split where the data is, not evenly: products and
     * customers are the two that grow without bound, so each is alone.
     */
    const section=clean(b.section||url.searchParams.get('section'),40);
    const want=(name)=>!section||section===name;
    if(section&&!['products','indexes','settings','customers','reviews','returns','admins'].includes(section))
      return json({ok:false,error:'unknown_section',sections:['products','indexes','settings','customers','reviews','returns','admins']},422);

    /**
     * Where in the section to start, and how much of it to take.
     *
     * Splitting by section was not enough. `products` alone is 2,143 records —
     * forty-three round trips to Singapore and a JSON document built out of all
     * of them — and that request answers 503 on its own. A section is still a
     * shape; a page is a size, and only a size can be made to fit.
     *
     * Both default to the whole thing, so a caller that passes neither gets
     * exactly what this endpoint has always returned.
     */
    const offset=Math.max(0,Number(b.offset||url.searchParams.get('offset')||0)||0);
    /**
     * The page size is a budget of *keys*, not of records, because the limit
     * that actually binds is Cloudflare's fifty subrequests per invocation.
     *
     * Measured against production rather than guessed: `limit=45` answers 200
     * and `limit=50` answers 503, both in about three seconds. Forty-five
     * product reads plus the index read is forty-six; fifty is fifty-one, and
     * the worker is killed. It never was CPU — a request that fetches two keys
     * takes four seconds here and succeeds.
     *
     * Batching inside the handler cannot help. The fifty are counted for the
     * whole invocation, not per burst, so `Promise.all` in twos or in fifties
     * spends exactly the same budget.
     *
     * Forty leaves room for what every request does besides the page: read the
     * session, read an index, write the audit line.
     */
    const KEY_BUDGET=40;
    const limit=Math.max(1,Math.min(KEY_BUDGET,Number(b.limit||url.searchParams.get('limit')||KEY_BUDGET)||KEY_BUDGET));
    let nextOffset=null;
    /**
     * One page of a list, sized by how many keys each entry costs.
     *
     * A customer is four keys — orders, addresses, wishlist, and the record
     * itself — so ten customers spend the same budget as forty products. Paging
     * by record count would make one section fit and another fail, which is the
     * shape of bug that took three deploys to find the first time.
     */
    const page=(keys,perItem=1)=>{
      const take=Math.max(1,Math.min(limit,Math.floor(KEY_BUDGET/Math.max(1,perItem))));
      const slice=keys.slice(offset,offset+take);
      if(offset+take<keys.length)nextOffset=offset+take;
      return slice;
    };

    if(want('products')){
      const productIds=await productIdsFromStore(ds);
      // The index travels with the first page only: it is one key, and repeating
      // it on every page would make each page carry the whole catalogue's ids.
      if(offset===0)out.data['product-index']=productIds;
      await collect(ds,page(productIds).map(id=>`product:${id}`),out.data);
    }
    if(want('indexes')){
      /*
       * Flattened before it is paged. Reading twelve indexes and everything
       * under each of them is unbounded the moment orders grow, and it would
       * hit the same wall products did — later, and on the day the shop is
       * busiest.
       */
      const all=[];
      for(const [idxKey,prefix] of specs){
        const idx=await getJSON(ds,idxKey)||[];
        if(offset===0)out.data[idxKey]=idx;
        for(const id of idx)all.push(prefix+id);
      }
      // Twelve index reads happen above before a single record is fetched, so
      // this page is deliberately half-sized to leave room for them.
      await collect(ds,page(all,2),out.data);
    }
    if(want('settings')){
      for(const k of ['site-settings','business-settings']){ const v=await getJSON(ds,k); if(v) out.data[k]=v; }
    }
    if(want('customers')){
      const allCustomers=await getJSON(ds,'customer-index')||[];
      if(offset===0)out.data['customer-index']=allCustomers;
      const customerIdx=page(allCustomers,4);
      await collect(ds,customerIdx.flatMap(cid=>[`orders-by-customer:${cid}`,`addresses:${cid}`,`wishlist:${cid}`]),out.data);
      // The customer records themselves, and the two lookup keys each one needs
      // to be signed in with again after a restore.
      const customerRows=await readMany(au,customerIdx.map(cid=>`customer:${cid}`));
      customerIdx.forEach((cid,i)=>{const c=customerRows[i];if(!c)return;out.auth[`customer:${cid}`]=c;out.auth[`email:${sha(c.email)}`]={id:cid};out.auth[`phone:${sha(c.phone)}`]={id:cid};});
    }
    if(want('reviews')){
      const productIdx2=await productIdsFromStore(ds);
      await collect(ds,page(productIdx2).map(pid=>`reviews-by-product:${pid}`),out.data);
    }
    if(want('returns')){
      const orderIdx2=await getJSON(ds,'order-index')||[];
      await collect(ds,page(orderIdx2).map(oid=>`return-by-order:${oid}`),out.data);
    }
    if(want('admins')){
      const adminIdx=await getJSON(au,'adminuser-index')||[]; out.auth['adminuser-index']=adminIdx;
      for(const id of adminIdx){ const u=await getJSON(au,`adminuser-byid:${id}`); if(u){ out.auth[`adminuser-byid:${id}`]=u; out.auth[`adminuser:${sha(u.username)}`]=u; } }
    }
    // Only a complete export is a backup. A section is a piece of one, and
    // stamping the freshness date for a piece would let a run that fetched
    // settings alone reset the readiness clock the whole check depends on.
    if(!section&&offset===0&&nextOffset===null){ await ds.setJSON('backup-meta',{last_backup_at:out.created_at,last_backup_by:ss.data.username}); }
    await auditLog(req,ss,'admin.backup.export',{items:Object.keys(out.data).length,section:section||'all',offset});
    return json({ok:true,backup:out,section:section||null,offset,next_offset:nextOffset});
  }
  if(action==='admin.backup.restore'){
    if(!maySuperAdmin(ss,'admin.backup.restore')) return json({ok:false,error:'forbidden_super_admin_only'},403); if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const bk=b.backup; if(!bk||bk.version!==1||typeof bk.data!=='object') return json({ok:false,error:'invalid_backup'},422);
    const ds=dataStore(), au=authStore(); let restored=0;
    for(const [k,v] of Object.entries(bk.data||{})){ if(!/^(order-index|order:|product-index|product:|category-index|category:|brand-index|brand:|contact-index|contact:|slip-index|slip:|inventory-log-index|inventory-log:|audit-index|audit:|coupon-index|coupon:|review-index|review:|reviews-by-product:|return-index|return:|return-by-order:|subscriber-index|subscriber:|customer-index|orders-by-customer:|addresses:|wishlist:|warehouse-index|warehouse:|site-settings|business-settings)/.test(k)) continue; await ds.setJSON(k,v); restored++; }
    for(const [k,v] of Object.entries(bk.auth||{})){ if(!/^(adminuser-index|adminuser-byid:|adminuser:|customer:|email:|phone:)/.test(k)) continue; await au.setJSON(k,v); restored++; }
    await ds.setJSON('backup-meta',{last_backup_at:new Date().toISOString(),last_backup_by:ss.data.username,restored_from:bk.created_at||null}); await auditLog(req,ss,'admin.backup.restore',{restored});
    return json({ok:true,restored});
  }


  if(action==='contact.create'){
    const rl=await rateLimit(req,'contact',10,60*60); if(!rl.ok) return tooMany(rl);
    const human=await requireHuman(req,b,'contact'); if(human) return human;
    const name=clean(b.name,150), email=clean(b.email,190).toLowerCase(), contactPhone=clean(b.phone,40), message=clean(b.message,5000);
    if(!name||!message||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return json({ok:false,error:'invalid_input'},422);
    const id=crypto.randomUUID(); const ds=dataStore(); const created_at=new Date().toISOString();
    await ds.setJSON(`contact:${id}`,{id,name,email,phone:contactPhone,message,created_at}); await appendToIndex(ds,'contact-index',id);
    try{ const settings=await getBusinessSettings(); const mailer=await buildMailer(settings); const to=clean(process.env.ORDER_NOTIFY_EMAIL||settings.notifications?.order_notify_email||settings.email.from_email,190); const text=`ข้อความใหม่จากเว็บไซต์\nชื่อ: ${name}\nโทร: ${contactPhone||'-'}\nอีเมล: ${email||'-'}\n\n${message}`; if(mailer&&to) await mailer.sendMail({from:`"${settings.email.from_name}" <${settings.email.from_email||settings.email.smtp_user}>`,to,subject:'ข้อความใหม่จากหน้า Contact - THAISERKIT SUPPLY',text}).catch(()=>{}); const chatConfig=await tskTelegramConfig(); await tskTelegramCall(chatConfig,'sendMessage',{chat_id:chatConfig.chatId,text}); }catch{}
    return json({ok:true});
  }
  if(action==='newsletter.subscribe'){
    const rl=await rateLimit(req,'newsletter',10,60*60); if(!rl.ok) return tooMany(rl);
    const email=clean(b.email,190).toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({ok:false,error:'invalid_email'},422); { const ds=dataStore(); const key=sha(email); await ds.setJSON(`subscriber:${key}`,{email,status:'active',created_at:new Date().toISOString()}); await appendToIndex(ds,'subscriber-index',key); } return json({ok:true,status:'active'});
  }
  // ---------- Business settings (payment / email / facebook) ----------
  if(action==='business.settings.get'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    const s=await getBusinessSettings();
    return json({ok:true, role: ss.data.role||'admin', settings: maskSettingsForAdmin(s)});
  }
  if(action==='business.settings.save'){
    if(!maySuperAdmin(ss,'business.settings.save')) return json({ok:false,error:'forbidden_super_admin_only'},403);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const stored = await getJSON(dataStore(),'business-settings')||{};
    const current = await getBusinessSettings();
    const payIn=b.payment===undefined?current.payment:b.payment, emailIn=b.email===undefined?current.email:b.email, fbIn=b.facebook===undefined?current.facebook:b.facebook, spIn=b.shopee===undefined?current.shopee:b.shopee, lzIn=b.lazada===undefined?current.lazada:b.lazada, nIn=b.notifications===undefined?current.notifications:b.notifications;
    const payment = {
      promptpay_id: clean(payIn?.promptpay_id,20),
      promptpay_name: clean(payIn?.promptpay_name,120),
      bank_accounts: Array.isArray(payIn?.bank_accounts) ? payIn.bank_accounts.slice(0,10).map(a=>({
        bank_name: clean(a?.bank_name,100), account_name: clean(a?.account_name,150), account_no: clean(a?.account_no,40)
      })) : current.payment.bank_accounts,
      bank_transfer_enabled: payIn?.bank_transfer_enabled!==false,
      cod_enabled: payIn?.cod_enabled!==false,
      line_order_enabled: !!payIn?.line_order_enabled,
      line_oa_url: clean(payIn?.line_oa_url,500),
      line_oa_name: clean(payIn?.line_oa_name,120)||'LINE Official ร้าน',
      omise_public_key: clean(payIn?.omise_public_key,200) || current.payment.omise_public_key,
      omise_secret_key: preservedSecret(payIn?.omise_secret_key,stored.payment?.omise_secret_key)
    };
    const email = {
      smtp_host: clean(emailIn?.smtp_host,200),
      smtp_port: Number(emailIn?.smtp_port||587),
      smtp_secure: !!emailIn?.smtp_secure,
      smtp_user: clean(emailIn?.smtp_user,200),
      smtp_pass: preservedSecret(emailIn?.smtp_pass,stored.email?.smtp_pass),
      from_name: clean(emailIn?.from_name,120)||DEFAULT_BUSINESS_SETTINGS.email.from_name,
      from_email: clean(emailIn?.from_email,190)
    };
    const facebook = {
      page_id: clean(fbIn?.page_id,60),
      page_username: clean(fbIn?.page_username,120),
      page_access_token: preservedSecret(fbIn?.page_access_token,stored.facebook?.page_access_token),
      verify_token: preservedSecret(fbIn?.verify_token,stored.facebook?.verify_token)
    };
    const shopee = {
      partner_id: clean(spIn?.partner_id,60),
      partner_key: preservedSecret(spIn?.partner_key,stored.shopee?.partner_key),
      shop_id: clean(spIn?.shop_id,60),
      redirect_url: clean(spIn?.redirect_url,300)
    };
    const lazada = {
      app_key: clean(lzIn?.app_key,60),
      app_secret: preservedSecret(lzIn?.app_secret,stored.lazada?.app_secret),
      country: clean(lzIn?.country,10) || 'th',
      redirect_url: clean(lzIn?.redirect_url,300)
    };
    const notifications = {
      telegram_alert_bot_token: preservedSecret(nIn?.telegram_alert_bot_token,stored.notifications?.telegram_alert_bot_token),
      telegram_alert_chat_id: clean(nIn?.telegram_alert_chat_id,120),
      telegram_chat_bot_token: preservedSecret(nIn?.telegram_chat_bot_token,stored.notifications?.telegram_chat_bot_token),
      telegram_chat_chat_id: clean(nIn?.telegram_chat_chat_id,120),
      telegram_bot_token: preservedSecret(nIn?.telegram_bot_token,stored.notifications?.telegram_bot_token),
      telegram_chat_id: clean(nIn?.telegram_chat_id,120),
      order_notify_email: clean(nIn?.order_notify_email,190)
    };
    const settings = { payment, email, facebook, shopee, lazada, notifications, updated_at:new Date().toISOString(), updated_by: ss.data.username };
    await dataStore().setJSON('business-settings', settings);
    await auditLog(req,ss,'admin.settings.save',{sections:Object.keys(b||{})});
    return json({ok:true, settings: maskSettingsForAdmin(settings)});
  }
  if(action==='business.settings.test_email'){
    if(!maySuperAdmin(ss,'business.settings.test_email')) return json({ok:false,error:'forbidden_super_admin_only'},403);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const settings = await getBusinessSettings();
    const to = clean(b.to,190) || settings.email.from_email;
    if(!to) return json({ok:false,error:'no_recipient'},422);
    const mailer = await buildMailer(settings);
    if(!mailer) return json({ok:false,error:'smtp_not_configured'},422);
    try{
      await mailer.sendMail({ from:`"${settings.email.from_name}" <${settings.email.from_email||settings.email.smtp_user}>`, to, subject:'ทดสอบระบบอีเมล THAISERKIT SUPPLY', text:'นี่คืออีเมลทดสอบจากระบบแอดมิน หากได้รับแปลว่าตั้งค่า SMTP ถูกต้องแล้ว' });
      return json({ok:true});
    }catch(e){ return json({ok:false,error:'send_failed',detail:String(e?.message||e)},502); }
  }


  // ---------- Sub-admin (role) management — super_admin only ----------
  if(action==='admin.users.list'){
    if(!maySuperAdmin(ss,'admin.users.list')) return json({ok:false,error:'forbidden_super_admin_only'},403);
    const idx = await getJSON(authStore(),'adminuser-index')||[];
    const users=[]; for(const id of idx){ const u=await getJSON(authStore(),`adminuser-byid:${id}`); if(u) users.push({id:u.id,username:u.username,name:u.name||u.username,role:u.role,active:u.active!==false,created_at:u.created_at}); }
    return json({ok:true, users, env_super_admin: process.env.ADMIN_USERNAME||null});
  }
  if(action==='admin.users.create'){
    if(!maySuperAdmin(ss,'admin.users.create')) return json({ok:false,error:'forbidden_super_admin_only'},403);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const username=clean(b.username,60).toLowerCase(), name=clean(b.name,150)||username, password=String(b.password||''), role=ADMIN_ROLES.includes(b.role)?b.role:'admin';
    if(!/^[a-z0-9_.-]{3,60}$/.test(username)||password.length<10) return json({ok:false,error:'invalid_input'},422);
    const key=`adminuser:${sha(username)}`; if(await getJSON(authStore(),key)) return json({ok:false,error:'username_exists'},409);
    const id=crypto.randomUUID(); const u={id,username,name,role,active:true,password_hash:hashPassword(password),created_at:new Date().toISOString(),created_by:ss.data.username};
    await authStore().setJSON(key,u); await authStore().setJSON(`adminuser-byid:${id}`,u);
    await appendToIndex(authStore(),'adminuser-index',id);
    await auditLog(req,ss,'admin.users.create',{id,username,role});
    return json({ok:true, user:{id,username,name,role,active:true}});
  }
  if(action==='admin.users.update'){
    if(!maySuperAdmin(ss,'admin.users.update')) return json({ok:false,error:'forbidden_super_admin_only'},403);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const id=clean(b.id,80); const u=await getJSON(authStore(),`adminuser-byid:${id}`); if(!u) return json({ok:false,error:'not_found'},404);
    if(b.role) u.role = ADMIN_ROLES.includes(b.role)?b.role:'admin';
    if(b.name!==undefined) u.name=clean(b.name,150)||u.username;
    if(typeof b.active==='boolean') u.active=b.active;
    if(b.password){ if(String(b.password).length<10) return json({ok:false,error:'weak_password'},422); u.password_hash=hashPassword(String(b.password)); }
    await authStore().setJSON(`adminuser-byid:${id}`,u); await authStore().setJSON(`adminuser:${sha(u.username)}`,u);
    await auditLog(req,ss,'admin.users.update',{id:u.id,active:u.active!==false,role:u.role});
    return json({ok:true, user:{id:u.id,username:u.username,name:u.name||u.username,role:u.role,active:u.active!==false}});
  }
  if(action==='admin.users.delete'){
    if(!maySuperAdmin(ss,'admin.users.delete')) return json({ok:false,error:'forbidden_super_admin_only'},403);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const id=clean(b.id,80); const u=await getJSON(authStore(),`adminuser-byid:${id}`); if(!u) return json({ok:false,error:'not_found'},404);
    await authStore().delete(`adminuser-byid:${id}`); await authStore().delete(`adminuser:${sha(u.username)}`);
    await removeFromIndex(authStore(),'adminuser-index',id);
    await auditLog(req,ss,'admin.users.delete',{id,username:u.username});
    return json({ok:true});
  }


  // ---------- Admin: list orders / contacts (needed for the admin panel + email/FB replies) ----------
  if(action==='admin.orders.list'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore();
    // Prefer the indexed relational projection when it has data. It carries the
    // complete commerce document in `payload`, so the admin does not lose
    // variants, tax invoice, tracking or bundle fields while moving off app_kv.
    if(relationalOrderReadsEnabled()){
      try{
        const relational=await readRelationalOrders(activeTenant().id,{limit:300,excludePendingPayment:true});
        if(relational.length){
          const commissionRows=await listJSONByPrefix(ds,'commission:','commission-index');
          const byOrder=new Map();
          for(const c of commissionRows){if(c?.order_id)byOrder.set(String(c.order_id),c);}
          const orders=relational.map(o=>{const c=o.agent_id?byOrder.get(String(o.id)):null;return {...o,agent_commission:c?{id:c.id,status:c.status,amount:c.amount,rate:c.rate,created_at:c.created_at}:null};});
          return json({ok:true,orders,source:'relational'});
        }
      }catch(error){console.warn('relational admin orders failed',error?.message||error);}
    }
    // Compatibility fallback for installations that have not run the
    // relational projection migration yet.
    const [orderRows,commissionRows]=await Promise.all([
      listJSONByPrefix(ds,'order:','order-index'),
      listJSONByPrefix(ds,'commission:','commission-index'),
    ]);
    const byOrder=new Map();
    for(const c of commissionRows){ if(c?.order_id) byOrder.set(String(c.order_id),c); }
    const orders=orderRows
      .filter(o=>o&&o.status!=='pending_payment')
      .sort((a,z)=>String(z.created_at||'').localeCompare(String(a.created_at||'')))
      .slice(0,300)
      .map(o=>{
        const c=o.agent_id?byOrder.get(String(o.id)):null;
        return {...o,agent_commission:c?{id:c.id,status:c.status,amount:c.amount,rate:c.rate,created_at:c.created_at}:null};
      });
    return json({ok:true,orders,source:'commerce'});
  }
  if(action==='admin.commissions.list'){
    if(!maySuperAdmin(ss,'admin.commissions.list')) return json({ok:false,error:'forbidden_super_admin_only'},403);
    const ds=dataStore(),rows=[];for(const id of (await getJSON(ds,'commission-index')||[]).slice().reverse()){const x=await getJSON(ds,`commission:${id}`);if(x)rows.push(x);}const payouts=[];for(const id of (await getJSON(ds,'payout-index')||[])){const x=await getJSON(ds,`payout:${id}`);if(x)payouts.push(x);}
    const groups=new Map();for(const r of rows){const g=groups.get(r.agent_id)||{ledger:0,paid:0,pending:0};if(r.status!=='reversed')g.ledger+=Number(r.amount||0);groups.set(r.agent_id,g);}for(const p of payouts){const g=groups.get(p.agent_id)||{ledger:0,paid:0,pending:0};if(p.status==='paid')g.paid+=Number(p.amount||0);if(p.status==='pending')g.pending+=Number(p.amount||0);groups.set(p.agent_id,g);}let available=0,debt=0,paid=0,pending=0,ledger=0;for(const g of groups.values()){ledger+=g.ledger;paid+=g.paid;pending+=g.pending;const raw=g.ledger-g.paid-g.pending;available+=Math.max(0,raw);debt+=Math.max(0,-raw);}const reversed=rows.filter(x=>x.status==='reversed').reduce((a,x)=>a+Math.abs(Number(x.amount||0)),0);
    return json({ok:true,commissions:rows,payouts,totals:{available,paid,pending,debt,reversed,all:ledger}});
  }
  if(action==='admin.contacts.list'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    const idx=await getJSON(dataStore(),'contact-index')||[]; const contacts=[];
    for(const id of idx.slice(-300).reverse()){ const c=await getJSON(dataStore(),`contact:${id}`); if(c) contacts.push(c); }
    return json({ok:true, contacts});
  }


  // ---------- Admin: send an email to a customer/contact, fully configured from the admin panel ----------
  if(action==='email.send'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const to=clean(b.to,190), subject=clean(b.subject,200), messageText=clean(b.message,20000);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||!subject||!messageText) return json({ok:false,error:'invalid_input'},422);
    const settings=await getBusinessSettings(); const mailer=await buildMailer(settings);
    if(!mailer) return json({ok:false,error:'smtp_not_configured'},422);
    try{
      await mailer.sendMail({ from:`"${settings.email.from_name}" <${settings.email.from_email||settings.email.smtp_user}>`, to, subject, text: messageText });
      const id=crypto.randomUUID(); await dataStore().setJSON(`email-log:${id}`,{id,to,subject,sent_by:ss.data.username,created_at:new Date().toISOString()});
      return json({ok:true});
    }catch(e){ return json({ok:false,error:'send_failed',detail:String(e?.message||e)},502); }
  }


  // ---------- Admin: Facebook Messenger inbox (reply to customers without touching code) ----------
  if(action==='facebook.conversations.list'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    const idx=await getJSON(dataStore(),'fb-conversation-index')||[]; const list=[];
    for(const psid of idx){ const c=await getJSON(dataStore(),`fb-conversation:${psid}`); if(c) list.push({psid, name:c.name||psid, last_message:c.messages?.[c.messages.length-1]||null, unread:c.unread||0}); }
    list.sort((a,b2)=> new Date(b2.last_message?.at||0) - new Date(a.last_message?.at||0));
    return json({ok:true, conversations:list});
  }
  if(action==='facebook.conversation.get'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    const psid=clean(b.psid||url.searchParams.get('psid'),80); const c=await getJSON(dataStore(),`fb-conversation:${psid}`);
    if(!c) return json({ok:false,error:'not_found'},404);
    c.unread=0; await dataStore().setJSON(`fb-conversation:${psid}`,c);
    return json({ok:true, conversation:c});
  }
  if(action==='facebook.message.send'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const psid=clean(b.psid,80), text=clean(b.text,2000);
    if(!psid||!text) return json({ok:false,error:'invalid_input'},422);
    const settings=await getBusinessSettings();
    const result=await sendFacebookMessage(settings, psid, text);
    if(!result.ok) return json(result,422);
    const key=`fb-conversation:${psid}`; const c=await getJSON(dataStore(),key)||{psid,messages:[],unread:0};
    c.messages=[...(c.messages||[]),{from:'page',text,at:new Date().toISOString(),by:ss.data.username}];
    await dataStore().setJSON(key,c);
    return json({ok:true});
  }


  // ---------- Payment: PromptPay QR (works instantly, no gateway account needed) ----------
  if(action==='payment.promptpay_qr'){
    const rl=await rateLimit(req,'promptpay-qr',60,60*60); if(!rl.ok) return tooMany(rl);
    const settings = await getBusinessSettings();
    const id = clean(settings.payment.promptpay_id,40).replace(/[^0-9]/g,'');
    if(!id) return json({ok:false,error:'promptpay_not_configured'},422);
    if(![10,13,15].includes(id.length)) return json({ok:false,error:'promptpay_invalid_id'},422);
    const rawAmount = b.amount!==undefined ? b.amount : url.searchParams.get('amount');
    let amount = rawAmount===undefined || rawAmount===null || rawAmount==='' ? undefined : Number(rawAmount);
    if(amount!==undefined && (!Number.isFinite(amount) || amount<=0)) return json({ok:false,error:'invalid_amount'},422);
    // Bind the QR to the server-priced order total when the caller knows the
    // order. Pre-order checkout still sends a client amount for display only;
    // order.create recomputes the authoritative total and the slip verifier
    // asserts it, so a forged amount can at most show a wrong QR, never pay.
    const qrOrderNo=clean(b.order_no||url.searchParams.get('order_no'),40);
    if(qrOrderNo){
      try{
        const qrOrder=await findOrderByNumber(dataStore(),qrOrderNo);
        // The total is order PII: only the owning customer (or a caller with
        // the order's upload token, e.g. a guest finishing payment) may bind
        // a QR to the server-side total. Anyone else falls back to the
        // client-supplied display amount — no disclosure, no override.
        const ownsQr=qrOrder && ss.data?.type==='customer' && qrOrder.customer_id && ss.data.customer?.id===qrOrder.customer_id;
        const qrToken=clean(b.upload_token,200);
        // Same constant-time shape as the slip-upload token check below.
        const validQrToken=qrToken && qrOrder?.upload_token_hash && crypto.timingSafeEqual(Buffer.from(sha(qrToken)),Buffer.from(String(qrOrder.upload_token_hash)));
        if(qrOrder && (ownsQr||validQrToken) && Number.isFinite(Number(qrOrder.total)) && Number(qrOrder.total)>0) amount=Number(qrOrder.total);
      }catch{}
    }
    // Only the payload is built here. `promptpay-qr` is pure arithmetic and
    // runs anywhere; drawing the image is the fragile half. `qrcode`'s default
    // entry pulls in pngjs → node streams → util.inherits, which the Cloudflare
    // Workers runtime does not provide, so QRCode.toDataURL threw and this
    // endpoint answered 500 — a shopper on the checkout page had no way to pay.
    // The browser draws the QR from this payload instead (checkout.vue), and
    // the account number below is shown either way, so payment never depends on
    // an image the edge cannot render.
    try{
      const {default:generatePayload}=await import('promptpay-qr');
      const payload = generatePayload(id, amount ? { amount } : {});
      if(!payload) throw new Error('empty promptpay payload');
      return json({ok:true, payload, qr_data_url:'', promptpay_id:id, promptpay_name: settings.payment.promptpay_name, amount: amount||null, order_no: qrOrderNo||null });
    }catch(e){
      console.error('[TSK] PromptPay payload generation failed', e?.message||e);
      // Still hand back the account details so the checkout can be paid.
      return json({ok:true, payload:'', qr_data_url:'', promptpay_id:id, promptpay_name: settings.payment.promptpay_name, amount: amount||null, order_no: qrOrderNo||null, qr_unavailable:true});
    }
  }


  // ---------- Payment: slip upload (customer) + verification (admin) — works with zero external approval ----------
  if(action==='payment.slip.upload'){
    const rl=await rateLimit(req,'slip-upload',10,60*60); if(!rl.ok) return tooMany(rl);
    const order_no = clean(b.order_no,40), image_data_url = String(b.image_data_url||'');
    if(!order_no || !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(image_data_url)) return json({ok:false,error:'invalid_input'},422);
    if(image_data_url.length>3500000) return json({ok:false,error:'image_too_large'},413);
    const ds=dataStore();
    const order=await findOrderByNumber(ds,order_no);
    if(!order) return json({ok:false,error:'order_not_found'},404);
    const uploadToken=clean(b.upload_token,200);
    const ownsOrder=ss.data?.type==='customer' && order.customer_id && ss.data.customer?.id===order.customer_id;
    const validToken=uploadToken && order.upload_token_hash && crypto.timingSafeEqual(Buffer.from(sha(uploadToken)),Buffer.from(order.upload_token_hash));
    if(!ownsOrder && !validToken) return json({ok:false,error:'invalid_order_token'},403);
    if(['paid','processing','packing','shipped','completed','cancelled','refunded','expired'].includes(order.status)) return json({ok:false,error:'order_not_accepting_slip',status:order.status},409);
    if(!/โอนเงิน|พร้อมเพย์/i.test(String(order.payment_method||''))) return json({ok:false,error:'slip_not_allowed_for_payment_method'},409);
    const slipId=crypto.randomUUID();
    const verification=await verifySlipAutomatically(image_data_url, order.total);
    // The verifier echoes what IT read on the slip — assert it equals what WE
    // charged. Without this, a genuine 10 THB slip pays a 5,000 THB order.
    // Fail closed to manual review; the slip row keeps the raw result for audit.
    const amountMatches=isSlipAmountMatching(verification.data?.amount, order.total);
    if(verification.configured && verification.verified && !amountMatches){
      verification.verified=false;
      verification.error='amount_mismatch';
    }
    const autoVerified=verification.configured && verification.verified && amountMatches;
    const slip={ id:slipId, order_no, order_id:order.id, image_data_url, status:autoVerified?'verified_auto':'pending', note:clean(b.note,300), created_at:new Date().toISOString(), verification_provider:verification.provider, verification_result:verification.data||null, verification_error:verification.error||null };
    await ds.setJSON(`slip:${slipId}`, slip);
    await appendToIndex(ds,'slip-index',slipId);
    if(autoVerified){
      order.status='paid'; order.payment_status='paid'; order.payment_review_mode='automatic_slip'; order.payment_reviewed_by='SlipOK'; order.payment_reviewed_at=new Date().toISOString(); if(order.tax_invoice_requested) order.tax_invoice_status='ready'; order.payment_reference=verification.data?.transRef||'';
      if(!order.stock_deducted) await deductStockForOrder(ds,order,{data:{username:'SlipOK'}});
      await consumeCouponForOrder(ds,order);
      order.status_history=[...(order.status_history||[]),{status:'paid',at:new Date().toISOString(),by:'SlipOK'}];
      await ds.setJSON(`order:${order.id}`,order);
      await mirrorOrderProjection(dataNamespace(),order);
      // The order was already announced when it was placed, so this is the
      // payment confirmation only — not a second copy of the same order.
      await notifyOrderPayment(order,'SlipOK');
    }else{
      order.status='awaiting_verification'; order.payment_status='awaiting_verification';
      order.status_history=[...(order.status_history||[]),{status:'awaiting_verification',at:new Date().toISOString(),by:'customer_slip'}];
      await ds.setJSON(`order:${order.id}`, order);
      await mirrorOrderProjection(dataNamespace(),order);
      await notifyOrderSlip(order);
    }
    return json({ok:true, slip_id:slipId, auto_verified:autoVerified, verification_configured:verification.configured, verification_provider:verification.provider, order_status:order.status, payment_status:order.payment_status});
  }
  if(action==='admin.slips.list'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    const slips=(await listJSONByPrefix(dataStore(),'slip:','slip-index'))
      .filter(Boolean)
      .sort((a,z)=>String(z.created_at||'').localeCompare(String(a.created_at||'')))
      .slice(0,200);
    return json({ok:true, slips});
  }
  if(action==='admin.slip.verify'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const id=clean(b.id,80), approve=!!b.approve;
    const ds=dataStore(); const slip=await getJSON(ds,`slip:${id}`); if(!slip) return json({ok:false,error:'not_found'},404);
    slip.status = approve ? 'verified' : 'rejected'; slip.reviewed_by=ss.data.username; slip.reviewed_at=new Date().toISOString();
    await ds.setJSON(`slip:${id}`, slip);
    if(slip.order_id){
      const o=await getJSON(ds,`order:${slip.order_id}`);
      if(o){
        if(['paid','processing','packing','shipped','completed','cancelled','refunded','expired'].includes(o.status)) return json({ok:false,error:'order_state_locked',status:o.status},409);
        const nextStatus = approve ? 'paid' : 'awaiting_verification';
        o.status = nextStatus;
        o.payment_status = approve ? 'paid' : 'awaiting_verification';
        if(approve){
          o.payment_review_mode = 'manual_slip';
          o.payment_reviewed_by = ss.data.username;
          o.payment_reviewed_at = new Date().toISOString();
          if(o.tax_invoice_requested) o.tax_invoice_status='ready';
          await deductStockForOrder(ds, o, ss);
          await consumeCouponForOrder(ds,o);
        }
        o.status_history=[...(o.status_history||[]),{status:nextStatus,at:new Date().toISOString(),by:ss.data.username}];
        await ds.setJSON(`order:${o.id}`,o);
        await mirrorOrderProjection(dataNamespace(),o);
      }
    }
    if(slip.order_id){
      const changedOrder=await getJSON(ds,`order:${slip.order_id}`);
      if(changedOrder){
        if(approve) await notifyOrderPayment(changedOrder,ss.data.username);
        else await notifyTelegram(`⚠️ สลิปถูกปฏิเสธ\nเลขคำสั่งซื้อ: ${changedOrder.order_no}\nลูกค้า: ${changedOrder.name||'-'}\nผู้ตรวจสอบ: ${ss.data.username}`);
      }
    }
    await auditLog(req,ss,'admin.slip.verify',{id,approve,order_id:slip.order_id});
    return json({ok:true});
  }
  if(action==='admin.order.status'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const id=clean(b.id,80), status=clean(b.status,40);
    const allowed=['pending_payment','new','awaiting_verification','paid','processing','packing','shipped','completed','cancelled','refunded','expired'];
    if(!allowed.includes(status)) return json({ok:false,error:'invalid_status'},422);
    const ds=dataStore(); const o=await getJSON(ds,`order:${id}`); if(!o) return json({ok:false,error:'not_found'},404);
    const prevStatus=o.status;
    if(!orderTransitionAllowed(o,status)) return json({ok:false,error:'invalid_order_transition',from:prevStatus,to:status},409);
    if(status==='completed' && o.payment_status!=='paid' && !/COD|ปลายทาง/i.test(String(o.payment_method||''))) return json({ok:false,error:'payment_not_verified'},409);
    if((status==='cancelled'||status==='refunded') && o.stock_deducted) await restoreStockForOrder(ds, o, ss);
    if((status==='cancelled'||status==='refunded') && o.stock_reserved && !o.stock_deducted) await releaseReservationForOrder(ds, o);
    if(status==='cancelled'||status==='refunded') await releaseCouponForOrder(ds, o);
    if(status==='paid' && !o.stock_deducted) await deductStockForOrder(ds, o, ss);
    o.status=status;
    if(o.tax_invoice_requested && ['paid','processing','packing','shipped','completed'].includes(status)) o.tax_invoice_status='ready';
    if(/COD|ปลายทาง/i.test(String(o.payment_method||'')) && status==='completed'){
      o.payment_status='paid';o.payment_review_mode='cod';o.payment_reviewed_by=ss.data.username;o.payment_reviewed_at=new Date().toISOString();
    }
    if(/LINE/i.test(String(o.payment_method||''))){
      if(status==='paid'){o.payment_status='paid';o.payment_review_mode='manual_admin';o.payment_reviewed_by=ss.data.username;o.payment_reviewed_at=new Date().toISOString();}
      else if(['new','awaiting_verification'].includes(status)){o.payment_status='pending_manual';}
    }
    if(status==='shipped'){
      if(b.carrier!==undefined) o.carrier=clean(b.carrier,100);
      if(b.tracking_number!==undefined) o.tracking_number=clean(b.tracking_number,100);
      o.shipped_at=new Date().toISOString();
    }
    o.status_history=[...(o.status_history||[]),{status,at:new Date().toISOString(),by:ss.data.username}];
    await ds.setJSON(`order:${id}`,o);
    await mirrorOrderProjection(dataNamespace(),o);
    await syncOrderSettlementStatus(ds,o);
    if(prevStatus!==status && status==='completed') await ensureAgentCommission(ds,o,ss.data.username);
    if(prevStatus!==status && (status==='cancelled'||status==='refunded')) await reverseAgentCommission(ds,o,status,ss.data.username);
    if(prevStatus!==status){
      if(status==='paid') await notifyOrderPayment(o,ss.data.username);
      else if(status==='shipped') await notifyOrderShipped(o,ss.data.username);
      else if(status==='completed') await notifyOrderCompleted(o,ss.data.username);
      else if(status==='cancelled'||status==='refunded') await notifyOrderCancelled(o,status,ss.data.username);
    }
    await auditLog(req,ss,'admin.order.status',{id,from:prevStatus,to:status});
    return json({ok:true, order:o});
  }
  if(action==='admin.order.shipping'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const id=clean(b.id,80); const ds=dataStore(); const o=await getJSON(ds,`order:${id}`); if(!o) return json({ok:false,error:'not_found'},404);
    o.carrier=clean(b.carrier,100); o.tracking_number=clean(b.tracking_number,100);
    await ds.setJSON(`order:${id}`,o);
    await mirrorOrderProjection(dataNamespace(),o);
    await auditLog(req,ss,'admin.order.shipping',{id,carrier:o.carrier,tracking_number:o.tracking_number});
    return json({ok:true, order:o});
  }


  // ---------- Payment: Omise card charge (ready to use once Super Admin fills Omise keys — needs an Omise business account) ----------
  if(action==='payment.omise.charge'){
    return json({ok:false,error:'card_payment_disabled_in_release_42'},410);
    const rl=await rateLimit(req,'omise-charge',10,60*60); if(!rl.ok) return tooMany(rl);
    const settings=await getBusinessSettings(); const secret=settings.payment.omise_secret_key||process.env.OMISE_SECRET_KEY;
    if(!secret) return json({ok:false,error:'omise_not_configured'},422);
    const token=clean(b.token,200), order_no=clean(b.order_no,40), uploadToken=clean(b.upload_token,200);
    if(!token||!order_no) return json({ok:false,error:'invalid_input'},422);
    const ds=dataStore();
    const order=await findOrderByNumber(ds,order_no);
    if(!order) return json({ok:false,error:'order_not_found'},404);
    const ownsOrder=ss.data?.type==='customer' && order.customer_id && ss.data.customer?.id===order.customer_id;
    const validToken=uploadToken && order.upload_token_hash && crypto.timingSafeEqual(Buffer.from(sha(uploadToken)),Buffer.from(order.upload_token_hash));
    if(!ownsOrder && !validToken) return json({ok:false,error:'invalid_order_token'},403);
    const amountSatang=Math.round(Number(order.total||0)*100); if(!(amountSatang>0)) return json({ok:false,error:'invalid_order_total'},422);
    try{
      const res=await fetch('https://api.omise.co/charges',{
        method:'POST',
        headers:{ 'authorization':'Basic '+Buffer.from(secret+':').toString('base64'), 'content-type':'application/x-www-form-urlencoded' },
        body:new URLSearchParams({ amount:String(amountSatang), currency:'thb', card:token, description:`Order ${order_no||''}` })
      });
      const data=await res.json();
      if(!res.ok||data.failure_code) return json({ok:false,error:data.failure_message||'charge_failed'},402);
      order.status='paid'; order.payment_status='paid'; order.omise_charge_id=data.id; await deductStockForOrder(ds,order,ss); await ds.setJSON(`order:${order.id}`,order);
      await notifyOrderPayment(order,'automatic');
      return json({ok:true, charge_id:data.id, status:data.status});
    }catch(e){ return json({ok:false,error:'charge_error',detail:String(e?.message||e)},502); }
  }


  // ================= Categories =================
  // Categories were walked one key at a time for the same reason brands were.
  // Both storefront reads now run as a single prefix query, ordered by the
  // admin-managed index.
  async function loadAllCategories(ds){
    const [idx,rows]=await Promise.all([
      Promise.resolve(getJSON(ds,'category-index')).then(v=>Array.isArray(v)?v:[]).catch(()=>[]),
      listJSONByPrefix(ds,'category:','category-index'),
    ]);
    const order=new Map(idx.map((key,position)=>[String(key),position]));
    const rank=c=>order.has(String(c.key))?order.get(String(c.key)):Number.MAX_SAFE_INTEGER;
    return rows.filter(c=>c&&c.key).sort((a,z)=>rank(a)-rank(z));
  }
  /**
   * Storefront URLs use the stable category key (for example `pump`), while
   * imported products store the Thai display name (`ปั๊มน้ำ`).  Comparing the
   * two literally made every category link look empty.  Resolve either form to
   * the managed row before a catalog query, while preserving old direct-name
   * links that pre-date the category manager.
   */
  async function resolveManagedCategory(ds,value){
    const token=clean(value,120);if(!token)return null;
    const direct=await getJSON(ds,`category:${token}`).catch(()=>null);
    if(direct)return direct;
    const normalized=token.toLowerCase();
    return (await loadAllCategories(ds)).find(c=>
      [c.key,c.id,c.slug,c.name].some(candidate=>clean(candidate,120).toLowerCase()===normalized)
    )||null;
  }
  // Whether the live chat can actually deliver a message. The widget offered a
  // text box unconditionally, so a customer typed a question, pressed send and
  // got a red error — the worst possible moment to discover the channel is not
  // configured. A boolean leaks nothing; the token and chat id stay server-side.
  // How many things are waiting for someone, for the badges on the console
  // navigation. Without these an operator has to open each section to find out
  // whether anything arrived, which is how a paid order sits unnoticed.
  //
  // Deliberately counted, not fetched. admin.dashboard.metrics reads every
  // order and every product to build its figures; doing that on every page of
  // the console would be the sitemap mistake again. Each line below is a
  // PostgREST count with `limit=0` — the database answers with a number in a
  // header and sends no rows at all.
  if(action==='admin.badges'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    const zero={orders:0,slips:0,chat:0,agents:0};
    if(storageBackend()==='postgres'&&postgresEnabled()){
      try{
        const db=database(); const ns=dataNamespace();
        const [orders,slips,chat,agents]=await Promise.all([
          relationalOrderReadsEnabled()
            ? db.pool.query(`SELECT COUNT(*)::int AS count FROM orders WHERE tenant_id=$1 AND status IN ('new','pending_payment','awaiting_verification')`,[activeTenant().id])
            : db.pool.query(`SELECT COUNT(*)::int AS count FROM app_kv WHERE namespace=$1 AND key LIKE 'order:%' AND value->>'status' IN ('new','pending_payment','awaiting_verification')`,[ns]),
          db.pool.query(`SELECT COUNT(*)::int AS count FROM app_kv WHERE namespace=$1 AND key LIKE 'slip:%' AND value->>'status'='pending'`,[ns]),
          db.pool.query(`SELECT COUNT(*)::int AS count FROM app_kv WHERE namespace=$1 AND key LIKE 'chat-conversation:%' AND value->>'awaiting_reply'='true'`,[ns]),
          db.pool.query(`SELECT COUNT(*)::int AS count FROM app_kv WHERE namespace=$1 AND key LIKE 'agent-application:%' AND value->>'status'='pending'`,[ns]),
        ]);
        return json({ok:true,badges:{orders:Number(orders.rows[0]?.count||0),slips:Number(slips.rows[0]?.count||0),chat:Number(chat.rows[0]?.count||0),agents:Number(agents.rows[0]?.count||0)},source:'postgres'},200,{'cache-control':'private, max-age=15'});
      }catch(error){console.warn('postgres admin badges failed',error?.message||error);}
    }
    const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
    const secret=process.env.SUPABASE_SECRET_KEY;
    if(!base||!secret) return json({ok:true,badges:zero,source:'unavailable'});
    async function countWhere(keyPattern,filters){
      try{
        const params=new URLSearchParams({select:'key',namespace:`eq.${dataNamespace()}`,key:`like.${keyPattern}`,limit:'0'});
        for(const [field,test] of Object.entries(filters)) params.set(field,test);
        const res=await fetch(`${base}/rest/v1/app_kv?${params}`,{
          headers:{apikey:secret,authorization:`Bearer ${secret}`,accept:'application/json',prefer:'count=exact'},
          signal:AbortSignal.timeout(5000),
        });
        // PostgREST reports the total in content-range as "*/<total>".
        const total=Number(String(res.headers.get('content-range')||'').split('/')[1]);
        return Number.isFinite(total)?total:0;
      }catch{ return 0; }
    }
    const [orders,slips,chat,agents]=await Promise.all([
      // Anything a human still has to act on: placed but not yet paid or packed.
      countWhere('order:*',{'value->>status':'in.(new,pending_payment,awaiting_verification)'}),
      countWhere('slip:*',{'value->>status':'eq.pending'}),
      countWhere('chat-conversation:*',{'value->>awaiting_reply':'eq.true'}),
      countWhere('agent-application:*',{'value->>status':'eq.pending'}),
    ]);
    return json({ok:true,badges:{orders,slips,chat,agents},source:'supabase'},200,{'cache-control':'private, max-age=15'});
  }
  // Every product URL, as cheaply as it can be produced.
  //
  // The sitemap used to build this by calling products.list eleven times — the
  // page cap is 100 and the catalogue is over a thousand — and each of those
  // returns full product bodies that then have to be parsed and mapped. On the
  // worker that blew the CPU budget and Cloudflare answered 1102, so
  // /sitemap.xml returned 503 and search engines saw a broken sitemap.
  //
  // This is one PostgREST request that selects the key and the timestamp and
  // nothing else: no product bodies, no mapping, no pagination. The key is
  // `product:<id>`, which is the only part a sitemap needs.
  if(action==='products.sitemap'){
    const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
    const secret=process.env.SUPABASE_SECRET_KEY;
    const out=[];
    if(storageBackend()==='postgres'&&postgresEnabled()){
      try{
        const result=await database().pool.query(`SELECT key,updated_at,value->>'slug' AS slug FROM app_kv WHERE namespace=$1 AND key LIKE 'product:%' AND COALESCE(value->>'state','active')='active' ORDER BY key ASC LIMIT $2`,[dataNamespace(),SITEMAP_MAX_URLS]);
        for(const row of result.rows||[]){
          const id=String(row?.key||'').slice('product:'.length);
          if(id)out.push({id,slug:String(row?.slug||''),updated_at:row?.updated_at||''});
        }
      }catch(error){console.warn('postgres sitemap catalog failed',error?.message||error);}
    }
    if(!out.length&&base&&secret){
      try{
        // This asked for 5,000 rows in one request. PostgREST will not give
        // them: Supabase caps a response at 1,000 rows (db-max-rows) and
        // silently returns the first 1,000 with a 200. A catalogue of 1,015
        // products therefore published a sitemap of 1,000 and the remaining
        // 15 were never offered to a crawler — with nothing in the response
        // to say anything had been left out. The page size is now the cap
        // itself and the pages are walked until one comes back short.
        for(let offset=0;offset<SITEMAP_MAX_URLS;offset+=SITEMAP_PAGE_SIZE){
          const params=new URLSearchParams({
            // The slug travels with the row now. Product ids in this catalogue
            // are hashes of the import source — `source-0018396e35eb…` — so a
            // sitemap built from them offers a crawler a thousand URLs with no
            // words in them. The slug is made from the product name and is what
            // the page canonicalises to, so it is what belongs here.
            select:'key,updated_at,value->>slug', namespace:`eq.${dataNamespace()}`, 'key':'like.product:*',
            'value->>state':'eq.active', order:'key.asc',
            limit:String(SITEMAP_PAGE_SIZE), offset:String(offset),
          });
          const res=await fetch(`${base}/rest/v1/app_kv?${params}`,{headers:{apikey:secret,authorization:`Bearer ${secret}`,accept:'application/json'},signal:AbortSignal.timeout(8000)});
          if(!res.ok) break;
          const rows=await res.json();
          for(const row of rows){
            const id=String(row?.key||'').slice('product:'.length);
            if(id) out.push({id, slug:String(row?.slug||''), updated_at:row?.updated_at||''});
          }
          // A short page is the last page. Anything else would page forever
          // against a database that keeps answering.
          if(!Array.isArray(rows)||rows.length<SITEMAP_PAGE_SIZE) break;
        }
      }catch{ /* fall through to the index below */ }
    }
    if(!out.length){
      // No database binding (a preview) — the id index is a single read and
      // still gives search engines every product URL.
      try{ for(const id of await productIdsFromStore(dataStore())) out.push({id,slug:'',updated_at:''}); }catch{}
    }
    /*
     * Any URL still missing its slug gets one from the index.
     *
     * The query above asks for the slug and usually returns it, but the
     * fallback path cannot — it reads the id index and nothing else — and a
     * deployment whose database does not answer the JSON selector returns the
     * column empty. Publishing a hash URL while the page canonicalises to the
     * slug asks a crawler to fetch one address and index another, so the gap is
     * closed here: one read of a map that already exists, rather than a
     * thousand product records for one field each.
     */
    if(out.some(row=>!row.slug)){
      try{
        const slugById=new Map(Object.entries(await getJSON(dataStore(),SLUG_INDEX)||{}).map(([slug,id])=>[id,slug]));
        for(const row of out) if(!row.slug) row.slug=slugById.get(row.id)||'';
      }catch{}
    }
    /*
     * The shelves, alongside the products.
     *
     * A brand page and a category page are the two kinds of landing page a
     * shopper searching "ปั๊มน้ำ Mitsubishi" is actually looking for, and
     * neither was in the sitemap — the crawler could only reach them by
     * following links from the home page, which is how a page with 63 products
     * on it ends up unindexed. Cheap: both lists are already cached reads.
     */
    const shelves=[];
    try{
      for(const brand of (await loadAllBrands(dataStore())).filter(row=>row?.name&&row.active!==false))
        shelves.push({type:'brand',value:String(brand.name)});
    }catch{}
    try{
      for(const category of (await loadAllCategories(dataStore())).filter(row=>row?.name&&row.active!==false))
        shelves.push({type:'category',value:String(category.name)});
    }catch{}
    // `truncated` is the honest signal a caller needs to decide whether one
    // sitemap file is enough or a sitemap index is required.
    return json({
      ok:true,products:out,total:out.length,shelves,
      page_size:SITEMAP_PAGE_SIZE,
      max_urls_per_file:SITEMAP_URLS_PER_FILE,
      truncated:out.length>=SITEMAP_MAX_URLS,
    },200,{'cache-control':'public, max-age=1800, stale-while-revalidate=86400'});
  }
  if(action==='chat.availability'){
    const cfg=await tskTelegramConfig().catch(()=>({token:'',chatId:''}));
    return json({ok:true, telegram: Boolean(cfg.token&&cfg.chatId)},200,{'cache-control':'public, max-age=60'});
  }
  if(action==='categories.list'){
    const list=await cachedPublicRead('categories.list', async () =>
      (await loadAllCategories(dataStore())).filter(c=>c.active!==false));
    // Additive: `product_count` is a new field beside the existing ones, and
    // is left off entirely when the count could not be established, so a
    // caller that reads it can tell "none" from "unknown".
    const counts=await categoryProductCounts(dataStore());
    const countOf=(row)=>{
      if(!counts)return undefined;
      for(const candidate of [row.name,row.key,row.id,row.slug]) if(candidate&&counts[candidate]!=null) return counts[candidate];
      return 0;
    };
    // A thumbnail still stored inline is served from its own address rather
    // than carried here. Eleven of them were 1.4 MB of base64 in a response the
    // home page fetches on every visit, for tiles drawn at 220px.
    return json({ok:true, categories:list.map(row=>{
      const shaped=/^data:image\//i.test(String(row.image_url||''))
        ? {...row,image_url:`/api?action=category-image&key=${encodeURIComponent(row.key||'')}&v=${encodeURIComponent(row.updated_at||'1')}`}
        : {...row};
      const n=countOf(row);
      if(n!=null)shaped.product_count=n;
      return shaped;
    })},200,PUBLIC_READ_CACHE);
  }
  /** The bytes behind that address. Cached for a day, like the banners'. */
  if(action==='category-image'){
    const key=clean(url.searchParams.get('key'),80);
    if(!key) return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
    const row=await getJSON(dataStore(),`category:${key}`);
    const match=String(row?.image_url||'').match(/^data:image\/(png|jpeg|webp|gif);base64,([a-z0-9+/=]+)$/i);
    if(!match) return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
    const body=Buffer.from(match[2],'base64');
    return new Response(body,{status:200,headers:{
      'content-type':`image/${match[1].toLowerCase()}`,
      'content-length':String(body.length),
      'cache-control':'public, max-age=86400, stale-while-revalidate=604800',
      'x-content-type-options':'nosniff'
    }});
  }
  if(action==='admin.categories.list'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    return json({ok:true, categories:await loadAllCategories(dataStore())});
  }
  if(action==='admin.categories.create' || action==='admin.categories.update'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const ds=dataStore(); const name=clean(b.name,120); if(!name) return json({ok:false,error:'invalid_input'},422);
    let key=clean(b.key,80);
    if(action==='admin.categories.create'){
      key = key || slugify(name);
      if(await getJSON(ds,`category:${key}`)) key = key+'-'+random(3).slice(0,4);
    } else {
      if(!key || !(await getJSON(ds,`category:${key}`))) return json({ok:false,error:'not_found'},404);
    }
    const current = action==='admin.categories.update' ? (await getJSON(ds,`category:${key}`)) : {};
    // The storefront has always rendered `image_url` on the category tiles and
    // fallen back to a stock banner, but nothing could ever set it: the admin
    // form had no image field and this endpoint dropped the value. Accepts an
    // uploaded data image or an https URL; anything else is rejected rather
    // than stored, so a tile can never point at an http or javascript: URL.
    // Sending an empty string clears it and restores the stock fallback.
    const rawImage = b.image_url!==undefined ? String(b.image_url||'').trim() : undefined;
    let image_url = current.image_url||'';
    if(rawImage!==undefined){
      if(!rawImage) image_url='';
      else if(/^https:\/\//i.test(rawImage)||/^data:image\/(png|jpeg|webp|gif);base64,/i.test(rawImage)) image_url=rawImage;
      else return json({ok:false,error:'invalid_image'},422);
    }
    // A tile renders at roughly 220px. The admin form downscales before upload,
    // so anything past this is a raw camera file that would sit in the record
    // and be re-sent on every categories.list.
    if(image_url.length>1500000) return json({ok:false,error:'image_too_large'},413);
    // An inline picture here rides along in every categories.list response, on
    // every page load, for a tile that renders at 220px. Off to the bucket.
    if(image_url.startsWith('data:')){
      const stored=await storeInlineImage(image_url,{owner_type:'category',owner_id:key,created_by:ss.data.username});
      if(stored.ok) image_url=stored.url;
    }
    const cat = { ...current, key, name, image_url, icon: clean(b.icon,40)||current.icon||'boxes', active: b.active!==undefined?!!b.active:(current.active!==false), updated_at:new Date().toISOString() };
    forgetPublicRead('categories.list');await ds.setJSON(`category:${key}`, cat);
    // The picture this category used to have, if it is no longer the one it has.
    await deleteOrphanedMedia([current.image_url],[image_url]);
    if(action==='admin.categories.create'){ forgetPublicRead('categories.list');await appendToIndex(ds,'category-index',key); }
    await auditLog(req,ss,action,{key,name});
    return json({ok:true, category:cat});
  }
  if(action==='admin.categories.delete'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const ds=dataStore(); const key=clean(b.key,80);
    const category=await getJSON(ds,`category:${key}`);
    if(category){
      const products=await listJSONByPrefix(ds,'product:','product-index');
      const inUse=products.some(product=>product&&(
        clean(product.category_id,80)===key ||
        clean(product.category,120)===clean(category.name,120)
      ));
      if(inUse)return json({ok:false,error:'category_in_use'},409);
    }
    await ds.delete(`category:${key}`);
    forgetPublicRead('categories.list');await removeFromIndex(ds,'category-index',key);
    // The row is gone, so its picture has nothing left pointing at it.
    await deleteOrphanedMedia([category?.image_url],[]);
    await auditLog(req,ss,'admin.categories.delete',{key});
    return json({ok:true});
  }
  if(action==='admin.categories.reorder'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const order=Array.isArray(b.order)?b.order.map(k=>clean(k,80)):null; if(!order) return json({ok:false,error:'invalid_input'},422);
    await dataStore().setJSON('category-index', order);
    return json({ok:true});
  }


  // ================= Brand Master / Auto Mapping =================
  function normalizeBrandToken(v){ return clean(v,160).toLowerCase().replace(/[™®]/g,'').replace(/\bofficial\b|\bstore\b|\bshop\b|\bthailand\b/gi,' ').replace(/[^a-z0-9\u0E00-\u0E7F]+/g,' ').replace(/\s+/g,' ').trim(); }
  // Every brand used to be fetched with its own round trip, so the storefront
  // paid one sequential Supabase call per brand — about two seconds — on each
  // render of the home page and the catalog, which is what pushed SSR into a
  // timeout. A single prefix query returns the same rows; the brand index is
  // still read so the order admins arranged is preserved.
  async function loadAllBrands(ds){
    const [idx,rows]=await Promise.all([
      Promise.resolve(getJSON(ds,'brand-index')).then(v=>Array.isArray(v)?v:[]).catch(()=>[]),
      listJSONByPrefix(ds,'brand:','brand-index'),
    ]);
    const order=new Map(idx.map((id,position)=>[String(id),position]));
    const rank=bd=>order.has(String(bd.id))?order.get(String(bd.id)):Number.MAX_SAFE_INTEGER;
    return rows.filter(bd=>bd&&bd.id).sort((a,z)=>rank(a)-rank(z));
  }
  async function resolveBrand(ds,input,preferredId=''){
    const brands=await loadAllBrands(ds);
    if(preferredId){const hit=brands.find(x=>x.id===preferredId);if(hit)return hit;}
    const token=normalizeBrandToken(input);if(!token)return null;
    const namesOf=bd=>[bd.name,...(Array.isArray(bd.aliases)?bd.aliases:[])].map(normalizeBrandToken);
    for(const bd of brands){if(namesOf(bd).includes(token))return bd;}
    // Then the same comparison with the spaces taken out, so a hand-typed or
    // bookmarked `?brand=superpump` reaches Super Pump. Tried only after every
    // exact match has failed, so it can never take a link away from the brand
    // that spells its name that way.
    const flat=token.replace(/ /g,'');
    for(const bd of brands){if(namesOf(bd).some(n=>n.replace(/ /g,'')===flat))return bd;}
    const m=brands.filter(bd=>{const n=normalizeBrandToken(bd.name);return n&&(` ${token} `).includes(` ${n} `);});
    return m.length===1?m[0]:null;
  }


  // ================= Brands =================
  if(action==='brands.list'){
    const list=await cachedPublicRead('brands.list', async () =>
      (await loadAllBrands(dataStore())).filter(bd=>bd.active!==false));
    return json({ok:true, brands:list},200,PUBLIC_READ_CACHE);
  }
  if(action==='admin.brands.list'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    return json({ok:true, brands:await loadAllBrands(dataStore())});
  }
  if(action==='admin.brands.create' || action==='admin.brands.update'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const ds=dataStore(); const name=clean(b.name,120); if(!name) return json({ok:false,error:'invalid_input'},422);
    let id=clean(b.id,80);
    if(action==='admin.brands.create'){ id=crypto.randomUUID(); }
    else if(!id || !(await getJSON(ds,`brand:${id}`))) return json({ok:false,error:'not_found'},404);
    const current = action==='admin.brands.update' ? (await getJSON(ds,`brand:${id}`)) : {};
    const aliasesRaw=Array.isArray(b.aliases)?b.aliases:String(b.aliases||'').split(/[\n,]/); const aliases=[...new Set(aliasesRaw.map(x=>clean(x,120)).filter(Boolean).filter(x=>normalizeBrandToken(x)!==normalizeBrandToken(name)))].slice(0,50); const bd={...current,id,name,aliases,logo_data_url:clean(b.logo_data_url,2200000)||current.logo_data_url||'',active:b.active!==undefined?!!b.active:(current.active!==false),updated_at:new Date().toISOString()};
    forgetPublicRead('brands.list');await ds.setJSON(`brand:${id}`, bd);
    // Brand Master is the source of truth. Persist the edit immediately; product rows keep their brand_id and resolve the current master without a long synchronous fan-out.
    if(action==='admin.brands.create'){ forgetPublicRead('brands.list');await appendToIndex(ds,'brand-index',id); }
    await auditLog(req,ss,action,{id,name});
    return json({ok:true, brand:bd});
  }
  if(action==='admin.brands.delete'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const ds=dataStore(); const id=clean(b.id,80); const pidx=await productIdsFromStore(ds);let used=0;for(const pid of pidx){const p=await getJSON(ds,`product:${pid}`);if(p?.brand_id===id)used++;}if(used)return json({ok:false,error:'brand_in_use',used_by_products:used},409);
    await ds.delete(`brand:${id}`);
    forgetPublicRead('brands.list');await removeFromIndex(ds,'brand-index',id);
    await auditLog(req,ss,'admin.brands.delete',{id});
    return json({ok:true});
  }
  if(action==='admin.brands.reorder'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const order=Array.isArray(b.order)?b.order.map(x=>clean(x,80)):null; if(!order) return json({ok:false,error:'invalid_input'},422);
    await dataStore().setJSON('brand-index', order);
    return json({ok:true});
  }


  if(action==='admin.brands.migrate_products'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401); if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const ds=dataStore();const idx=await productIdsFromStore(ds);let linked=0,unmatched=0,already=0;
    for(const pid of idx){const p=await getJSON(ds,`product:${pid}`);if(!p)continue;if(p.brand_id&&await getJSON(ds,`brand:${p.brand_id}`)){already++;continue;}const bd=await resolveBrand(ds,p.brand||p.name||'');if(bd){p.brand_id=bd.id;p.brand=bd.name;p.brand_logo=bd.logo_data_url||'';p.updated_at=new Date().toISOString();await ds.setJSON(`product:${pid}`,p);linked++;}else unmatched++;}
    await auditLog(req,ss,'admin.brands.migrate_products',{linked,unmatched,already});return json({ok:true,linked,unmatched,already,total:idx.length});
  }




  // ================= Marketplace Import Center =================
  function inferCategoryFromText(text,categories){
    const t=clean(text,600).toLowerCase();
    const rules=[
      [/สว่านโรตารี่|rotary hammer|hammer drill/i,['สว่านโรตารี่','สว่าน']],
      [/สว่าน|drill|driver/i,['สว่าน']],
      [/เจียร|grinder/i,['เครื่องเจียร','เจียร']],
      [/เลื่อย|saw|chainsaw/i,['เลื่อย']],
      [/แบต|battery|charger|แท่นชาร์จ/i,['แบตเตอรี่','แบตเตอรี่และแท่นชาร์จ']],
      [/ตัดหญ้า|brush cutter|grass trimmer/i,['เครื่องตัดหญ้า','ตัดหญ้า']],
      [/ปั๊มน้ำ|water pump/i,['ปั๊มน้ำ']],
      [/เครื่องฉีดน้ำ|pressure washer/i,['เครื่องฉีดน้ำ']],
      [/ดูดฝุ่น|vacuum/i,['เครื่องดูดฝุ่น']]
    ];
    for(const [rx,names] of rules){ if(rx.test(t)){ const hit=categories.find(c=>names.some(n=>clean(c.name,120).toLowerCase().includes(n.toLowerCase()))); if(hit)return hit; } }
    return null;
  }
  async function marketplaceNormalizeItem(ds,item,source){
    const categories=[]; const cidx=await getJSON(ds,'category-index')||[];
    for(const id of cidx){ const c=await getJSON(ds,`category:${id}`); if(c)categories.push(c); }
    const rawName=clean(item.name||item.item_name||item.title,300);
    const rawBrand=clean(item.brand||item.brand_name,120);
    const brand=await resolveBrand(ds,rawBrand||rawName);
    const cat=inferCategoryFromText(`${rawName} ${item.category_name||''}`,categories);
    const sku=clean(item.sku||item.model_sku||item.item_sku||item.model,120);
    const images=(Array.isArray(item.images)?item.images:(Array.isArray(item.image_urls)?item.image_urls:[])).map(x=>clean(typeof x==='string'?x:x?.url,1200)).filter(Boolean).slice(0,12);
    return {
      source,source_id:clean(item.source_id||item.item_id||item.id,120),name:rawName,sku,
      brand_id:brand?.id||'',brand:brand?.name||rawBrand,brand_logo:brand?.logo_data_url||'',
      category:cat?.name||clean(item.category_name,160),category_id:cat?.id||'',
      price:Math.max(0,Number(item.price||item.sale_price||0)),stock:Math.max(0,Math.floor(Number(item.stock||item.quantity||0))),
      description:clean(item.description,12000),images,
      mapping_status:(brand&&cat)?'ready':'review',
      mapping_notes:[!brand?'brand':'',!cat?'category':''].filter(Boolean)
    };
  }
  if(action==='admin.marketplace.import.preview'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);
    const source=['shopee','lazada'].includes(clean(b.source,20).toLowerCase())?clean(b.source,20).toLowerCase():'marketplace';
    const items=Array.isArray(b.items)?b.items.slice(0,500):[];
    const ds=dataStore();const out=[];for(const item of items){const x=await marketplaceNormalizeItem(ds,item,source);if(x.name)out.push(x);}
    return json({ok:true,items:out,ready:out.filter(x=>x.mapping_status==='ready').length,review:out.filter(x=>x.mapping_status==='review').length});
  }
  if(action==='admin.marketplace.import.commit'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);
    const source=['shopee','lazada'].includes(clean(b.source,20).toLowerCase())?clean(b.source,20).toLowerCase():'marketplace';
    const items=Array.isArray(b.items)?b.items.slice(0,500):[];const ds=dataStore();let created=0,updated=0,skipped=0;
    const idx=await productIdsFromStore(ds);
    for(const raw of items){
      const x=await marketplaceNormalizeItem(ds,raw,source);if(!x.name){skipped++;continue;}
      let existing=null;
      for(const pid of idx){const p=await getJSON(ds,`product:${pid}`);if(!p)continue;if((x.source_id&&p.marketplace_source===source&&p.marketplace_source_id===x.source_id)||(x.sku&&p.sku===x.sku)){existing=p;break;}}
      const fields=await normalizeProductInput({...x,active:b.publish===true},existing,ds);if(!fields){skipped++;continue;}
      if(existing){const p={...existing,...fields,marketplace_source:source,marketplace_source_id:x.source_id,mapping_status:x.mapping_status,updated_at:new Date().toISOString()};await ds.setJSON(`product:${p.id}`,p);updated++;}
      else{const id=crypto.randomUUID();const p={id,...fields,marketplace_source:source,marketplace_source_id:x.source_id,mapping_status:x.mapping_status,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};await ds.setJSON(`product:${id}`,p);idx.push(id);created++;}
    }
    await mutateIndexAtomically(ds,'product-index',(current)=>[...new Set([...current,...idx])]);
    await auditLog(req,ss,'admin.marketplace.import.commit',{source,created,updated,skipped});
    return json({ok:true,created,updated,skipped});
  }


  // ================= Products =================
  function productPublicView(p){
    if(!p) return null;
    const normalized=normalizeProductInventory(p);
    const { cost_price, inventory, ...pub } = normalized; // never leak cost price or warehouse internals
    pub.variants=(normalized.variants||[]).map(publicVariant);
    pub.stock=publicAvailable(stockAvailable(normalized));pub.reserved=undefined;
    return pub;
  }
  function productCardView(p){
    const pub=productPublicView(p);
    return {
      id:pub.id,name:pub.name,slug:pub.slug||'',category:pub.category||'',brand_id:pub.brand_id||'',brand:pub.brand||'',
      sku:pub.sku||'',price:Number(pub.price||0),oldPrice:pub.oldPrice??null,stock:pub.stock,status:Array.isArray(pub.status)?pub.status:[],
      home_featured:pub.home_featured===true,home_featured_order:pub.home_featured_order??null,img:pub.img||'',
      // The smaller copies of the cover, when the import made any. A card is
      // 240px wide and the supplier's photograph is 1,600 — without these the
      // browser has nothing to choose from and downloads the full one, sixty
      // times over on a listing page. Left off the object entirely (rather than
      // sent as an empty array) for a product that has none, so a catalogue
      // imported before this change costs exactly what it did before.
      img_variants:Array.isArray(pub.img_variants)&&pub.img_variants.length?pub.img_variants:undefined,
      updated_at:pub.updated_at||''
    };
  }
  if(action==='products.list'){
    // The catalogue is public, and it is also the most valuable thing here to
    // take: paging this endpoint is how a competitor copies five thousand
    // products, prices included, in a couple of minutes. The ceiling is set
    // well above what a person browsing can reach — sixty products a page, ten
    // requests a minute sustained for an hour — so it is invisible to a
    // shopper and expensive for a script. It cannot stop a determined scraper
    // spread across addresses; it does stop the cheap version, which is the
    // one that actually happens.
    // A shopper's browser, or a search engine we want. Anything that says it
    // is a scripting library is turned away before the catalogue is read.
    if(looksLikeATool(req)) return refusedAsATool();
    const rl=await rateLimit(req,'products-list',600,60*60); if(!rl.ok) return tooMany(rl);
    // And a budget in rows, because eleven requests of a hundred is the whole
    // catalogue and eleven requests is nothing to a per-request cap.
    {
      const asked=Math.min(100,Math.max(1,Number(url.searchParams.get('per_page')||60)));
      const rows=await catalogueRowBudget(req,asked);
      if(!rows.ok) return tooMany(rows);
    }
    const ds=dataStore();
    /*
     * The home shelf: the products the merchant flagged, in the order they
     * chose, and nothing else.
     *
     * Answered from the index before any of the three search paths below are
     * considered — there is nothing to search, and a flagged shelf is a dozen
     * reads rather than a catalogue scan. An empty list is a real answer: it
     * means nothing is flagged yet, and the caller decides what to show
     * instead.
     */
    if(url.searchParams.get('featured')==='1'){
      // Its own limit rather than the one further down: this branch runs before
      // that is declared, and reaching forward for it is a reference error at
      // the moment a shopper opens the home page.
      const featuredPerPage=Math.min(60, Math.max(1, Number(url.searchParams.get('per_page')||12)));
      /*
       * Cached in the worker, like every other public read on this page.
       *
       * The shelf is the index plus one read per flagged product — fifteen
       * round trips to Supabase for a shop with fourteen products on its home
       * page, paid again on every visit that misses the edge. Measured against
       * the live site: 1.53s cold, 0.79s warm, every single time, while
       * content.list beside it answers in 0.10s because it goes through this
       * same helper.
       *
       * Which products a merchant has flagged changes when they press a button
       * in the console, and that button already drops this entry — see
       * forgetPublicRead below `admin.products.featured` — so the shelf is
       * never stale for the person arranging it.
       */
      const rows=await cachedPublicRead('products.featured', async () => {
        const ids=await getJSON(ds,FEATURED_INDEX)||[];
        const found=[];
        for(const fid of ids.slice(0,60)){
          const product=await getJSON(ds,`product:${fid}`);
          if(product && product.home_featured===true && product.state!=='hidden' && product.state!=='discontinued') found.push(product);
        }
        return found;
      }, FEATURED_SHELF_TTL_MS);
      rows.sort((a,b)=>(Number(a.home_featured_order)||999)-(Number(b.home_featured_order)||999));
      return json({ok:true,products:rows.slice(0,featuredPerPage).map(productCardView),total:rows.length,page:1,per_page:featuredPerPage,source:'featured'},200,{'cache-control':'public, max-age=60, stale-while-revalidate=600'});
    }
    const requestedCategory=url.searchParams.get('category')||'';
    const managedCategory=await resolveManagedCategory(ds,requestedCategory);
    const category=managedCategory?.name||requestedCategory;
    const brand=url.searchParams.get('brand')||'';
    const q=(url.searchParams.get('q')||'').trim().toLowerCase();
    const status=clean(url.searchParams.get('status'),40),sort=clean(url.searchParams.get('sort'),30)||'default';
    const minPriceRaw=url.searchParams.get('min_price'),maxPriceRaw=url.searchParams.get('max_price');
    const minPrice=minPriceRaw===null||minPriceRaw===''?null:Math.max(0,Number(minPriceRaw));
    const maxPrice=maxPriceRaw===null||maxPriceRaw===''?null:Math.max(0,Number(maxPriceRaw));
    const includeFacets=url.searchParams.get('facets')==='1';
    const page=Math.max(1, Number(url.searchParams.get('page')||1)); const perPage=Math.min(100, Math.max(1, Number(url.searchParams.get('per_page')||60)));
    // A Thai query cannot be answered by a literal comparison, so the database
    // search is not even attempted — running it would cost a round trip whose
    // result is discarded.
    /*
     * Every spelling of the brand that was asked for.
     *
     * A brand record has carried an `aliases` list since the brand manager
     * was built, and the admin has a box for it — but nothing downstream ever
     * read it, so an alias resolved to a brand and then matched no products.
     * Mitsubishi sells its pumps here under the name Super Pump: both are in
     * the brand list, one holds all 63 products and the other holds none, and
     * the Super Pump link led to an empty page.
     *
     * Imported products carry the brand as a name string with no id, so the
     * id alone cannot find them. Resolving first and matching every name the
     * brand answers to is what makes both links reach the same shelf.
     */
    const brandRow=brand?await resolveBrand(ds,brand,brand):null;
    const brandNames=brandRow
      ? [...new Set([brandRow.name,...(Array.isArray(brandRow.aliases)?brandRow.aliases:[])].map(x=>clean(x,120)).filter(Boolean))]
      : (brand?[brand]:[]);
    const supabaseFast=(!status&&!Number.isFinite(minPrice)&&!Number.isFinite(maxPrice)&&sort==='default'&&!hasThai(q))
      ? await queryProductsSupabase({category,brandNames,q,page,perPage,admin:false}) : null;
    // The database search is a literal `ilike`, which is right for "dewalt" and
    // useless for Thai: "ปั้ม" and "ปั๊ม" differ by one tone mark and it matches
    // neither against the other. When a search finds nothing, fall through to
    // the tolerant in-memory match rather than telling a customer the shop does
    // not stock what it is standing on. Searches that already found something
    // keep the fast path.
    /*
     * An empty brand shelf is not an answer either.
     *
     * The same rule the search paths already follow, extended to brands. A
     * brand link that resolves to a real brand and then returns nothing is a
     * dead page on a shop that does stock the thing — measured on the live
     * site, "Super Pump" returned 0 while the 63 pumps it names sat under
     * Mitsubishi. Falling through costs one slow request on a brand that
     * genuinely has no products, and saves the ones that do.
     */
    const brandFoundNothing=Boolean(brand)&&Boolean(supabaseFast)&&supabaseFast.total===0;
    if(supabaseFast && !brandFoundNothing && (!q || (!hasThai(q) && supabaseFast.total>0)))
      return json({ok:true,products:supabaseFast.products.map(productCardView),total:supabaseFast.total,page,per_page:perPage,source:'supabase'},200,{'cache-control':'public, max-age=30, stale-while-revalidate=300'});
    const productIndex=await productIdsFromStore(ds);
    const rb=brandRow;
    const fast=await queryProductsPostgres({category,brandId:rb?.id||'',brandName:rb?'':brand,q,status,minPrice,maxPrice,sort,page,perPage,admin:false,facets:includeFacets,expectedTotal:productIndex.length});
    // Same rule as above: an empty result for a real search is not an answer.
    if(fast && !(brand&&fast.total===0) && (!q || (!hasThai(q) && fast.total>0))) return json({ok:true,products:fast.products.map(productCardView),total:fast.total,page,per_page:perPage,facets:fast.facets||undefined,source:'postgres'},200,{'cache-control':'public, max-age=30, stale-while-revalidate=120'});
    let list=(await listJSONByPrefix(ds,'product:','product-index')).filter(p=>p && p.state!=='hidden' && p.state!=='discontinued');
    if(category) list=list.filter(p=>p.category===category);
    if(brand){
      const wanted=new Set(brandNames.map(normalizeBrandToken).filter(Boolean));
      const byBrandField=list.filter(p=>(rb&&p.brand_id===rb.id)||wanted.has(normalizeBrandToken(p.brand)));
      /*
       * Last resort: the brand as it appears in the product's own name.
       *
       * Imported rows carry the brand as whatever string the source used, and
       * the source is often the marketplace listing title — which is why this
       * catalogue holds products whose `brand` reads "ส่งฟรี!!". The name is
       * the one field that reliably says what the thing is, so a brand that
       * matches nothing on the brand field is looked for there before the page
       * gives up.
       *
       * Two conditions, and both are the guard rail. The brand field has to
       * have found nothing at all — a brand that matched even one product is
       * answered exactly — and the brand has to be a real record, not just a
       * string somebody put in the query. Without the second, `?brand=Pump`
       * would collect every pump in the shop under a brand that does not
       * exist.
       */
      list=(byBrandField.length||!rb)?byBrandField:list.filter(p=>{
        const haystack=' '+normalizeBrandToken(p.name)+' ';
        for(const name of wanted) if(name && haystack.includes(' '+name+' ')) return true;
        return false;
      });
    }
    // The last of the three search paths, and the one every Supabase-backed
    // request lands on. It has to end up where the other two do: an exact match
    // is answered exactly, and only a search that found nothing is retried by
    // similarity — otherwise the same word finds different products depending
    // on which backend answered.
    if(q){ const exact=list.filter(p=>matchesSearch(p,q)); list=exact.length?exact:fuzzySearch(list,q); }
    if(status)list=list.filter(p=>(p.status||[]).includes(status)||(status==='สินค้าลดราคา'&&Number(p.oldPrice||0)>Number(p.price||0)&&Number(p.price||0)>0));
    if(Number.isFinite(minPrice))list=list.filter(p=>Number(p.price||0)>=minPrice);
    if(Number.isFinite(maxPrice))list=list.filter(p=>Number(p.price||0)<=maxPrice);
    if(sort==='price-asc')list.sort((a,z)=>Number(a.price||0)-Number(z.price||0));
    else if(sort==='price-desc')list.sort((a,z)=>Number(z.price||0)-Number(a.price||0));
    else if(sort==='name-asc')list.sort((a,z)=>String(a.name||'').localeCompare(String(z.name||''),'th'));
    /*
     * Sold out goes to the back, whatever the shopper sorted by.
     *
     * A product with nothing to sell is not a result — it is a dead end with a
     * picture on it, and the catalogue was opening with screens of them after a
     * supplier list came in with 785 zero-stock rows. Cheapest-first made it
     * worst: the things nobody can buy are usually the things that ran out.
     *
     * Applied after the sort rather than inside it so the shopper's choice
     * still decides the order within each group — Array#sort is stable, so
     * cheapest-first stays cheapest-first among what is actually in stock.
     * The out-of-stock products are still listed, still findable, still
     * indexed; they are last, which is the only claim being made here.
     */
    const soldOut=new Map(list.map((row)=>[row,stockAvailable(row)>0?0:1]));
    list.sort((a,z)=>soldOut.get(a)-soldOut.get(z));
    const total=list.length; const start=(page-1)*perPage;
    const paged=list.slice(start,start+perPage).map(productCardView);
    let productFacets;
    if(includeFacets){
      // ไม่กรองอะไรเลย = list ชุดนี้คือทั้งร้านอยู่แล้ว นับจากของที่มีได้เลย
      // ไม่ต้องสแกนแค็ตตาล็อกซ้ำอีกรอบ (ประหยัด subrequests ครึ่งหนึ่งของ worst case)
      const unfiltered=!category&&!brand&&!q&&!status&&!Number.isFinite(minPrice)&&!Number.isFinite(maxPrice);
      const all=unfiltered?list:(await listJSONByPrefix(ds,'product:','product-index')).filter(p=>p&&p.state!=='hidden'&&p.state!=='discontinued');
      productFacets={categories:{},brands:{}};for(const p of all){productFacets.categories[p.category||'']=(productFacets.categories[p.category||'']||0)+1;productFacets.brands[p.brand||'']=(productFacets.brands[p.brand||'']||0)+1;}
    }
    return json({ok:true, products:paged, total, page, per_page:perPage,facets:productFacets,source:'blobs'},200,{'cache-control':'public, max-age=15, stale-while-revalidate=60'});
  }
  if(action==='products.get'){
    // This had no limit at all: walking the catalogue one product at a time
    // was the cheapest way to copy it and the only path that was unmetered.
    if(looksLikeATool(req)) return refusedAsATool();
    {
      const rows=await catalogueRowBudget(req,1);
      if(!rows.ok) return tooMany(rows);
    }
    const id=url.searchParams.get('id')||''; const slug=url.searchParams.get('slug')||'';
    const ds=dataStore(); let p=null;
    if(id) p=await getJSON(ds,`product:${id}`);
    /*
     * One read, then the database, then — only as a last resort — the scan.
     *
     * The index is written whenever a product is saved and is the path every
     * request should take. The two below it are what answers a product saved
     * before the index existed, and the scan reads the whole catalogue: fine
     * once, ruinous as the normal path. See SLUG_INDEX.
     */
    if(!p && slug){
      const mapped=(await getJSON(ds,SLUG_INDEX)||{})[slug];
      if(mapped){
        const candidate=await getJSON(ds,`product:${mapped}`);
        // A rename can leave a mapping behind. Trust the product, not the map.
        if(candidate?.slug===slug) p=candidate;
      }
    }
    if(!p && slug && postgresEnabled()){ try{const result=await database().pool.query(`SELECT value FROM app_kv WHERE namespace=$1 AND key LIKE 'product:%' AND value->>'slug'=$2 LIMIT 1`,[dataNamespace(),slug]);p=result.rows[0]?.value||null;}catch{} }
    if(!p && slug){ for(const cand of await listJSONByPrefix(ds,'product:','product-index')){ if(cand?.slug===slug){ p=cand; break; } } }
    // Whatever path found it, the index knows next time.
    if(p&&p.slug&&p.slug===slug){ try{ await syncSlugIndex(ds,String(p.id),p.slug); }catch{} }
    /*
     * The address the product used to have.
     *
     * Renaming a product moves its page, and a link to the old address — a
     * search result, a bookmark, a message sent to a customer — would otherwise
     * be a 404. Answering with where it went lets the page redirect
     * permanently, which carries the ranking across instead of discarding it.
     * Checked only after every live path has failed, so a slug in use always
     * wins over one that used to be.
     */
    if(!p && slug){
      const moved=(await getJSON(ds,SLUG_HISTORY)||{})[slug];
      const target=moved?await getJSON(ds,`product:${moved}`):null;
      if(target&&target.state!=='hidden'&&target.state!=='discontinued'&&target.slug&&target.slug!==slug)
        return json({ok:false,error:'moved',moved_to:String(target.slug),id:String(target.id||'')},404,{'cache-control':'public, max-age=300'});
    }
    if(!p||p.state==='hidden'||p.state==='discontinued') return json({ok:false,error:'not_found'},404);
    return json({ok:true, product:productPublicView(p)},200,{'cache-control':'public, max-age=30, stale-while-revalidate=120'});
  }
  if(action==='products.recommend'){
    const rl=await rateLimit(req,'product-recommend',120,60*60);if(!rl.ok)return tooMany(rl);
    const ds=dataStore(),id=clean(b.id||url.searchParams.get('id'),80),limit=Math.min(20,Math.max(1,Number(b.limit||url.searchParams.get('limit')||8))),source=await getJSON(ds,`product:${id}`);
    if(!source)return json({ok:false,error:'not_found'},404);
    const popularity=new Map(),coPurchase=new Map();
    for(const orderId of (await getJSON(ds,'order-index')||[]).slice(-1000)){
      const order=await getJSON(ds,`order:${orderId}`);if(!order||!['paid','processing','packing','shipped','completed'].includes(order.status))continue;
      const ids=[...new Set((order.items||[]).map(item=>item.id||item.product_id).filter(Boolean))];for(const productId of ids)popularity.set(productId,Number(popularity.get(productId)||0)+1);if(ids.includes(id))for(const productId of ids)if(productId!==id)coPurchase.set(productId,Number(coPurchase.get(productId)||0)+1);
    }
    let candidates=[];
    if(postgresEnabled()){
      try{const result=await database().pool.query(`SELECT value FROM app_kv WHERE namespace=$1 AND key LIKE 'product:%' AND key<>$2 AND COALESCE(value->>'state','active')='active' AND (value->>'category'=$3 OR ($4<>'' AND LOWER(COALESCE(value->>'brand',''))=$4)) ORDER BY updated_at DESC LIMIT 100`,[dataNamespace(),`product:${id}`,source.category||'',String(source.brand||'').toLowerCase()]);candidates=result.rows.map(row=>row.value).filter(Boolean);}catch{}
    }
    if(!candidates.length){for(const candidate of await listJSONByPrefix(ds,'product:','product-index')){if(candidate?.id===id)continue;if(candidate?.state==='active')candidates.push(candidate);if(candidates.length>=100)break;}}
    const sourceTerms=new Set(Object.entries(source.specs||{}).flatMap(([key,value])=>`${key} ${value}`.toLowerCase().split(/[^a-z0-9ก-๙]+/)).filter(term=>term.length>2)),ranked=[];
    for(const candidate of candidates){if(stockAvailable(candidate)<=0)continue;let score=0;const reasons=[];if(candidate.category&&candidate.category===source.category){score+=30;reasons.push('หมวดเดียวกัน');}if((candidate.brand_id&&candidate.brand_id===source.brand_id)||(!candidate.brand_id&&candidate.brand&&candidate.brand===source.brand)){score+=18;reasons.push('แบรนด์เดียวกัน');}const candidateTerms=new Set(Object.entries(candidate.specs||{}).flatMap(([key,value])=>`${key} ${value}`.toLowerCase().split(/[^a-z0-9ก-๙]+/)).filter(term=>term.length>2)),overlap=[...sourceTerms].filter(term=>candidateTerms.has(term)).length;if(overlap){score+=Math.min(20,overlap*4);reasons.push('สเปกใกล้เคียง');}const together=Number(coPurchase.get(candidate.id)||0),popular=Number(popularity.get(candidate.id)||0);if(together){score+=Math.min(40,together*8);reasons.unshift('ลูกค้ามักซื้อด้วยกัน');}score+=Math.min(15,Math.log2(popular+1)*3);if(candidate.price&&source.price)score+=(Math.min(candidate.price,source.price)/Math.max(candidate.price,source.price))*5;ranked.push({score,reason:reasons[0]||'สินค้ายอดนิยม',product:candidate});}
    ranked.sort((a,z)=>z.score-a.score||String(a.product.name||'').localeCompare(String(z.product.name||''),'th'));
    return json({ok:true,engine:'hybrid_content_collaborative_v2',recommendations:ranked.slice(0,limit).map(row=>({score:Number(row.score.toFixed(2)),reason:row.reason,product:productCardView(row.product)}))},200,{'cache-control':'public, max-age=120, stale-while-revalidate=600'});
  }
  if(action==='products.recommend.legacy'){
    const rl=await rateLimit(req,'product-recommend',120,60*60);if(!rl.ok)return tooMany(rl);const ds=dataStore(),id=clean(b.id||url.searchParams.get('id'),80),limit=Math.min(20,Math.max(1,Number(b.limit||url.searchParams.get('limit')||8))),source=await getJSON(ds,`product:${id}`);if(!source)return json({ok:false,error:'not_found'},404);const productIds=await getJSON(ds,'product-index')||[],popularity=new Map(),coPurchase=new Map();for(const orderId of (await getJSON(ds,'order-index')||[]).slice(-3000)){const order=await getJSON(ds,`order:${orderId}`);if(!order||!['paid','processing','packing','shipped','completed'].includes(order.status))continue;const ids=[...new Set((order.items||[]).map(x=>x.id||x.product_id).filter(Boolean))];for(const pid of ids)popularity.set(pid,Number(popularity.get(pid)||0)+1);if(ids.includes(id))for(const pid of ids)if(pid!==id)coPurchase.set(pid,Number(coPurchase.get(pid)||0)+1);}const sourceTerms=new Set(Object.entries(source.specs||{}).flatMap(([key,value])=>`${key} ${value}`.toLowerCase().split(/[^a-z0-9ก-๙]+/)).filter(x=>x.length>2)),ranked=[];for(const pid of productIds){if(pid===id)continue;const candidate=await getJSON(ds,`product:${pid}`);if(!candidate||candidate.state!=='active'||stockAvailable(candidate)<=0)continue;let score=0;const reasons=[];if(candidate.category&&candidate.category===source.category){score+=30;reasons.push('หมวดเดียวกัน');}if(candidate.brand_id&&candidate.brand_id===source.brand_id||candidate.brand&&candidate.brand===source.brand){score+=18;reasons.push('แบรนด์เดียวกัน');}const candidateTerms=new Set(Object.entries(candidate.specs||{}).flatMap(([key,value])=>`${key} ${value}`.toLowerCase().split(/[^a-z0-9ก-๙]+/)).filter(x=>x.length>2)),overlap=[...sourceTerms].filter(term=>candidateTerms.has(term)).length;if(overlap){score+=Math.min(20,overlap*4);reasons.push('สเปกใกล้เคียง');}const together=Number(coPurchase.get(pid)||0),popular=Number(popularity.get(pid)||0);if(together){score+=Math.min(40,together*8);reasons.unshift('ลูกค้ามักซื้อด้วยกัน');}score+=Math.min(15,Math.log2(popular+1)*3);if(candidate.price&&source.price){const ratio=Math.min(candidate.price,source.price)/Math.max(candidate.price,source.price);score+=ratio*5;}ranked.push({score,reason:reasons[0]||'สินค้ายอดนิยม',product:candidate});}ranked.sort((a,z)=>z.score-a.score||String(a.product.name||'').localeCompare(String(z.product.name||''),'th'));return json({ok:true,engine:'hybrid_content_collaborative_v1',recommendations:ranked.slice(0,limit).map(row=>({score:Number(row.score.toFixed(2)),reason:row.reason,product:productPublicView(row.product)}))});
  }
  if(action==='products.qr'){
    const id=clean(b.id||url.searchParams.get('id'),80),variantId=clean(b.variant_id||url.searchParams.get('variant_id'),80);const ds=dataStore();const p=await getJSON(ds,`product:${id}`);if(!p||p.state!=='active')return json({ok:false,error:'not_found'},404);const variant=findProductVariant(normalizeProductInventory(p),variantId);if(!variant)return json({ok:false,error:'variant_not_found'},404);const productUrl=`${url.origin}/products/${encodeURIComponent(p.id)}?variant=${encodeURIComponent(variant.id)}`;
    // Same constraint as payment.promptpay_qr: `qrcode` cannot load in the
    // Cloudflare Workers runtime, so this endpoint answered 503 rather than
    // returning a label. It hands back the encodable URL and the caller draws
    // the code — a browser has `qrcode` available, the worker does not.
    return json({ok:true,data_url:'',url:productUrl,sku:variant.sku||p.sku||'',barcode:variant.barcode||p.barcode||''});
  }
  if(action==='admin.products.list'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore();
    const page=Math.max(1, Number(url.searchParams.get('page')||1)); const perPage=Math.min(200, Math.max(1, Number(url.searchParams.get('per_page')||100)));
    const q=(url.searchParams.get('q')||'').trim().toLowerCase();
    const productIndex=await productIdsFromStore(ds);
    const fast=await queryProductsPostgres({q,page,perPage,admin:true,expectedTotal:productIndex.length});
    if(fast) return json({ok:true,products:fast.products,total:fast.total,page,per_page:perPage,source:'postgres'});
    /*
     * Ask Supabase for the page, instead of the catalogue to show a page of it.
     *
     * `queryProductsPostgres` above cannot answer: `postgresEnabled()` returns
     * false outright, so that branch has never run and every admin list fell
     * straight through to reading every product in the shop in full — all of
     * them, with descriptions, variants and image lists — then sorting and
     * slicing forty rows out of it in memory. At two thousand products that is
     * tens of megabytes off Supabase for one screen, and the products page
     * calls `refresh()` after every single action a merchant takes: every save,
     * every toggle, every search. A day of bulk work is thousands of those.
     *
     * `queryProductsSupabase` already pages at the source, already orders by
     * `updated_at` descending exactly as the fallback below does, already
     * searches name, sku and brand, and already reports the true total from the
     * content-range header. It only lacked a caller here.
     *
     * Two cases still fall through on purpose. A Thai query, because `ilike`
     * matches literal text and Thai shoppers and staff type tone marks that the
     * stored name may not carry — `matchesSearch` below normalises them and is
     * the only thing that finds "ปั้ม" in "ปั๊มน้ำ". And a search that comes
     * back empty, because an empty answer to a real search is not an answer;
     * the slower path gets to try before anyone is told there is nothing.
     */
    if(!hasThai(q)){
      const fastKv=await queryProductsSupabase({q,page,perPage,admin:true});
      if(fastKv&&(!q||fastKv.total>0))
        return json({ok:true,products:fastKv.products,total:fastKv.total,page,per_page:perPage,source:'supabase'});
    }
    let list=await listJSONByPrefix(ds,'product:','product-index');
    if(q) list=list.filter(p=>matchesSearch(p,q));
    list.sort((a,b2)=> new Date(b2.updated_at||b2.created_at||0) - new Date(a.updated_at||a.created_at||0));
    const total=list.length; const start=(page-1)*perPage;
    return json({ok:true, products:list.slice(start,start+perPage), total, page, per_page:perPage,source:String(ds.backend||'store').includes('supabase')?'supabase':'store'});
  }
  if(action==='admin.products.get'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    const id=clean(b.id||url.searchParams.get('id'),80); const p=await getJSON(dataStore(),`product:${id}`);
    if(!p) return json({ok:false,error:'not_found'},404);
    return json({ok:true, product:p});
  }
  async function normalizeProductInput(b,current,ds){
    const name=clean(b.name,300)||current?.name;if(!name)return null;const requestedBrandId=clean(b.brand_id,80)||current?.brand_id||'';const requestedBrand=clean(b.brand,120)||current?.brand||'';const resolvedBrand=await resolveBrand(ds,requestedBrand,requestedBrandId);
    const fields={
      name,
      slug: clean(b.slug,200) || current?.slug || slugify(name),
      category: clean(b.category,80) || current?.category || '',
      brand_id:resolvedBrand?.id||'',
      brand:resolvedBrand?.name||requestedBrand,
      brand_logo:resolvedBrand?.logo_data_url||current?.brand_logo||'',
      supplier_id: clean(b.supplier_id,80) || current?.supplier_id || '',
      supplier_name: clean(b.supplier_name,160) || current?.supplier_name || '',
      sku: clean(b.sku,80) || current?.sku || '',
      barcode: clean(b.barcode,120) || current?.barcode || '',
      price: b.price!==undefined ? Number(b.price)||0 : (current?.price ?? 0),
      oldPrice: b.oldPrice!==undefined ? (b.oldPrice===null||b.oldPrice===''? null : Number(b.oldPrice)) : (current?.oldPrice ?? null),
      cost_price: b.cost_price!==undefined ? Number(b.cost_price)||0 : (current?.cost_price ?? 0),
      stock: b.stock!==undefined ? Math.max(0, Number(b.stock)||0) : (current?.stock ?? 0),
      reserved: current?.reserved ?? 0,
      state: ['active','hidden','discontinued'].includes(b.state) ? b.state : (current?.state || 'active'),
      status: Array.isArray(b.status) ? b.status.slice(0,10).map(s=>clean(s,40)) : (current?.status||[]),
      home_featured: b.home_featured!==undefined ? b.home_featured===true : (current?.home_featured===true),
      home_featured_order: b.home_featured_order!==undefined ? (b.home_featured_order===null||b.home_featured_order==='' ? null : Math.max(1,Math.min(999,Number(b.home_featured_order)||999))) : (current?.home_featured_order ?? null),
      img: clean(b.img,2200000) || current?.img || '',
      images: Array.isArray(b.images) ? b.images.slice(0,12).map(u=>clean(u,2200000)) : (current?.images||[]),
      detailImages: Array.isArray(b.detailImages) ? b.detailImages.slice(0,20).map(u=>clean(u,2200000)) : (current?.detailImages||[]),
      desc: clean(b.desc,5000) || current?.desc || '',
      /*
       * A review clip, kept as the address the merchant pasted.
       *
       * Stored raw rather than as an embed URL: what a page can embed is a
       * rendering decision and the allowed hosts live in the CSP, so turning a
       * share link into an embed belongs on the page (`embedUrl`), not in the
       * record. An empty string is the normal state — most products have no
       * clip, and the tab that shows it is not rendered at all for them.
       *
       * Cleared by sending an empty string, so a merchant can take a clip down.
       * `clean(...) || current` would have made that impossible.
       */
      review_video: b.review_video!==undefined ? clean(b.review_video,600) : (current?.review_video || ''),
      specs: (b.specs && typeof b.specs==='object') ? b.specs : (current?.specs||{}),
      low_stock_threshold:b.low_stock_threshold!==undefined?Math.max(0,Math.floor(Number(b.low_stock_threshold)||0)):(current?.low_stock_threshold??5),
      /*
       * What the parcel weighs and how big the box is.
       *
       * Delivery is a flat 80 baht under a 1,500 baht threshold today
       * (shared/shipping.mjs), so nothing here changes what anybody is
       * charged yet. It is recorded now because the rule this shop will
       * eventually need cannot be applied retroactively: a courier bills the
       * greater of actual weight and volumetric weight (L×W×H÷5000 in
       * Thailand), and neither number can be recovered from an order after the
       * fact. A catalogue of three thousand items is also not something anybody
       * will go back and measure — the moment to capture it is while the rows
       * are being imported.
       *
       * Zero means "not measured", which is why it is not defaulted to
       * anything: a shipping rule can then tell the difference between a
       * weightless item and one nobody has weighed, instead of quietly
       * charging for a kilogram that was never there.
       */
      weight_kg: b.weight_kg!==undefined ? Math.max(0, Number(b.weight_kg)||0) : (current?.weight_kg ?? 0),
      length_cm: b.length_cm!==undefined ? Math.max(0, Number(b.length_cm)||0) : (current?.length_cm ?? 0),
      width_cm: b.width_cm!==undefined ? Math.max(0, Number(b.width_cm)||0) : (current?.width_cm ?? 0),
      height_cm: b.height_cm!==undefined ? Math.max(0, Number(b.height_cm)||0) : (current?.height_cm ?? 0),
      /*
       * The commercial facts a tool catalogue is expected to carry.
       *
       * `unit` is not decoration in a Thai catalogue — ท่อ is sold by the metre,
       * ข้อต่อ by the piece and สายไฟ by the roll, and a price with no unit
       * beside it is a question rather than an offer. `model` is separate from
       * `sku` on purpose: the SKU is this shop's own code, the model is the
       * manufacturer's, and a shopper searching for "DHS680Z" is searching for
       * the second one.
       *
       * `min_order_qty` matters because this shop sells to trade through its
       * agent programme. It is stored and shown; the cart does not enforce it
       * yet, which is noted where it is displayed rather than pretended about.
       */
      unit: b.unit!==undefined ? clean(b.unit,40) : (current?.unit || ''),
      model: b.model!==undefined ? clean(b.model,120) : (current?.model || ''),
      warranty: b.warranty!==undefined ? clean(b.warranty,120) : (current?.warranty || ''),
      origin: b.origin!==undefined ? clean(b.origin,80) : (current?.origin || ''),
      min_order_qty: b.min_order_qty!==undefined ? Math.max(1, Math.floor(Number(b.min_order_qty)||1)) : (current?.min_order_qty ?? 1)
    };
    if(Array.isArray(b.variants)){
      const old=new Map((current?.variants||[]).map(v=>[v.id,v]));
      fields.variants=b.variants.slice(0,200).map((variant,index)=>{
        const previous=old.get(clean(variant?.id,80));
        return {...previous,...variant,id:clean(variant?.id,80)||(index===0?'default':crypto.randomUUID()),inventory:variant?.inventory&&typeof variant.inventory==='object'?variant.inventory:(previous?.inventory||undefined)};
      });
    }else if(Array.isArray(current?.variants))fields.variants=current.variants;
    const normalized=normalizeProductInventory({...current,...fields},{clone:false});
    if(b.stock!==undefined&&!Array.isArray(b.variants)){
      const variant=findProductVariant(normalized);variant.inventory[DEFAULT_WAREHOUSE.id]=normalizeLevel(variant.inventory[DEFAULT_WAREHOUSE.id],Math.max(0,Number(b.stock)||0));variant.inventory[DEFAULT_WAREHOUSE.id].on_hand=Math.max(0,Number(b.stock)||0);syncProductAggregates(normalized);
    }
    const {id,created_at,updated_at,...safeFields}=normalized;return safeFields;
  }
  async function uniqueProductCodeError(ds,candidate,currentId=''){
    const normalized=normalizeProductInventory(candidate);const ownSku=new Set(),ownBarcode=new Set();
    for(const variant of normalized.variants||[]){const sku=variant.sku.trim().toLowerCase(),barcode=variant.barcode.trim().toLowerCase();if(sku&&ownSku.has(sku))return {error:'duplicate_sku_in_product',sku:variant.sku};if(barcode&&ownBarcode.has(barcode))return {error:'duplicate_barcode_in_product',barcode:variant.barcode};if(sku)ownSku.add(sku);if(barcode)ownBarcode.add(barcode);}
    /*
     * One prefix query, not one read per product.
     *
     * This used to walk `product-index` and fetch every product individually to
     * see whether the new SKU was already taken. That is a full catalogue read
     * on every single save — a thousand sequential round trips before the admin
     * panel's "save product" button returns, growing with every product the
     * shop adds. Importing a supplier's list made it quadratic: a 1,800-row
     * batch spent its time re-reading the same catalogue 1,800 times.
     *
     * `listJSONByPrefix` asks the store for the rows in one request, which is
     * what it is for. Same comparison, same answers.
     */
    const products=(await listJSONByPrefix(ds,'product:','product-index')).filter(Boolean);
    for(const product of products){const id=String(product.id||'');if(id===currentId)continue;for(const variant of normalizeProductInventory(product).variants||[]){if(variant.sku&&ownSku.has(variant.sku.toLowerCase()))return {error:'sku_exists',sku:variant.sku,product_id:id};if(variant.barcode&&ownBarcode.has(variant.barcode.toLowerCase()))return {error:'barcode_exists',barcode:variant.barcode,product_id:id};}}
    return null;
  }
  /*
   * ============================ spreadsheet in, spreadsheet out ============
   *
   * Three actions and one rule: an import writes only the columns the file
   * contains. See api/lib/product-csv.js for why, and for the column groups.
   *
   * `schema` is here so the console does not carry a second copy of the column
   * list. One definition, served to whoever renders it — the sample file on the
   * help screen is generated from the same table as the export.
   */
  if(action==='admin.products.export.schema'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);
    const sample={
      id:'8f0e6b1a-…',name:'MITSUBISHI ปั๊มน้ำอัตโนมัติ รุ่น EP-255R2',slug:'mitsubishi-ep-255r2',
      category:'ปั๊มน้ำ',brand:'MITSUBISHI',sku:'MIT-EP255R2',barcode:'8850001234567',
      price:4290,oldPrice:4890,cost_price:3600,stock:12,low_stock_threshold:5,state:'active',
      status:['สินค้าขายดี','ส่งฟรี'],home_featured:true,home_featured_order:3,
      img:'https://…/ep-255r2.jpg',images:['https://…/ep-255r2-2.jpg','https://…/ep-255r2-3.jpg'],
      detailImages:['https://…/ep-255r2-spec.jpg'],
      desc:'ปั๊มน้ำอัตโนมัติแรงดันคงที่ 250 วัตต์ เหมาะกับบ้าน 2 ชั้น',
      review_video:'https://www.youtube.com/watch?v=xxxxxxxxxxx',
      specs:{'กำลังไฟ':'250 W','ท่อเข้า-ออก':'1 นิ้ว','แรงดันไฟ':'220V'},
      weight_kg:8.5,length_cm:38,width_cm:24,height_cm:29,
      unit:'ตัว',model:'EP-255R2',warranty:'1 ปี',origin:'ไทย',min_order_qty:1,
      supplier_name:'บจก. ตัวอย่างการค้า',
    };
    return json({ok:true,
      groups:CSV_GROUPS,
      columns:Object.entries(CSV_COLUMNS).map(([key,spec])=>({key,label:spec.label,help:spec.help,read_only:spec.readOnly===true})),
      all_columns:CSV_ALL_COLUMNS,
      anchor_columns:CSV_ANCHOR_COLUMNS,
      sample_row:sample,
      // Rendered here rather than in the browser so the example on screen is
      // byte-for-byte the file the merchant will actually download.
      samples:Object.fromEntries([...CSV_GROUPS.map(g=>[g.key,csvGroupColumns([g.key])]),['all',CSV_ALL_COLUMNS]]
        .map(([key,columns])=>[key,{columns,csv:productsToCsv([sample],columns)}])),
      /*
       * The blank form for loading a batch of products the shop does not have
       * yet.
       *
       * No `id` column, deliberately: an id is assigned when a product is
       * created, and a column asking a merchant to invent one is a column that
       * gets filled in with something. These are the fields worth having on day
       * one; everything else is an update sheet away, which is the other half
       * of this pair.
       *
       * Two rows — one worked example, one empty — because a form with nothing
       * in it does not show what a cell should look like, and a form with only
       * an example invites editing the example instead of adding beneath it.
       */
      /*
       * The sheet somebody fills in for products the shop does not have yet.
       *
       * Two things it must not do, both learned the hard way.
       *
       * It used to carry a worked example as row two — a complete MITSUBISHI
       * pump with placeholder image addresses containing a literal "…". A
       * merchant who typed their own products underneath and imported the file
       * got that pump created as well, with an image nobody could load. The
       * example now lives in the schema (`sample_row`), which the download
       * renders on its own explanation sheet where it can be read but not
       * submitted. What is left here is the header row.
       *
       * And it carried fourteen of the columns rather than all of them, so the
       * form for new products could not carry a weight, a unit, a model or a
       * warranty — the fields most likely to be known at the moment a product
       * is first entered and least likely to be filled in later. Every writable
       * column now, in the order the groups introduce them.
       */
      blank_form:(()=>{
        const columns=CSV_ALL_COLUMNS.filter(key=>key!=='id'&&CSV_COLUMNS[key]?.readOnly!==true);
        return {columns,csv:productsToCsv([],columns)};
      })(),
    });
  }

  if(action==='admin.products.export'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore();
    const groups=Array.isArray(b.groups)?b.groups.map(x=>clean(x,40)).filter(Boolean)
      :clean(url.searchParams.get('groups'),400).split(',').map(x=>x.trim()).filter(Boolean);
    const columns=csvGroupColumns(groups);
    const stateFilter=clean(b.state||url.searchParams.get('state'),40);
    const brandFilter=clean(b.brand||url.searchParams.get('brand'),120).toLowerCase();
    const categoryFilter=clean(b.category||url.searchParams.get('category'),120).toLowerCase();
    const onlyIds=Array.isArray(b.ids)?new Set(b.ids.map(x=>clean(x,80)).filter(Boolean)):null;
    /*
     * The whole catalogue, deliberately.
     *
     * An export that stops at a page is an export that quietly loses rows, and
     * a merchant who edits a truncated file and sends it back has not lost
     * anything — the import only touches the rows the file names — but they
     * also have not fixed the thousand items they thought they were fixing.
     * A thousand products is a few hundred kilobytes of CSV.
     */
    let list=(await listJSONByPrefix(ds,'product:','product-index')).filter(Boolean);
    if(onlyIds)list=list.filter(p=>onlyIds.has(String(p.id||'')));
    if(stateFilter)list=list.filter(p=>String(p.state||'active')===stateFilter);
    if(brandFilter)list=list.filter(p=>String(p.brand||'').toLowerCase()===brandFilter);
    if(categoryFilter)list=list.filter(p=>String(p.category||'').toLowerCase()===categoryFilter);
    list.sort((a,z)=>String(a.name||'').localeCompare(String(z.name||''),'th'));
    const rows=list.map(p=>normalizeProductInventory(p));
    await auditLog(req,ss,'admin.products.export',{rows:rows.length,groups:groups.length?groups:['all']});
    if(clean(b.format||url.searchParams.get('format'),10)==='json')
      return json({ok:true,columns,total:rows.length,products:rows.map(p=>Object.fromEntries(columns.map(k=>[k,p[k]??null])))});
    const stamp=new Date().toISOString().slice(0,10);
    const name=`products-${(groups.length?groups.join('-'):'all')}-${stamp}.csv`;
    return new Response(productsToCsv(rows,columns),{status:200,headers:{
      'content-type':'text/csv; charset=utf-8',
      'content-disposition':`attachment; filename="${name}"`,
      'cache-control':'no-store',
    }});
  }

  /*
   * Preview and commit are the same read of the same file.
   *
   * `preview` reports what would change and writes nothing; `commit` does it.
   * They share `readImportRows` so the screen a merchant approves cannot
   * describe different work from the work that then runs — the failure mode of
   * every import tool that builds its preview separately.
   */
  if(action==='admin.products.import.preview'||action==='admin.products.import.commit'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);
    const committing=action==='admin.products.import.commit';
    if(committing&&!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);
    const ds=dataStore();
    const rows=parseCsv(String(b.csv||''));
    if(rows.length<2)return json({ok:false,error:'csv_needs_header_and_one_row'},422);
    const header=rows[0].map(x=>String(x||'').trim());
    const unknown=header.filter(key=>key&&!CSV_COLUMNS[key]);
    if(unknown.length)return json({ok:false,error:'unknown_columns',columns:unknown.slice(0,10)},422);
    /*
     * Two jobs, said out loud, because confusing them is expensive in both
     * directions.
     *
     * `update` matches every row to a product that already exists and changes
     * the columns the file carries. A row that matches nothing is reported and
     * skipped — never inserted, because a typo in an id would otherwise quietly
     * add a duplicate of a product the shop already sells.
     *
     * `create` is the opposite and refuses to touch anything that exists: a row
     * matching a product already in the catalogue is the error, not the work.
     * That is what stops a merchant loading last month's stock sheet and
     * getting a second copy of every item in it.
     *
     * Neither can do the other's job by accident, which is the point of making
     * it a mode rather than a fallback.
     */
    const mode=clean(b.mode,20)==='create'?'create':'update';
    if(mode==='update'&&!header.includes('id')&&!header.includes('sku'))
      return json({ok:false,error:'need_id_or_sku_column'},422);
    if(mode==='create'&&!header.includes('name'))
      return json({ok:false,error:'need_name_column'},422);
    /*
     * Writable columns only: `id` is the join key and cannot be a target, and a
     * file that carries only join keys has nothing to say.
     *
     * `keep_stock` then holds one more column back, and it is on by default.
     * Stock is the one field in this table that moves on its own — every order
     * decrements it — so a file exported on Monday and imported on Friday does
     * not carry an edit, it carries Monday's count, and writing it back undoes
     * a week of selling. Every other column only changes when a person changes
     * it. The merchant who really is doing a stock take turns it off and says
     * so; nobody re-prices forty items and silently restores last week's
     * inventory.
     *
     * Nothing here can create a product: a row that matches nothing is reported
     * and skipped, never inserted. See the matching loop below.
     */
    const keepStock=b.keep_stock!==false;
    /*
     * Only when updating. A new product has no count to protect — the number in
     * the file is its opening stock, and holding it back would load a batch of
     * products that all read zero and have to be counted in a second time.
     */
    const held=mode==='update'&&keepStock&&header.includes('stock')?['stock']:[];
    const writable=header.filter(key=>key&&!CSV_COLUMNS[key]?.readOnly&&!held.includes(key));
    if(!writable.length)return json({ok:false,error:'no_writable_columns',held_columns:held},422);

    const body=rows.slice(1,5001);
    // One pass over the catalogue rather than one lookup per row: matching nine
    // hundred rows by SKU would otherwise be nine hundred reads.
    const all=(await listJSONByPrefix(ds,'product:','product-index')).filter(Boolean);
    const byId=new Map(all.map(p=>[String(p.id||''),p]));
    const bySku=new Map();
    for(const p of all){const sku=String(p.sku||'').trim().toLowerCase();if(sku&&!bySku.has(sku))bySku.set(sku,p);}

    const plans=[],problems=[];
    const seen=new Set();
    /*
     * Creating: the whole row is the product, and a match is a refusal.
     *
     * Uniqueness is checked against the catalogue *and* against the rows above
     * this one in the same file, because a sheet that lists the same SKU twice
     * would otherwise create it twice — the second row cannot see the first one
     * in the store until the commit has already run.
     */
    if(mode==='create'){
      const takenSku=new Set(bySku.keys());
      // Seeded from the catalogue, then added to as the file is read, so a
      // name that is new to the shop but repeated inside one file is caught on
      // its second appearance.
      const takenName=new Set(all.map(p=>String(p?.name||'').trim().toLowerCase().replace(/\s+/g,'')).filter(Boolean));
      for(let index=0;index<body.length;index++){
        const line=index+2;
        const raw=Object.fromEntries(header.map((key,at)=>[key,body[index][at]??'']));
        const name=String(raw.name||'').trim();
        if(!name){problems.push({line,error:'name_required',detail:'(ชื่อสินค้าว่าง)'});continue;}
        const id=String(raw.id||'').trim();
        if(id&&byId.get(id)){problems.push({line,error:'already_exists',detail:byId.get(id).name||id});continue;}
        const sku=String(raw.sku||'').trim().toLowerCase();
        if(sku&&takenSku.has(sku)){problems.push({line,error:'duplicate_sku',detail:raw.sku});continue;}
        if(sku)takenSku.add(sku);
        /*
         * And by name, for the file that has no SKU at all.
         *
         * A supplier's list of "products you do not stock yet" is a name and a
         * price, and half of them turn out to be things the shop already
         * sells. Matching on SKU alone lets those through as second copies —
         * the same pump twice in the catalogue, at two prices, and a shopper
         * finding whichever the search happens to rank first.
         *
         * Compared with the spacing and case removed, because a name retyped
         * by a different person is never spaced the same way. This refuses the
         * row rather than merging it: two products with one name may still be
         * two products, and only the merchant knows which.
         */
        const nameKey=name.toLowerCase().replace(/\s+/g,'');
        if(nameKey&&takenName.has(nameKey)){problems.push({line,error:'duplicate_name',detail:name});continue;}
        if(nameKey)takenName.add(nameKey);

        const fields={},preview=[];
        let bad=null;
        for(const column of writable){
          if(column==='id')continue;
          const parsed=parseCell(column,raw[column]);
          if(!parsed.ok){bad={line,error:'invalid_cell',detail:parsed.error};break;}
          fields[column]=parsed.value;
          if(csvRenderCell({[column]:parsed.value},column))preview.push({column,before:'',after:csvRenderCell({[column]:parsed.value},column)});
        }
        if(bad){problems.push(bad);continue;}
        plans.push({line,name,sku:raw.sku||'',changes:preview,patch:fields});
      }

      if(!committing)
        return json({ok:true,mode:'preview',import_mode:'create',rows:body.length,matched:0,
          will_create:plans.length,will_change:plans.length,unchanged:0,
          columns:writable.filter(c=>c!=='id'),held_columns:held,
          plan:plans.slice(0,200).map(({patch,...rest})=>rest),
          truncated_plan:Math.max(0,plans.length-200),
          problems:problems.slice(0,100),problem_count:problems.length});

      let created=0;const createFailures=[];
      for(const plan of plans){
        const normalised=await normalizeProductInput(plan.patch,null,ds);
        if(!normalised){createFailures.push({line:plan.line,error:'invalid_input'});continue;}
        let id=crypto.randomUUID();
        let record={id,...normalised,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
        const codeError=await uniqueProductCodeError(ds,record);
        if(codeError){createFailures.push({line:plan.line,error:codeError.error});continue;}
        let ok=await atomicProductCreate(record);
        for(let attempt=1;attempt<5&&!ok;attempt++){id=crypto.randomUUID();record={...record,id};ok=await atomicProductCreate(record);}
        if(!ok){createFailures.push({line:plan.line,error:'product_create_conflict'});continue;}
        await mutateIndexAtomically(ds,'product-index',(idx)=>[...new Set([...idx,id])]);
        await syncSlugIndex(ds,id,record.slug);
        await syncFeaturedIndex(ds,id,record.home_featured===true);
        created++;
      }
      await auditLog(req,ss,'admin.products.import.create',{rows:body.length,created,failed:createFailures.length,columns:writable});
      return json({ok:true,mode:'commit',import_mode:'create',rows:body.length,created,updated:0,
        skipped:0,failed:createFailures.length,held_columns:held,
        problems:[...problems,...createFailures].slice(0,100)});
    }

    for(let index=0;index<body.length;index++){
      const line=index+2; // what the merchant sees in their spreadsheet
      const cells=body[index];
      const raw=Object.fromEntries(header.map((key,at)=>[key,cells[at]??'']));
      const id=String(raw.id||'').trim();
      const sku=String(raw.sku||'').trim().toLowerCase();
      const product=(id&&byId.get(id))||(sku&&bySku.get(sku))||null;
      if(!product){problems.push({line,error:'not_found',detail:id||raw.sku||'(ไม่มี id หรือ sku)'});continue;}
      const key=String(product.id);
      if(seen.has(key)){problems.push({line,error:'duplicate_row',detail:product.name||key});continue;}
      seen.add(key);
      const patch={},changes=[];
      let bad=null;
      for(const column of writable){
        const parsed=parseCell(column,raw[column]);
        if(!parsed.ok){bad={line,error:'invalid_cell',detail:parsed.error};break;}
        if(!cellChanged(product,column,parsed.value))continue;
        patch[column]=parsed.value;
        changes.push({column,before:csvRenderCell(product,column),after:csvRenderCell({[column]:parsed.value},column)});
      }
      if(bad){problems.push(bad);continue;}
      if(!changes.length)continue; // unchanged rows are not work
      plans.push({line,id:key,name:product.name||'',sku:product.sku||'',changes,patch});
    }

    if(!committing)
      return json({ok:true,mode:'preview',import_mode:'update',rows:body.length,matched:seen.size,
        will_change:plans.length,unchanged:seen.size-plans.length,
        columns:writable,held_columns:held,
        // Enough to review honestly without shipping a megabyte to the browser.
        plan:plans.slice(0,200).map(({patch,...rest})=>rest),
        truncated_plan:Math.max(0,plans.length-200),
        problems:problems.slice(0,100),problem_count:problems.length});

    let updated=0;const failures=[];
    for(const plan of plans){
      const fields=await normalizeProductInput(plan.patch,byId.get(plan.id),ds);
      if(!fields){failures.push({line:plan.line,error:'invalid_input'});continue;}
      // Only the columns the file carried: normalizeProductInput fills the rest
      // from `current`, and writing all of it back would let a stale read
      // overwrite an edit somebody else made while the file was open.
      const narrowed=Object.fromEntries(Object.keys(plan.patch).filter(k=>k in fields).map(k=>[k,fields[k]]));
      /*
       * Six of these columns are not really fields on the product.
       *
       * `syncProductAggregates` copies sku, barcode, price, oldPrice and
       * cost_price down from the default variant, and recomputes stock as the
       * total of the warehouse levels. So writing any of them onto the product
       * and then running the aggregate — which every write here must, or the
       * variants and the product disagree — recomputes them straight back to
       * what the variants already said. The import answered "updated 1" and
       * changed nothing: a repricing that silently did not happen, which is
       * worse than one that fails.
       *
       * The value goes where the value lives instead. This is the path
       * admin.products.update already takes for stock, extended to the rest of
       * the family, so the aggregate agrees with the file rather than overruling
       * it. Caught by R134 asserting on the stored record rather than on the
       * endpoint's own report of what it did.
       */
      const VARIANT_OWNED=['sku','barcode','price','oldPrice','cost_price'];
      /*
       * And these six are read back from the file, not from `fields`.
       *
       * `normalizeProductInput` ends in `normalizeProductInventory`, which ends
       * in the same aggregate — so by the time it hands the fields back it has
       * already replaced the new price with the one the existing variant holds.
       * Narrowing from `fields` therefore wrote 3,490 over 3,490 and called it
       * an update. The values the merchant typed are in `plan.patch`, already
       * parsed and range-checked by `parseCell`, and that is what has to reach
       * the variant.
       */
      const wantsStock='stock' in plan.patch;
      const stockValue=Math.max(0,Number(plan.patch.stock)||0);
      const result=await atomicProductMutation(plan.id,live=>{
        const merged=normalizeProductInventory({...live,...narrowed},{clone:false});
        const variant=findProductVariant(merged);
        if(variant){
          for(const key of VARIANT_OWNED) if(key in plan.patch) variant[key]=plan.patch[key];
          if(wantsStock){
            const level=variant.inventory[DEFAULT_WAREHOUSE.id]||normalizeLevel();
            variant.inventory[DEFAULT_WAREHOUSE.id]=level;
            // Never below what is already promised to open orders.
            if(level.on_hand!==null)level.on_hand=Math.max(Number(level.reserved||0),stockValue);
          }
        }
        return syncProductAggregates(merged);
      });
      if(!result.ok){failures.push({line:plan.line,error:result.error||'update_conflict'});continue;}
      if('home_featured' in narrowed)await syncFeaturedIndex(ds,plan.id,result.product.home_featured===true);
      if('slug' in narrowed||'name' in narrowed)await syncSlugIndex(ds,plan.id,result.product.slug);
      updated++;
    }
    await auditLog(req,ss,'admin.products.import.commit',{rows:body.length,updated,failed:failures.length,columns:writable});
    return json({ok:true,mode:'commit',import_mode:'update',rows:body.length,updated,created:0,held_columns:held,
      skipped:seen.size-plans.length,failed:failures.length,
      problems:[...problems,...failures].slice(0,100)});
  }

  if(action==='admin.products.bulk_import'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);
    const items=Array.isArray(b.items)?b.items.slice(0,100):[];
    if(!items.length)return json({ok:false,error:'items_required'},422);
    const ds=dataStore(),idx=new Set(await productIdsFromStore(ds));
    const importId=clean(b.import_id,80),offset=Math.max(0,Math.floor(Number(b.offset)||0)),importTotal=Math.max(items.length,Math.min(5000,Math.floor(Number(b.total)||items.length)));
    const importJobKey=importId?`product-import:${importId}`:'';
    let importJob=importJobKey?await getJSON(ds,importJobKey):null;
    if(importJob&&Number(importJob.total)!==importTotal)return json({ok:false,error:'import_total_mismatch',expected_total:importJob.total},409);
    const replay=importJob?.batches?.[String(offset)];
    if(replay)return json({...replay,replayed:true,import_id:importId,next_offset:Number(importJob.cursor||offset+items.length)});
    if(importJob&&Number(importJob.cursor||0)!==offset)return json({ok:false,error:'import_cursor_mismatch',expected_offset:Number(importJob.cursor||0),import_id:importId},409);
    if(!importJob&&importId&&offset!==0)return json({ok:false,error:'import_cursor_mismatch',expected_offset:0,import_id:importId},409);
    if(!importJob&&importId)importJob={id:importId,total:importTotal,cursor:0,batches:{},created_at:new Date().toISOString(),created_by:ss.data.username};
    let existing=[],targetedLookupComplete=false;
    if(postgresEnabled()){
      try{
        const candidateSkus=new Set(),candidateBarcodes=new Set();
        for(const item of items){for(const variant of normalizeProductInventory(item).variants||[]){const sku=variant.sku.trim().toLowerCase(),barcode=variant.barcode.trim().toLowerCase();if(sku)candidateSkus.add(sku);if(barcode)candidateBarcodes.add(barcode);}}
        const params=[dataNamespace()],predicates=[];
        if(candidateSkus.size){params.push([...candidateSkus]);const pos=params.length;predicates.push(`LOWER(COALESCE(value->>'sku',''))=ANY($${pos}::text[])`,`EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(value->'variants','[]'::jsonb)) AS variant_row WHERE LOWER(COALESCE(variant_row->>'sku',''))=ANY($${pos}::text[]))`);}
        if(candidateBarcodes.size){params.push([...candidateBarcodes]);const pos=params.length;predicates.push(`LOWER(COALESCE(value->>'barcode',''))=ANY($${pos}::text[])`,`EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(value->'variants','[]'::jsonb)) AS variant_row WHERE LOWER(COALESCE(variant_row->>'barcode',''))=ANY($${pos}::text[]))`);}
        if(predicates.length){const result=await database().pool.query(`SELECT value FROM app_kv WHERE namespace=$1 AND key LIKE 'product:%' AND (${predicates.join(' OR ')})`,params);existing=result.rows.map(row=>row.value).filter(Boolean);}
        targetedLookupComplete=true;
      }catch(error){console.warn('bulk import code lookup failed; using full catalog fallback',error?.message||error);}
    }
    if(!targetedLookupComplete){
      existing=await listJSONByPrefix(ds,'product:','product-index');
    }
    const skuOwner=new Map(),barcodeOwner=new Map();
    const rememberCodes=product=>{for(const variant of normalizeProductInventory(product)?.variants||[]){if(variant.sku)skuOwner.set(variant.sku.trim().toLowerCase(),product.id);if(variant.barcode)barcodeOwner.set(variant.barcode.trim().toLowerCase(),product.id);}};
    existing.forEach(rememberCodes);
    let created=0,updated=0,skipped=0,rewritten_skus=0,cleared_barcodes=0,held_for_stock=0;
    const errors=[];
    for(const [itemIndex,raw] of items.entries()){
      const requestedId=clean(raw?.id,80),sourceId=clean(raw?.marketplace_source_id||raw?.source_id,80);
      // A request can be committed by Blob storage while its response or import
      // checkpoint is lost. Derive an id from the immutable import position so
      // retrying that batch updates the same product instead of creating a
      // duplicate UUID. Explicit source ids remain stable across separate imports.
      const stableSourceId=sourceId?`source-${sha(sourceId).slice(0,32)}`:'';
      const stableImportId=importId?`import-${sha(`${importId}:${offset+itemIndex}`).slice(0,32)}`:'';
      const id=requestedId||stableSourceId||stableImportId||crypto.randomUUID();
      const current=await getJSON(ds,`product:${id}`);
      const fields=await normalizeProductInput({...raw,state:b.publish===true&&maySuperAdmin(ss,'admin.products.bulk_import')?'active':'hidden'},current,ds);
      if(!fields){skipped++;errors.push({id,error:'invalid_input'});continue;}
      const product=normalizeProductInventory({...(current||{}),...fields,id,marketplace_source:clean(raw.marketplace_source,40)||current?.marketplace_source||'bulk',marketplace_source_id:sourceId||current?.marketplace_source_id||'',source_url:cleanPublicUrl(raw.source_url,600)||current?.source_url||'',source_fetched_at:clean(raw.source_fetched_at,80)||current?.source_fetched_at||'',created_at:current?.created_at||clean(raw.created_at,80)||new Date().toISOString(),updated_at:new Date().toISOString()},{clone:false});
      for(const [variantIndex,variant] of (product.variants||[]).entries()){
        const skuKey=variant.sku.trim().toLowerCase(),skuConflict=skuKey&&skuOwner.has(skuKey)&&skuOwner.get(skuKey)!==id;
        if(!skuKey||skuConflict){const base=variant.sku||'IMPORT';variant.sku=`${base}-${sourceId||id}${variantIndex?`-${variantIndex+1}`:''}`.slice(0,120);rewritten_skus++;}
        skuOwner.set(variant.sku.toLowerCase(),id);
        const barcodeKey=variant.barcode.trim().toLowerCase();if(barcodeKey&&barcodeOwner.has(barcodeKey)&&barcodeOwner.get(barcodeKey)!==id){variant.barcode='';cleared_barcodes++;}else if(barcodeKey)barcodeOwner.set(barcodeKey,id);
      }
      syncProductAggregates(product);
      // Never expose a newly imported zero-stock item even if “publish now”
      // was selected. It remains recoverable in Admin and can be activated by
      // a later stock update, preventing a 1,000-row sold-out catalog launch.
      if(b.publish===true&&maySuperAdmin(ss,'admin.products.bulk_import')&&stockAvailable(product)<=0){product.state='hidden';held_for_stock++;}
      if(current){const result=await atomicProductMutation(id,()=>product);if(!result.ok){skipped++;errors.push({id,error:result.error});continue;}updated++;}
      else{const ok=await atomicProductCreate(product);if(!ok){skipped++;errors.push({id,error:'product_create_conflict'});continue;}created++;}
      // Re-add every successful item. If the previous request committed the
      // product Blob but lost the response before writing product-index, the
      // idempotent retry repairs the index instead of leaving an orphan record.
      idx.add(id);
    }
    await mutateIndexAtomically(ds,'product-index',(current)=>[...new Set([...current,...idx])]);
    await auditLog(req,ss,'admin.products.bulk_import',{received:items.length,created,updated,skipped,publish:b.publish===true&&maySuperAdmin(ss,'admin.products.bulk_import')});
    const result={ok:true,received:items.length,created,updated,skipped,held_for_stock,rewritten_skus,cleared_barcodes,errors:errors.slice(0,20),import_id:importId||undefined,next_offset:offset+items.length};
    if(importJobKey){importJob.cursor=offset+items.length;importJob.updated_at=new Date().toISOString();importJob.complete=importJob.cursor>=importJob.total;importJob.batches={...(importJob.batches||{}),[String(offset)]:result};await ds.setJSON(importJobKey,importJob);}
    return json(result);
  }
  if(action==='admin.products.create'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const ds=dataStore(); const fields=await normalizeProductInput(b,null,ds); if(!fields) return json({ok:false,error:'invalid_input'},422);
    let id=crypto.randomUUID(),p={id,...fields,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};const codeError=await uniqueProductCodeError(ds,p);if(codeError)return json({ok:false,...codeError},409);let created=await atomicProductCreate(p);for(let attempt=1;attempt<5&&!created;attempt++){id=crypto.randomUUID();p={...p,id};created=await atomicProductCreate(p);}if(!created)return json({ok:false,error:'product_create_conflict'},409);
    const known=await productIdsFromStore(ds); await mutateIndexAtomically(ds,'product-index',(idx)=>[...new Set([...idx,...known,id])]);
    await syncFeaturedIndex(ds,id,p.home_featured===true);
    await syncSlugIndex(ds,id,p.slug);
    await auditLog(req,ss,'admin.products.create',{id,name:p.name,sku:p.sku});
    return json({ok:true, product:p});
  }
  if(action==='admin.products.update'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const id=clean(b.id,80); const ds=dataStore(); const current=await getJSON(ds,`product:${id}`); if(!current) return json({ok:false,error:'not_found'},404);
    const fields=await normalizeProductInput(b,current,ds); if(!fields) return json({ok:false,error:'invalid_input'},422);
    const p={ ...current, ...fields, id, updated_at:new Date().toISOString() };
    if(Array.isArray(b.variants)){const blockers=await variantRemovalBlockers(ds,id,normalizeProductInventory(current),p);if(blockers.length)return json({ok:false,error:'variant_in_use',blockers},409);}
    const codeError=await uniqueProductCodeError(ds,p,id);if(codeError)return json({ok:false,...codeError},409);
    const result=await atomicProductMutation(id,live=>{live=normalizeProductInventory(live,{clone:false});const merged={...live,...fields,id};if(Array.isArray(b.variants)){const old=new Map((live.variants||[]).map(v=>[v.id,v]));merged.variants=(fields.variants||[]).map(variant=>({...variant,inventory:old.get(variant.id)?.inventory||variant.inventory}));const next=normalizeProductInventory(merged,{clone:false}),liveBlockers=inventoryVariantRemovalBlockers(live,next);if(liveBlockers.length)return {ok:false,error:'variant_in_use',blockers:liveBlockers};return syncProductAggregates(next);}merged.variants=live.variants;if(b.stock!==undefined){const variant=findProductVariant(merged),level=variant?.inventory?.[DEFAULT_WAREHOUSE.id]||normalizeLevel();if(variant){variant.inventory[DEFAULT_WAREHOUSE.id]=level;if(level.on_hand!==null)level.on_hand=Math.max(Number(level.reserved||0),Math.max(0,Number(b.stock)||0));}}return syncProductAggregates(normalizeProductInventory(merged,{clone:false}));});if(!result.ok)return json({ok:false,error:result.error,blockers:result.blockers||[]},409);const saved=result.product;
    if(Number(current.stock||0)!==Number(saved.stock||0)){
      const delta=Number(saved.stock||0)-Number(current.stock||0);
      const logId=crypto.randomUUID();
      const log={id:logId,product_id:id,sku:saved.sku||'',delta,before:Number(current.stock||0),after:Number(saved.stock||0),reason:'product_update',order_no:null,admin:ss.data.username,at:new Date().toISOString()};
      await ds.setJSON(`inventory-log:${logId}`,log);
      await appendToIndex(ds,'inventory-log-index',logId,{unique:false,cap:3000});
    }
    await syncFeaturedIndex(ds,id,saved.home_featured===true);
    await syncSlugIndex(ds,id,saved.slug);
    await auditLog(req,ss,'admin.products.update',{id,name:saved.name});
    return json({ok:true, product:saved});
  }
  /**
   * Repoint a product's pictures, and touch nothing else.
   *
   * `admin.products.update` is the general save and does the work a general
   * save has to do: it resolves the brand, checks every SKU and barcode in the
   * catalogue for a collision, looks for open orders blocking a variant
   * removal, writes an inventory log if the stock number moved, and syncs the
   * featured and slug indexes. The SKU check alone reads all 2,143 products —
   * `uniqueProductCodeError` calls `listJSONByPrefix` over the whole
   * catalogue — which is correct for a save that can change a SKU.
   *
   * `scripts/mirror-product-images.mjs` changes no SKU, no variant, no stock
   * number, no slug and no featured flag. It moves 2,027 pictures off a
   * supplier's S3 and onto the shop's own R2. Asking for the general save meant
   * a full catalogue read per picture, and on production every one of them
   * passed sixty seconds and was abandoned — the run uploaded twenty files to
   * R2 and updated zero products, leaving orphans behind.
   *
   * So this action exists: one strong read and one compare-and-set on a single
   * key. Everything the general save protects is out of reach here because
   * nothing this writes can affect it.
   */
  if(action==='admin.products.image'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const id=clean(b.id,80);
    if(!id) return json({ok:false,error:'invalid_input'},422);

    // Only http(s) addresses, and only where one was actually sent. A field
    // that was not sent keeps what the product already has, so a caller fixing
    // the main picture cannot blank the gallery by omission.
    const url=(value)=>cleanPublicUrl(value,2000);
    const urlList=(value,cap)=>Array.isArray(value)
      ? value.slice(0,cap).map(url).filter(Boolean)
      : null;

    const img=b.img===undefined?undefined:url(b.img);
    if(b.img!==undefined&&!img) return json({ok:false,error:'invalid_image_url'},422);
    const images=b.images===undefined?undefined:urlList(b.images,20);
    /**
     * The smaller copies of the cover, as `[{url, width, format}]`.
     *
     * The storefront renders a product card at 240px and was being handed the
     * full-size photograph — the single biggest thing PageSpeed complains about
     * on this shop. `scripts/lib/product-image-variants.mjs` produces these on
     * the way past; this records where they landed.
     *
     * Shaped rather than trusted: a row missing any of the three fields is
     * dropped, not stored, because these end up in a `srcset` and a browser
     * handed a broken candidate shows the shopper nothing at all.
     */
    const variantList=(value)=>Array.isArray(value)
      ? value.slice(0,24).map((row)=>{
          const src=url(row?.url);
          const width=Math.max(1,Math.min(4000,Math.trunc(Number(row?.width)||0)));
          const format=clean(row?.format,10).toLowerCase();
          if(!src||!width||!['avif','webp','png','jpeg','gif'].includes(format))return null;
          return {url:src,width,format};
        }).filter(Boolean)
      : null;
    const imgVariants=b.img_variants===undefined?undefined:variantList(b.img_variants);
    const detailImages=b.detail_images===undefined?undefined:urlList(b.detail_images,40);
    if(img===undefined&&images===undefined&&detailImages===undefined&&imgVariants===undefined)
      return json({ok:false,error:'nothing_to_change'},422);

    const result=await atomicProductMutation(id,live=>{
      const next={...live};
      if(img!==undefined)next.img=img;
      if(images!==undefined)next.images=images;
      if(detailImages!==undefined)next.detailImages=detailImages;
      if(imgVariants!==undefined)next.img_variants=imgVariants;
      return next;
    });
    if(!result.ok) return json({ok:false,error:result.error||'update_conflict'},result.error==='product_not_found'?404:409);

    // The catalogue listing is cached by `cachedPublicRead`; without this the
    // old address keeps being served until the window expires, which on a bulk
    // move means the shop points at pictures that are on their way out.
    forgetPublicRead('products.list');
    await auditLog(req,ss,'admin.products.image',{id,img:result.product?.img||''});
    return json({ok:true, product:productPublicView(result.product)});
  }
  if(action==='admin.products.featured'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);
    const id=clean(b.id,80),ds=dataStore(),enabled=b.home_featured===true;
    if(!id)return json({ok:false,error:'invalid_input'},422);
    const result=await atomicProductMutation(id,live=>({...live,home_featured:enabled,home_featured_order:enabled?Math.max(1,Math.min(999,Number(b.home_featured_order)||999)):null,updated_at:new Date().toISOString()}));
    if(!result.ok)return json({ok:false,error:result.error||'update_conflict'},409);
    /*
     * The flag also goes in an index.
     *
     * Reading `home_featured` off the products means loading all of them —
     * a thousand rows to find the handful a merchant chose, on a worker with
     * 10ms of CPU. The index is written here, where it is one extra read and
     * write on an action nobody performs in a loop, and the storefront then
     * fetches exactly the products on the shelf.
     */
    await syncFeaturedIndex(ds,id,enabled);
    await auditLog(req,ss,'admin.products.featured',{id,enabled,order:result.product.home_featured_order});
    return json({ok:true,product:result.product});
  }
  if(action==='admin.products.delete'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const id=clean(b.id,80); const ds=dataStore(); const current=await getJSON(ds,`product:${id}`);if(!current)return json({ok:false,error:'not_found'},404);
    const result=await atomicProductMutation(id,p=>{p=normalizeProductInventory(p,{clone:false});p.state='discontinued';for(const variant of p.variants||[])variant.state='discontinued';return syncProductAggregates(p);});if(!result.ok)return json({ok:false,error:result.error},409);
    // A discontinued product is off the shelf, so it comes off the index too
    // rather than being filtered out of every read for the rest of time.
    await syncFeaturedIndex(ds,id,false);
    await auditLog(req,ss,'admin.products.delete',{id,mode:'soft_delete'});
    return json({ok:true,product:result.product,soft_deleted:true});
  }
  if(action==='admin.products.bulk_update'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const ids=Array.isArray(b.ids)?[...new Set(b.ids.slice(0,5000).map(x=>clean(x,80)).filter(Boolean))]:[]; const patch=b.patch||{};
    if(!ids.length) return json({ok:false,error:'invalid_input'},422);
    const ds=dataStore(); const updated=[];
    for(const id of ids){
      const current=await getJSON(ds,`product:${id}`); if(!current) continue;
      let next=normalizeProductInventory({...current},{clone:false});
      if(patch.state && ['active','hidden','discontinued'].includes(patch.state)){next.state=patch.state;next.variants=(next.variants||[]).map(variant=>({...variant,state:patch.state}));}
      if(patch.category) next.category=clean(patch.category,80);
      if(patch.add_status){const status=clean(patch.add_status,40);if(status)next.status=[...new Set([...(next.status||[]),status])].slice(0,10);}
      if(patch.price_delta_percent!==undefined){const factor=1+Number(patch.price_delta_percent)/100,round=value=>Math.max(0,Math.round(Number(value||0)*factor*100)/100);next.price=round(next.price);next.variants=(next.variants||[]).map(variant=>({...variant,price:round(variant.price)}));}
      if(patch.stock!==undefined){const variant=findProductVariant(next),stock=Math.max(0,Math.round(Number(patch.stock)||0));if(variant){const level=variant.inventory[DEFAULT_WAREHOUSE.id]||normalizeLevel();variant.inventory[DEFAULT_WAREHOUSE.id]=level;if(level.on_hand!==null)level.on_hand=Math.max(Number(level.reserved||0),stock);}}
      next=syncProductAggregates(next);next.updated_at=new Date().toISOString();
      await ds.setJSON(`product:${id}`, next);
      if(Number(current.stock||0)!==Number(next.stock||0)){
        const logId=crypto.randomUUID(); const log={id:logId,product_id:id,sku:next.sku||'',delta:Number(next.stock||0)-Number(current.stock||0),before:Number(current.stock||0),after:Number(next.stock||0),reason:'bulk_update',order_no:null,admin:ss.data.username,at:new Date().toISOString()};
        await ds.setJSON(`inventory-log:${logId}`,log); await appendToIndex(ds,'inventory-log-index',logId,{unique:false,cap:3000});
      }
      updated.push(id);
    }
    await auditLog(req,ss,'admin.products.bulk_update',{ids:updated,patch});
    return json({ok:true, updated});
  }
  if(action==='admin.products.bulk_patch'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);
    const items=Array.isArray(b.items)?b.items.slice(0,100):[];if(!items.length)return json({ok:false,error:'items_required'},422);
    const ds=dataStore(),allowed=['name','slug','category','brand_id','brand','supplier_id','supplier_name','sku','barcode','price','oldPrice','cost_price','stock','state','status','home_featured','home_featured_order','img','images','detailImages','desc','review_video','specs','low_stock_threshold','variants','weight_kg','length_cm','width_cm','height_cm','unit','model','warranty','origin','min_order_qty'];
    const errors=[];let updated=0;
    for(const raw of items){
      const match=raw?._match&&typeof raw._match==='object'?raw._match:{},id=clean(match.id||raw?.id,80),current=id?await getJSON(ds,`product:${id}`):null;
      if(!id||!current){errors.push({id,error:id?'not_found':'id_required'});continue;}
      const matchSku=clean(match.sku,80),matchSourceId=clean(match.marketplace_source_id,80);
      if(matchSku&&matchSku!==clean(current.sku,80)){errors.push({id,error:'stale_identity_sku'});continue;}
      if(matchSourceId&&matchSourceId!==clean(current.marketplace_source_id,80)){errors.push({id,error:'stale_identity_source'});continue;}
      const input={};for(const key of allowed)if(Object.prototype.hasOwnProperty.call(raw,key))input[key]=raw[key];
      const fields=await normalizeProductInput(input,current,ds);if(!fields){errors.push({id,error:'invalid_input'});continue;}
      let candidate=normalizeProductInventory({...current,...fields,id},{clone:false});
      if(input.state&&['active','hidden','discontinued'].includes(input.state))candidate.variants=(candidate.variants||[]).map(variant=>({...variant,state:input.state}));
      const codeSignature=product=>JSON.stringify((normalizeProductInventory(product).variants||[]).map(variant=>[String(variant.sku||'').toLowerCase(),String(variant.barcode||'').toLowerCase()]));
      if(codeSignature(candidate)!==codeSignature(current)){const codeError=await uniqueProductCodeError(ds,candidate,id);if(codeError){errors.push({id,...codeError});continue;}}
      if(Array.isArray(input.variants)){const blockers=await variantRemovalBlockers(ds,id,normalizeProductInventory(current),candidate);if(blockers.length){errors.push({id,error:'variant_in_use',blockers});continue;}}
      const result=await atomicProductMutation(id,live=>{
        live=normalizeProductInventory(live,{clone:false});const merged={...live,...fields,id};
        if(Array.isArray(input.variants)){const old=new Map((live.variants||[]).map(variant=>[variant.id,variant]));merged.variants=(fields.variants||[]).map(variant=>({...variant,inventory:old.get(variant.id)?.inventory||variant.inventory}));const liveBlockers=inventoryVariantRemovalBlockers(live,normalizeProductInventory(merged));if(liveBlockers.length)return {ok:false,error:'variant_in_use',blockers:liveBlockers};}
        else merged.variants=live.variants;
        if(input.state&&['active','hidden','discontinued'].includes(input.state))merged.variants=(merged.variants||[]).map(variant=>({...variant,state:input.state}));
        if(input.stock!==undefined){const variant=findProductVariant(merged),stock=Math.max(0,Number(input.stock)||0);if(variant){const level=variant.inventory[DEFAULT_WAREHOUSE.id]||normalizeLevel();variant.inventory[DEFAULT_WAREHOUSE.id]=level;if(level.on_hand!==null)level.on_hand=Math.max(Number(level.reserved||0),stock);}}
        return syncProductAggregates(normalizeProductInventory(merged,{clone:false}));
      });
      if(!result.ok){errors.push({id,error:result.error||'update_conflict'});continue;}
      if(Object.prototype.hasOwnProperty.call(input,'home_featured'))await syncFeaturedIndex(ds,id,result.product.home_featured===true);
      if('slug' in input||'name' in input)await syncSlugIndex(ds,id,result.product.slug);
      updated++;
    }
    await auditLog(req,ss,'admin.products.bulk_patch',{received:items.length,updated,errors:errors.length});
    return json({ok:true,received:items.length,updated,skipped:errors.length,errors:errors.slice(0,30)});
  }


  // ================= Inventory R63: variants + multi-warehouse =================
  if(action==='admin.warehouses.list'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);return json({ok:true,warehouses:await ensureWarehouses(dataStore())});
  }
  if(action==='admin.warehouses.save'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);const ds=dataStore();const id=clean(b.id,80)||crypto.randomUUID(),code=clean(b.code,40).toUpperCase(),name=clean(b.name,160);if(!code||!name)return json({ok:false,error:'invalid_input'},422);const warehouses=await ensureWarehouses(ds);if(warehouses.some(x=>x.id!==id&&String(x.code).toUpperCase()===code))return json({ok:false,error:'warehouse_code_exists'},409);const current=await getJSON(ds,`warehouse:${id}`)||{};const row={...current,id,code,name,address:clean(b.address,500),priority:Math.max(1,Math.min(999,Math.floor(Number(b.priority)||999))),active:b.active!==false,is_default:id===DEFAULT_WAREHOUSE.id,updated_at:new Date().toISOString(),updated_by:ss.data.username};await ds.setJSON(`warehouse:${id}`,row);await appendToIndex(ds,'warehouse-index',id);await auditLog(req,ss,'admin.warehouses.save',{id,code});return json({ok:true,warehouse:row});
  }
  if(action==='admin.warehouses.delete'){
    if(!maySuperAdmin(ss,'admin.warehouses.delete'))return json({ok:false,error:'forbidden_super_admin_only'},403);if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);const id=clean(b.id,80);if(!id||id===DEFAULT_WAREHOUSE.id)return json({ok:false,error:'default_warehouse_locked'},409);const ds=dataStore();for(const pid of await productIdsFromStore(ds)){const p=await getJSON(ds,`product:${pid}`);if((normalizeProductInventory(p)?.variants||[]).some(v=>v.inventory?.[id]&&(v.inventory[id].on_hand===null||Number(v.inventory[id].on_hand||0)>0||Number(v.inventory[id].reserved||0)>0)))return json({ok:false,error:'warehouse_in_use',product_id:pid},409);}await ds.delete(`warehouse:${id}`);await removeFromIndex(ds,'warehouse-index',id);await auditLog(req,ss,'admin.warehouses.delete',{id});return json({ok:true});
  }
  if(action==='admin.inventory.overview'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);const ds=dataStore(),q=clean(b.q||url.searchParams.get('q'),180).toLowerCase(),page=Math.max(1,Number(b.page||url.searchParams.get('page')||1)),perPage=Math.min(200,Math.max(1,Number(b.per_page||url.searchParams.get('per_page')||100)));let products=await listJSONByPrefix(ds,'product:','product-index');if(q)products=products.filter(p=>matchesSearch(p,q));products.sort((a,z)=>String(a.name||'').localeCompare(String(z.name||''),'th'));const total=products.length,start=(page-1)*perPage;return json({ok:true,products:products.slice(start,start+perPage).map(p=>normalizeProductInventory(p)),warehouses:await ensureWarehouses(ds),total,page,per_page:perPage});
  }
  if(action==='admin.inventory.migrate'){
    if(!maySuperAdmin(ss,'admin.inventory.migrate'))return json({ok:false,error:'forbidden_super_admin_only'},403);if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);const ds=dataStore();await ensureWarehouses(ds);let migrated=0;for(const id of await productIdsFromStore(ds)){const result=await atomicProductMutation(id,p=>normalizeProductInventory(p,{clone:false}));if(result.ok)migrated++;}await auditLog(req,ss,'admin.inventory.migrate',{migrated});return json({ok:true,migrated});
  }
  if(action==='admin.product.variants.save'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);const ds=dataStore(),id=clean(b.id||b.product_id,80),current=await getJSON(ds,`product:${id}`);if(!current)return json({ok:false,error:'not_found'},404);if(!Array.isArray(b.variants)||!b.variants.length)return json({ok:false,error:'variants_required'},422);const previewFields=await normalizeProductInput({variants:b.variants},current,ds),preview={...current,...previewFields,id},blockers=await variantRemovalBlockers(ds,id,normalizeProductInventory(current),preview);if(blockers.length)return json({ok:false,error:'variant_in_use',blockers},409);const codeError=await uniqueProductCodeError(ds,preview,id);if(codeError)return json({ok:false,...codeError},409);const requested=b.variants.map(variant=>structuredClone(variant)),removedIds=new Set((normalizeProductInventory(current).variants||[]).map(v=>v.id).filter(variantId=>!requested.some(v=>clean(v?.id,80)===variantId))),result=await atomicProductMutation(id,async live=>{live=normalizeProductInventory(live,{clone:false});if(removedIds.size){const orderBlockers=await openOrderVariantReferenceBlockers(ds,id,removedIds);if(orderBlockers.length)return {ok:false,error:'variant_in_use',blockers:orderBlockers};}const old=new Map((live.variants||[]).map(v=>[v.id,v])),liveFields={...previewFields,variants:requested.slice(0,200).map((variant,index)=>{const variantId=clean(variant?.id,80)||(index===0?'default':crypto.randomUUID()),previous=old.get(variantId);return {...previous,...variant,id:variantId,inventory:previous?.inventory||(variant?.inventory&&typeof variant.inventory==='object'?variant.inventory:undefined)};})},next=normalizeProductInventory({...live,...liveFields,id},{clone:false}),liveBlockers=inventoryVariantRemovalBlockers(live,next);if(liveBlockers.length)return {ok:false,error:'variant_in_use',blockers:liveBlockers};return syncProductAggregates(next);});if(!result.ok)return json({ok:false,error:result.error,blockers:result.blockers||[]},409);await auditLog(req,ss,'admin.product.variants.save',{id,variants:result.product.variants.length});return json({ok:true,product:result.product});
  }
  if(action==='admin.inventory.adjust'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);const id=clean(b.id||b.product_id,80),variantId=clean(b.variant_id,80),warehouseId=clean(b.warehouse_id,80)||DEFAULT_WAREHOUSE.id,ds=dataStore(),current=await getJSON(ds,`product:${id}`);if(!current)return json({ok:false,error:'not_found'},404);const variant=findProductVariant(normalizeProductInventory(current),variantId);if(!variant)return json({ok:false,error:'variant_not_found'},404);const level=variant.inventory[warehouseId]||normalizeLevel();const delta=b.set!==undefined?Math.floor(Number(b.set)||0)-Number(level.on_hand||0):Math.floor(Number(b.delta)||0);if(!delta)return json({ok:true,product:normalizeProductInventory(current)});const updated=await adjustStock(ds,id,delta,clean(b.reason,200)||'manual_adjust',ss,null,variant.id,warehouseId);if(!updated)return json({ok:false,error:'inventory_adjust_failed'},409);await auditLog(req,ss,'admin.inventory.adjust',{id,variant_id:variant.id,warehouse_id:warehouseId,delta,reason:b.reason||''});return json({ok:true,product:updated});
  }
  if(action==='admin.inventory.transfer'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);const ds=dataStore(),id=clean(b.id||b.product_id,80),variantId=clean(b.variant_id,80),fromId=clean(b.from_warehouse_id,80),toId=clean(b.to_warehouse_id,80),qty=Math.max(1,Math.floor(Number(b.qty)||0));if(!id||!fromId||!toId||fromId===toId)return json({ok:false,error:'invalid_input'},422);const result=await atomicProductMutation(id,p=>{p=normalizeProductInventory(p,{clone:false});const variant=findProductVariant(p,variantId);if(!variant)return {ok:false,error:'variant_not_found'};const from=variant.inventory[fromId]||normalizeLevel(),to=variant.inventory[toId]||normalizeLevel();variant.inventory[fromId]=from;variant.inventory[toId]=to;if(from.on_hand!==null&&Math.max(0,Number(from.on_hand||0)-Number(from.reserved||0))<qty)return {ok:false,error:'insufficient_stock',available:Math.max(0,Number(from.on_hand||0)-Number(from.reserved||0))};const beforeFrom=from.on_hand,beforeTo=to.on_hand;if(from.on_hand!==null)from.on_hand=Number(from.on_hand||0)-qty;if(to.on_hand!==null)to.on_hand=Number(to.on_hand||0)+qty;return {value:syncProductAggregates(p),meta:{variant_id:variant.id,sku:variant.sku,beforeFrom,beforeTo,afterFrom:from.on_hand,afterTo:to.on_hand}};});if(!result.ok)return json({ok:false,error:result.error,available:result.available},409);const transferId=crypto.randomUUID(),reason=clean(b.reason,200)||'warehouse_transfer';if(result.meta.beforeFrom!==null)await appendInventoryLog(ds,{product_id:id,variant_id:result.meta.variant_id,warehouse_id:fromId,sku:result.meta.sku,delta:-qty,before:result.meta.beforeFrom,after:result.meta.afterFrom,reason,transfer_id:transferId,admin:ss.data.username});if(result.meta.beforeTo!==null)await appendInventoryLog(ds,{product_id:id,variant_id:result.meta.variant_id,warehouse_id:toId,sku:result.meta.sku,delta:qty,before:result.meta.beforeTo,after:result.meta.afterTo,reason,transfer_id:transferId,admin:ss.data.username});await auditLog(req,ss,'admin.inventory.transfer',{id,variant_id:result.meta.variant_id,from:fromId,to:toId,qty,transfer_id:transferId});return json({ok:true,product:result.product,transfer_id:transferId});
  }
  if(action==='admin.stock.adjust'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const id=clean(b.id,80); const ds=dataStore(); const p=await getJSON(ds,`product:${id}`); if(!p) return json({ok:false,error:'not_found'},404);
    let delta;
    if(b.set!==undefined) delta = Math.round(Number(b.set)) - Number(p.stock||0);
    else delta = Math.round(Number(b.delta||0));
    if(!delta) return json({ok:true, product:p});
    const updated=await adjustStock(ds, id, delta, clean(b.reason,200)||'manual_adjust', ss,null,'',DEFAULT_WAREHOUSE.id);
    await auditLog(req,ss,'admin.stock.adjust',{id,delta,reason:b.reason||''});
    return json({ok:true, product:updated});
  }
  if(action==='admin.stock.logs'||action==='admin.inventory.logs'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore(); const productId=clean(b.product_id||url.searchParams.get('product_id'),80),warehouseId=clean(b.warehouse_id||url.searchParams.get('warehouse_id'),80),variantId=clean(b.variant_id||url.searchParams.get('variant_id'),80);
    const idx=await getJSON(ds,'inventory-log-index')||[]; const logs=[];
    for(const id of idx.slice(-1000).reverse()){ const l=await getJSON(ds,`inventory-log:${id}`); if(l && (!productId || l.product_id===productId)&&(!warehouseId||l.warehouse_id===warehouseId)&&(!variantId||l.variant_id===variantId)) logs.push(l); }
    return json({ok:true, logs: logs.slice(0,200)});
  }
  if(action==='admin.stock.low'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    const threshold=Number(url.searchParams.get('threshold')||5);
    const ds=dataStore(); const low=[];for(const p of await listJSONByPrefix(ds,'product:','product-index')){if(!p||p.state!=='active')continue;const normalized=normalizeProductInventory(p);for(const variant of normalized.variants||[])for(const [warehouseId,level] of Object.entries(variant.inventory||{})){if(level.on_hand!==null&&Math.max(0,Number(level.on_hand||0)-Number(level.reserved||0))<=Number(level.reorder_point??threshold))low.push({product_id:p.id,name:p.name,variant_id:variant.id,variant_label:variant.label,sku:variant.sku,warehouse_id:warehouseId,on_hand:level.on_hand,reserved:level.reserved,available:Math.max(0,Number(level.on_hand||0)-Number(level.reserved||0)),reorder_point:Number(level.reorder_point??threshold)});}}return json({ok:true,products:low,items:low});
  }


  // ================= Customers (admin) =================
  if(action==='admin.customers.list'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore(); const as=authStore(); const q=(url.searchParams.get('q')||'').trim().toLowerCase();
    // customers are keyed individually with no master index historically; build one lazily if missing
    let idx=await getJSON(ds,'customer-index');
    if(!idx){ idx=[]; }
    const list=[];
    for(const c of await listJSONByPrefix(as,'customer:','customer-index')){ if(c) list.push(customerPublic(c)); }
    const filtered = q ? list.filter(c=>(c.name||'').toLowerCase().includes(q)||(c.email||'').toLowerCase().includes(q)||(c.phone||'').includes(q)) : list;
    return json({ok:true, customers:filtered});
  }
  if(action==='admin.customer.orders'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    const id=clean(b.id||url.searchParams.get('id'),80); const ds=dataStore();
    const list=await getJSON(ds,`orders-by-customer:${id}`)||[]; const orders=[];
    for(const oid of list.slice(-200).reverse()){ const o=await getJSON(ds,`order:${oid}`); if(o) orders.push(o); }
    return json({ok:true, orders});
  }
  if(action==='admin.customer.note'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const id=clean(b.id,80); const as=authStore(); const c=await getJSON(as,`customer:${id}`); if(!c) return json({ok:false,error:'not_found'},404);
    c.admin_note=clean(b.note,2000); await as.setJSON(`customer:${id}`,c);
    await auditLog(req,ss,'admin.customer.note',{id});
    return json({ok:true});
  }


  // ================= Audit log (admin, read-only) =================
  if(action==='admin.audit.list'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore(); const idx=await getJSON(ds,'audit-index')||[]; const logs=[];
    for(const id of idx.slice(-500).reverse()){ const l=await getJSON(ds,`audit:${id}`); if(l) logs.push(l); }
    return json({ok:true, logs: logs.slice(0,300)});
  }




  // ================= Release 12 Commerce Suite =================
  async function findCoupon(ds, code){
    const key=clean(code,40).toUpperCase(); if(!key) return null;
    return await getJSON(ds,`coupon:${key}`);
  }
  // Coupon dates entered by admins are Thailand-local datetime-local values. Older
  // releases stored them without an offset, so the server interpreted them as UTC.
  // Treat legacy offset-less values as Asia/Bangkok (+07:00); new UI stores ISO UTC.
  function couponTime(value){
    const v=String(value||'').trim(); if(!v) return null;
    const hasZone=/([zZ]|[+-]\d{2}:?\d{2})$/.test(v);
    const t=Date.parse(hasZone?v:(v+'+07:00'));
    return Number.isFinite(t)?t:null;
  }
  function couponUsability(c, subtotal){
    if(!c) return {ok:false,reason:'not_found'};
    if(c.active===false) return {ok:false,reason:'inactive'};
    const now=Date.now(), start=couponTime(c.start_at), end=couponTime(c.end_at);
    if(start!==null && start>now) return {ok:false,reason:'not_started'};
    if(end!==null && end<now) return {ok:false,reason:'expired'};
    if(Number(c.usage_limit||0)>0 && Number(c.used_count||0)>=Number(c.usage_limit)) return {ok:false,reason:'usage_limit'};
    if(Number(subtotal||0)<Number(c.min_order||0)) return {ok:false,reason:'min_order',min_order:Number(c.min_order||0)};
    return {ok:true};
  }
  function couponIsUsable(c, subtotal){ return couponUsability(c,subtotal).ok; }
  function couponDiscount(c, subtotal, shipping=0){
    if(!couponIsUsable(c,subtotal)) return {product_discount:0,shipping_discount:0};
    const max=Number(c.max_discount||0); let product_discount=0,shipping_discount=0;
    if(c.type==='shipping_free') shipping_discount=Math.max(0,Number(shipping||0));
    else if(c.type==='shipping_fixed') shipping_discount=Math.min(Math.max(0,Number(shipping||0)),Math.max(0,Number(c.value||0)));
    else if(c.type==='shipping_percent') shipping_discount=Math.max(0,Number(shipping||0))*(Math.max(0,Math.min(100,Number(c.value||0)))/100);
    else { product_discount=c.type==='percent' ? subtotal*(Math.max(0,Math.min(100,Number(c.value||0)))/100) : Math.max(0,Number(c.value||0)); product_discount=Math.min(subtotal,product_discount); }
    if(max>0){ if(shipping_discount>0) shipping_discount=Math.min(shipping_discount,max); else product_discount=Math.min(product_discount,max); }
    return {product_discount:Math.max(0,product_discount),shipping_discount:Math.max(0,Math.min(Number(shipping||0),shipping_discount))};
  }
  if(action==='coupon.validate'){
    // Unauthenticated, and it answers "no such code" and "here are its terms"
    // with two clearly different responses — a complete oracle for guessing
    // codes. Nothing limited how fast they could be guessed, so a short list of
    // plausible names (SAVE100, VIP50) fell in minutes. A shopper applies a
    // handful of codes per order at most.
    const rlCoupon=await rateLimit(req,'coupon-validate',30,60*60); if(!rlCoupon.ok)return tooMany(rlCoupon);
    const ds=dataStore(); const code=clean(b.code||url.searchParams.get('code'),40).toUpperCase(); const subtotal=Math.max(0,Number(b.subtotal||url.searchParams.get('subtotal')||0)); const shipping=Math.max(0,Number(b.shipping||url.searchParams.get('shipping')||0));
    const c=await findCoupon(ds,code); const usability=couponUsability(c,subtotal); if(!usability.ok) return json({ok:false,error:'coupon_invalid',reason:usability.reason,min_order:usability.min_order||0},404);
    const d=couponDiscount(c,subtotal,shipping); return json({ok:true,coupon:{code:c.code,type:c.type,value:c.value,min_order:c.min_order||0,max_discount:c.max_discount||0},discount:d.product_discount,shipping_discount:d.shipping_discount});
  }
  // ---------- Partner / Agent Center (company-owned catalog only) ----------
  if(action==='partner.apply'){
    const rl=await rateLimit(req,'partner-apply',5,24*60*60,clean(b.email||b.phone,180)); if(!rl.ok) return tooMany(rl);
    const human=await requireHuman(req,b,'partner'); if(human) return human;
    const first_name=clean(b.first_name,100), last_name=clean(b.last_name,100), store_name=clean(b.store_name,160), email=clean(b.email,190).toLowerCase(), ph=clean(b.phone,40), password=String(b.password||'');
    if(!first_name||!last_name||!store_name||!email||!ph||password.length<10||b.terms_accepted!==true) return json({ok:false,error:'invalid_partner_application'},422);
    const ds=dataStore();
    // The duplicate check used to read the last 500 applications one at a time,
    // so signing up as an agent meant up to 500 sequential round trips before
    // the form could even be accepted. One prefix query covers all of them.
    // The index itself is still needed to append the new application below.
    const [idx,applications]=await Promise.all([
      Promise.resolve(getJSON(ds,'agent-application-index')).then(v=>Array.isArray(v)?v:[]).catch(()=>[]),
      listJSONByPrefix(ds,'agent-application:','agent-application-index'),
    ]);
    const duplicate=applications.some(a=>a && ['pending','approved','suspended'].includes(a.status) && (String(a.email||'').toLowerCase()===email || phone(a.phone)===phone(ph)));
    if(duplicate) return json({ok:false,error:'application_exists'},409);
    const sponsorCode=clean(b.sponsor_code||b.upline_code,40).toUpperCase().replace(/[^A-Z0-9_-]/g,''),sponsorId=sponsorCode?await getJSON(ds,`agent-code:${sponsorCode}`):null,sponsor=sponsorId?await getJSON(ds,`agent:${sponsorId}`):null;if(sponsorCode&&(!sponsor||sponsor.status!=='approved'))return json({ok:false,error:'invalid_sponsor_code'},422);
    const id=crypto.randomUUID(), now=new Date().toISOString();
    const app={id,first_name,last_name,birth_date:clean(b.birth_date,20),phone:ph,email,store_name,address:clean(b.address,1000),province:clean(b.province,100),postal_code:clean(b.postal_code,10),facebook:clean(b.facebook,300),line_id:clean(b.line_id,120),tiktok:clean(b.tiktok,300),bank_name:clean(b.bank_name,120),bank_account_name:clean(b.bank_account_name,180),bank_account_no:clean(b.bank_account_no,80),note:clean(b.note,1200),sponsor_code:sponsor?.referral_code||'',upline_agent_id:sponsor?.id||'',status:'pending',created_at:now,updated_at:now,terms_accepted_at:now};
    app.password_hash=hashPassword(password); await ds.setJSON(`agent-application:${id}`,app); await appendToIndex(ds,'agent-application-index',id);
    await notifyTelegram(`👤 มีผู้สมัครตัวแทนใหม่\nร้าน: ${store_name}\nชื่อ: ${first_name} ${last_name}\nโทร: ${ph}\nอีเมล: ${email}\nสถานะ: รอ Super Admin ตรวจสอบ`);
    return json({ok:true,application_id:id,status:'pending'});
  }
  if(action==='agent.login'){
    const email=clean(b.email,190).toLowerCase(), password=String(b.password||''); const rl=await rateLimit(req,'agent-login',10,15*60,email); if(!rl.ok) return tooMany(rl);
    const ref=await getJSON(authStore(),`agent-email:${sha(email)}`), auth=ref?.id?await getJSON(authStore(),`agent-auth:${ref.id}`):null, agent=ref?.id?await getJSON(dataStore(),`agent:${ref.id}`):null;
    if(!auth||!agent||agent.status!=='approved'||!verifyPassword(password,auth.password_hash)) return json({ok:false,error:'invalid_credentials'},401);
    await deleteSession(ss.token); const ns=await saveSession({type:'agent',agent_id:agent.id,agent_code:agent.referral_code,store_name:agent.store_name});
    return json({ok:true,csrf:ns.s.csrf,agent:{id:agent.id,agent_id:agent.agent_id,store_name:agent.store_name,referral_code:agent.referral_code,commission_rate:agent.commission_rate||0,must_change_password:!!auth.must_change_password}},200,{'set-cookie':cookieHeader(ns.token)});
  }
  if(action==='agent.logout'){ if(ss.data?.type!=='agent') return json({ok:true}); await deleteSession(ss.token); return json({ok:true},200,{'set-cookie':cookieHeader('',true)}); }
  if(action==='agent.password'){
    if(ss.data?.type!=='agent'||!requireCsrf(b,ss)) return json({ok:false,error:'unauthorized'},401);
    const np=String(b.new_password||''); if(np.length<10) return json({ok:false,error:'weak_password'},422);
    const auth=await getJSON(authStore(),`agent-auth:${ss.data.agent_id}`); if(!auth||!verifyPassword(String(b.old_password||''),auth.password_hash)) return json({ok:false,error:'invalid_password'},401);
    auth.password_hash=hashPassword(np);auth.must_change_password=false;auth.updated_at=new Date().toISOString();await authStore().setJSON(`agent-auth:${ss.data.agent_id}`,auth);return json({ok:true});
  }
  if(action==='agent.profile.update'){
    if(ss.data?.type!=='agent')return json({ok:false,error:'unauthorized'},401);if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);
    const ds=dataStore(),agent=await getJSON(ds,`agent:${ss.data.agent_id}`);if(!agent||agent.status!=='approved')return json({ok:false,error:'agent_inactive'},403);
    // Only what the form actually submitted. Every field used to be rewritten on
    // each save, so a form carrying half of them — which is every form that does
    // not show all of them — silently emptied the rest: an agent who edited a
    // phone number lost their shop's picture, colour and social links.
    const sent=key=>b&&Object.prototype.hasOwnProperty.call(b,key);
    const put=(key,value)=>{if(sent(key))agent[key]=value;};
    put('avatar_url',cleanPublicUrl(b.avatar_url));put('store_bio',clean(b.store_bio,500));
    put('line_oa_url',cleanPublicUrl(b.line_oa_url));put('facebook',cleanPublicUrl(b.facebook));put('tiktok',cleanPublicUrl(b.tiktok));
    if(sent('theme_color')){const color=clean(b.theme_color,16);agent.theme_color=/^#[0-9a-f]{6}$/i.test(color)?color:'';}
    put('address',clean(b.address,1000));put('province',clean(b.province,100));put('postal_code',clean(b.postal_code,10));
    if(sent('phone'))agent.phone=clean(b.phone,40)||agent.phone;
    put('bank_name',clean(b.bank_name,120));put('bank_account_name',clean(b.bank_account_name,180));put('bank_account_no',clean(b.bank_account_no,80));
    agent.updated_at=new Date().toISOString();
    await ds.setJSON(`agent:${agent.id}`,agent);await auditLog(req,ss,'agent.profile.update',{agent_id:agent.agent_id});return json({ok:true,agent:{id:agent.id,store_name:agent.store_name,avatar_url:agent.avatar_url,store_bio:agent.store_bio,line_oa_url:agent.line_oa_url,facebook:agent.facebook,tiktok:agent.tiktok||'',theme_color:agent.theme_color,address:agent.address,province:agent.province,postal_code:agent.postal_code,phone:agent.phone,bank_name:agent.bank_name,bank_account_name:agent.bank_account_name,bank_account_no:agent.bank_account_no}});
  }
  // An agent's shop is a curated view of the company catalogue. Agents can add
  // or remove an active product from their own storefront, but cannot alter the
  // product, price, stock, or any other merchant-owned record.
  if(action==='agent.catalog.list'){
    if(ss.data?.type!=='agent')return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore(), agent=await getJSON(ds,`agent:${ss.data.agent_id}`);if(!agent||agent.status!=='approved')return json({ok:false,error:'agent_inactive'},403);
    const selectedIds=Array.isArray(await getJSON(ds,`agent-catalog:${agent.id}`))?await getJSON(ds,`agent-catalog:${agent.id}`):[];
    // The whole catalogue is read once below for the candidate list; the
    // chosen products are in it too. This looked each one up on its own —
    // another round trip per item before the page could draw.
    const card=p=>({id:p.id,name:p.name,slug:p.slug||'',brand:p.brand||'',price:Number(p.price||0),stock:publicAvailable(stockAvailable(p)),img:p.img||''});
    const q=clean(url.searchParams.get('q')||b.q,120).toLowerCase();
    const chosen=new Set(selectedIds);
    /*
     * Eighty candidates and the shop's own picks, rather than the catalogue.
     *
     * This read every product the company sells — full rows, descriptions and
     * all — to show a partner eighty of them and whichever they had already
     * chosen. At two thousand products that is the whole warehouse off Supabase
     * every time somebody types in the search box on this page.
     *
     * The picks are read by key, which is what they are: a list of ids. The
     * candidates come from the same paged query the storefront and the admin
     * list use, and it filters to active products at the source. Its search is
     * a case-insensitive substring on name, sku and brand — the same comparison
     * the scan below does, so the answers do not change; only what is fetched
     * to produce them.
     *
     * The scan stays as the fallback for a query the paged one cannot answer
     * and for a search that comes back empty, because an empty answer to a real
     * search is not an answer.
     */
    const wanted=selectedIds.slice(0,300);
    const picked=[];
    for(let i=0;i<wanted.length;i+=50)picked.push(...await Promise.all(wanted.slice(i,i+50).map(id=>getJSON(ds,`product:${id}`))));
    const selected=picked.filter(p=>p&&p.state==='active').map(card);
    let candidates=null;
    const paged=await queryProductsSupabase({q,page:1,perPage:80});
    if(paged&&(!q||paged.total>0)) candidates=paged.products.map(p=>({...card(p),selected:chosen.has(p.id)}));
    if(!candidates){
      const catalogue=await listJSONByPrefix(ds,'product:','product-index');
      candidates=catalogue.filter(p=>p&&p.state==='active'&&(!q||`${p.name||''} ${p.sku||''} ${p.brand||''}`.toLowerCase().includes(q))).slice(0,80).map(p=>({...card(p),selected:chosen.has(p.id)}));
    }
    return json({ok:true,selected,candidates});
  }
  if(action==='agent.catalog.add'||action==='agent.catalog.remove'){
    if(ss.data?.type!=='agent'||!requireCsrf(b,ss))return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore(),agent=await getJSON(ds,`agent:${ss.data.agent_id}`);if(!agent||agent.status!=='approved')return json({ok:false,error:'agent_inactive'},403);
    const ids=[...new Set((Array.isArray(b.product_ids)?b.product_ids:[]).map(id=>clean(id,80)).filter(Boolean))].slice(0,80);if(!ids.length)return json({ok:false,error:'product_ids_required'},422);
    const key=`agent-catalog:${agent.id}`,current=Array.isArray(await getJSON(ds,key))?await getJSON(ds,key):[];
    let next;
    if(action==='agent.catalog.add'){
      const valid=[];for(const id of ids){const p=await getJSON(ds,`product:${id}`);if(p&&p.state==='active')valid.push(id);}
      next=[...new Set([...current,...valid])].slice(0,300);
    }else next=current.filter(id=>!ids.includes(id));
    await ds.setJSON(key,next);await auditLog(req,ss,action,{agent_id:agent.agent_id,count:ids.length,catalog_size:next.length});return json({ok:true,count:next.length,product_ids:next});
  }
  if(action==='agent.dashboard'){
    if(ss.data?.type!=='agent') return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore(), agent=await getJSON(ds,`agent:${ss.data.agent_id}`); if(!agent||agent.status!=='approved') return json({ok:false,error:'agent_inactive'},403);
    // Three prefix reads rather than one round trip per record. This walked
    // every order, commission and payout id in turn, so the partner centre sat
    // waiting on hundreds of sequential lookups before it drew anything — the
    // trap rule 9 in CLAUDE.md is about.
    const newestFirst=(a,z)=>String(z.created_at||'').localeCompare(String(a.created_at||''));
    const [allOrders,allCommissions,allPayouts]=await Promise.all([
      listJSONByPrefix(ds,'order:','order-index'),
      listJSONByPrefix(ds,'commission:','commission-index'),
      listJSONByPrefix(ds,'payout:','payout-index'),
    ]);
    const orders=allOrders.filter(o=>o?.agent_id===agent.id).sort(newestFirst).slice(0,200).map(o=>{const {upload_token_hash,...safe}=o;return safe;});
    const commissions=allCommissions.filter(c=>c?.agent_id===agent.id).sort(newestFirst);
    const payouts=allPayouts.filter(x=>x?.agent_id===agent.id).sort(newestFirst).map(x=>{const {payment_proof,...safe}=x;return {...safe,has_payment_proof:!!payment_proof};});
    const committedByCommission=new Map();
    for(const payout of payouts){
      const state=payout.status==='paid'?'paid':payout.status==='pending'?'pending':null;
      if(!state) continue;
      for(const allocation of (payout.allocations||[])){
        const current=committedByCommission.get(allocation.commission_id)||{paid:0,pending:0};
        current[state]+=Number(allocation.amount||0);
        committedByCommission.set(allocation.commission_id,current);
      }
    }
    const commissionView=commissions.map(commission=>{
      const committed=committedByCommission.get(commission.id)||{paid:0,pending:0};
      const amount=Number(commission.amount||0), remaining=Math.round((amount-committed.paid-committed.pending)*100)/100;
      const payment_state=commission.status==='reversed'||commission.status==='adjusted_refund' ? commission.status : (committed.pending?'payout_pending':(Math.abs(remaining)<0.001?'paid':'available'));
      return {...commission,paid_allocated:committed.paid,pending_allocated:committed.pending,remaining_amount:remaining,payment_state};
    });
    const ledgerNet=commissions.filter(x=>x.status!=='reversed').reduce((a,x)=>a+Number(x.amount||0),0), paidPayouts=payouts.filter(x=>x.status==='paid').reduce((a,x)=>a+Number(x.amount||0),0), pendingPayouts=payouts.filter(x=>x.status==='pending').reduce((a,x)=>a+Number(x.amount||0),0),rawBalance=ledgerNet-paidPayouts-pendingPayouts; const totals={sales_completed:orders.filter(x=>x.status==='completed').reduce((a,x)=>a+Number(x.total||0),0),commission_available:Math.max(0,rawBalance),commission_pending_payout:pendingPayouts,commission_paid:paidPayouts,commission_debt:Math.max(0,-rawBalance),ledger_net:ledgerNet,payout_minimum:Math.max(0,Number(process.env.AGENT_MIN_PAYOUT||500)||0)};
    const levels=await agentLevelLadder(ds);
    const standing=agentLevelStanding(agent.lifetime_sales,levels);
    const effectiveRate=effectiveCommissionRate(agent,levels);
    const catalogIds=await getJSON(ds,`agent-catalog:${agent.id}`);
    const catalogCount=Array.isArray(catalogIds)?catalogIds.length:0;
    return json({ok:true,agent:{id:agent.id,agent_id:agent.agent_id,store_name:agent.store_name,referral_code:agent.referral_code,commission_rate:agent.commission_rate||0,bank_name:agent.bank_name||'',bank_account_name:agent.bank_account_name||'',bank_account_no:agent.bank_account_no||'',address:agent.address||'',province:agent.province||'',postal_code:agent.postal_code||'',phone:agent.phone||'',avatar_url:agent.avatar_url||'',store_bio:agent.store_bio||'',line_oa_url:agent.line_oa_url||'',facebook:agent.facebook||'',theme_color:agent.theme_color||'',catalog_count:catalogCount,
      /* What the agent sees about their own standing: the level they are on,
         the rate it pays, and how far to the next one. The rate is the
         effective one — a hand-set override included — because an agent
         reading a different number from the one they are paid is worse than
         showing no number at all. */
      level:standing.level,level_label:standing.label,lifetime_sales:standing.lifetime_sales,
      level_progress:standing.progress,next_level:standing.next_level,next_level_at:standing.next_at,
      next_level_rate:standing.next_rate,next_level_remaining:standing.remaining,max_level:standing.max_level,
      effective_rate:effectiveRate},levels,orders,commissions:commissionView,payouts,totals});
  }
  if(action==='agent.payout.request'){
    if(ss.data?.type!=='agent')return json({ok:false,error:'unauthorized'},401);if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);const ds=dataStore(),agent=await getJSON(ds,`agent:${ss.data.agent_id}`);if(!agent||agent.status!=='approved')return json({ok:false,error:'agent_inactive'},403);
    const payouts=[];for(const pid of (await getJSON(ds,'payout-index')||[])){const x=await getJSON(ds,`payout:${pid}`);if(x?.agent_id===agent.id)payouts.push(x);}if(payouts.some(x=>x.status==='pending'))return json({ok:false,error:'payout_already_pending'},409);
    const commissions=[];for(const cid of (await getJSON(ds,'commission-index')||[])){const c=await getJSON(ds,`commission:${cid}`);if(c?.agent_id===agent.id&&c.status!=='reversed')commissions.push(c);}
    const committed=new Map();let legacyCommitted=0;for(const p of payouts.filter(x=>x.status==='paid'||x.status==='pending')){if(Array.isArray(p.allocations)&&p.allocations.length){for(const a of p.allocations)committed.set(a.commission_id,Number(committed.get(a.commission_id)||0)+Number(a.amount||0));}else legacyCommitted+=Number(p.amount||0);}
    const effects=commissions.map(c=>({commission:c,remaining:Number(c.amount||0)-Number(committed.get(c.id)||0)})).filter(x=>Math.abs(x.remaining)>0.0001);const netRemaining=effects.reduce((a,x)=>a+x.remaining,0)-legacyCommitted,available=Math.max(0,Math.round(netRemaining*100)/100);const min=Math.max(0,Number(process.env.AGENT_MIN_PAYOUT||500)||0),requestedRaw=Number(b.amount||0),amount=requestedRaw>0?Math.round(requestedRaw*100)/100:available;
    if(available<=0)return json({ok:false,error:'no_available_commission'},409);if(amount>available+0.001)return json({ok:false,error:'payout_amount_exceeds_available',available},409);if(amount<min&&amount<available-0.001)return json({ok:false,error:'payout_below_minimum',minimum:min,available},409);
    const lockKey=`payout-lock:${agent.id}`,lock=await rawBlobStore(dataNamespace()).setJSON(lockKey,{agent_id:agent.id,at:new Date().toISOString()},{onlyIfNew:true});if(!lock?.modified)return json({ok:false,error:'payout_request_in_progress'},409);
    try{
      const allocations=[];let running=0;for(const x of effects.filter(x=>x.remaining<0)){allocations.push({commission_id:x.commission.id,amount:x.remaining});running+=x.remaining;}
      for(const x of effects.filter(x=>x.remaining>0).sort((a,b)=>new Date(a.commission.created_at)-new Date(b.commission.created_at))){if(running>=amount-0.0001)break;const need=amount-running,take=Math.min(x.remaining,need);if(take>0){allocations.push({commission_id:x.commission.id,amount:Math.round(take*100)/100});running+=take;}}
      if(Math.abs(running-amount)>0.011){await ds.delete(lockKey);return json({ok:false,error:'payout_allocation_failed'},409);}
      const id=crypto.randomUUID(),now=new Date().toISOString(),payout={id,payout_no:`PAY-${Date.now().toString(36).toUpperCase()}`,agent_id:agent.id,agent_code:agent.referral_code,agent_store_name:agent.store_name,amount,allocations,available_snapshot:available,bank_name:agent.bank_name||'',bank_account_name:agent.bank_account_name||'',bank_account_no_masked:String(agent.bank_account_no||'').replace(/.(?=.{4})/g,'*'),status:'pending',requested_at:now};await ds.setJSON(`payout:${id}`,payout);await appendToIndex(ds,'payout-index',id);await auditLog(req,{data:{type:'agent',username:agent.agent_id}},'agent.payout.request',{id,amount,allocations});await notifyTelegram(`💸 ตัวแทนขอถอนค่าคอม\nร้าน: ${agent.store_name}\nPayout: ${payout.payout_no}\nยอด: ${moneyTh(amount)} บาท`);return json({ok:true,payout,minimum:min,available_remaining:Math.max(0,available-amount)});
    }catch(e){await ds.delete(lockKey);throw e;}
  }
  if(action==='admin.payouts.list'){
    if(!maySuperAdmin(ss,'admin.payouts.list')) return json({ok:false,error:'forbidden_super_admin_only'},403);const ds=dataStore(),payouts=[];for(const id of (await getJSON(ds,'payout-index')||[]).slice().reverse()){const x=await getJSON(ds,`payout:${id}`);if(x){const {payment_proof,...safe}=x;payouts.push({...safe,has_payment_proof:!!payment_proof});}}return json({ok:true,payouts});
  }
  if(action==='admin.payout.get'){
    if(!maySuperAdmin(ss,'admin.payout.get'))return json({ok:false,error:'forbidden_super_admin_only'},403);const id=clean(url.searchParams.get('id')||b.id,100),p=await getJSON(dataStore(),`payout:${id}`);if(!p)return json({ok:false,error:'not_found'},404);return json({ok:true,payout:p});
  }
  if(action==='admin.payout.action'){
    if(!maySuperAdmin(ss,'admin.payout.action'))return json({ok:false,error:'forbidden_super_admin_only'},403);if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);const ds=dataStore(),id=clean(b.id,100),op=clean(b.operation,30),payout=await getJSON(ds,`payout:${id}`);if(!payout)return json({ok:false,error:'not_found'},404);if(payout.status!=='pending')return json({ok:false,error:'payout_not_pending'},409);const now=new Date().toISOString();
    if(op==='reject'){payout.status='rejected';payout.rejection_reason=clean(b.reason,600);payout.reviewed_by=ss.data.username;payout.reviewed_at=now;for(const cid of payout.commission_ids||[]){const c=await getJSON(ds,`commission:${cid}`);if(c&&c.status==='payout_pending'){c.status='available';delete c.payout_id;c.updated_at=now;await ds.setJSON(`commission:${cid}`,c);}}}
    else if(op==='pay'){
      for(const a of payout.allocations||[]){const c=await getJSON(ds,`commission:${a.commission_id}`);if(!c||c.status==='reversed')return json({ok:false,error:'payout_contains_reversed_commission'},409);}
      const proof=clean(b.proof,2200000),reference=clean(b.reference,300);if(!proof&&!reference)return json({ok:false,error:'payment_proof_required'},422);if(proof&&!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(proof))return json({ok:false,error:'invalid_payment_proof'},422);
      const allocated=Math.round((payout.allocations||[]).reduce((sum,a)=>sum+Number(a.amount||0),0)*100)/100;
      if(!Array.isArray(payout.allocations)||!payout.allocations.length||Math.abs(allocated-Number(payout.amount||0))>0.01)return json({ok:false,error:'payout_allocation_invalid'},409);
      payout.status='paid';payout.payment_reference=reference;payout.payment_proof=proof;payout.paid_by=ss.data.username;payout.paid_at=now;payout.allocation_validated_at=now;
    }else return json({ok:false,error:'invalid_operation'},422);
    await ds.setJSON(`payout:${id}`,payout);await ds.delete(`payout-lock:${payout.agent_id}`);await auditLog(req,ss,'admin.payout.action',{id,operation:op,amount:payout.amount,has_proof:!!payout.payment_proof});return json({ok:true,payout});
  }
  if(action==='partner.resolve'){
    const code=clean(url.searchParams.get('code')||b.code,60).toUpperCase(); if(!code) return json({ok:false,error:'invalid_code'},422);
    const ds=dataStore(), id=await getJSON(ds,`agent-code:${code}`); if(!id) return json({ok:false,error:'not_found'},404);
    const a=await getJSON(ds,`agent:${id}`); if(!a||a.status!=='approved') return json({ok:false,error:'not_active'},404);
    const claim=await claimAgentAttribution(req,ds,a);
    return json({ok:true,agent:{id:a.id,agent_id:a.agent_id,referral_code:a.referral_code,store_name:a.store_name,province:a.province||'',facebook:a.facebook||'',line_id:a.line_id||'',line_oa_url:a.line_oa_url||'',tiktok:a.tiktok||'',avatar_url:a.avatar_url||'',store_bio:a.store_bio||'',theme_color:a.theme_color||'',badge:'authorized_partner',store_url:`/agent-store.html?ref=${encodeURIComponent(a.referral_code)}`},attribution:claim.attribution},200,claim.headers);
  }
  if(action==='partner.store'){
    const code=clean(url.searchParams.get('code')||b.code,60).toUpperCase(); if(!code) return json({ok:false,error:'invalid_code'},422);
    const ds=dataStore(), id=await getJSON(ds,`agent-code:${code}`); if(!id) return json({ok:false,error:'not_found'},404);
    const a=await getJSON(ds,`agent:${id}`); if(!a||a.status!=='approved') return json({ok:false,error:'not_active'},404);
    const claim=await claimAgentAttribution(req,ds,a);
    const selectedIds=Array.isArray(await getJSON(ds,`agent-catalog:${a.id}`))?await getJSON(ds,`agent-catalog:${a.id}`):[];
    // The chosen products, fetched together rather than one after another.
    //
    // Reading them one at a time was three hundred sequential round trips.
    // Reading the whole catalogue to pick eighteen out of it was worse: the
    // cost stopped depending on the size of the shop and started depending on
    // the size of the warehouse, which is the wrong thing to grow with.
    const fetchAll=async ids=>{const out=[];for(let i=0;i<ids.length;i+=25){out.push(...await Promise.all(ids.slice(i,i+25).map(id=>getJSON(ds,`product:${id}`))));}return out;};
    const products=(await fetchAll(selectedIds.slice(0,300))).filter(p=>p&&p.state==='active')
      .map(p=>({id:p.id,name:p.name,slug:p.slug||'',brand:p.brand||'',category:p.category||'',price:Number(p.price||0),oldPrice:p.oldPrice??null,stock:publicAvailable(stockAvailable(p)),img:p.img||''}));
    return json({ok:true,agent:{id:a.id,agent_id:a.agent_id,referral_code:a.referral_code,store_name:a.store_name,province:a.province||'',facebook:a.facebook||'',line_id:a.line_id||'',line_oa_url:a.line_oa_url||'',tiktok:a.tiktok||'',avatar_url:a.avatar_url||'',store_bio:a.store_bio||'',theme_color:a.theme_color||'',badge:'authorized_partner'},products,attribution:claim.attribution},200,claim.headers);
  }
  if(action==='admin.agents.list'){
    if(!maySuperAdmin(ss,'admin.agents.list')) return json({ok:false,error:'forbidden_super_admin_only'},403); const ds=dataStore();
    const apps=[]; for(const id of (await getJSON(ds,'agent-application-index')||[]).slice().reverse()){const x=await getJSON(ds,`agent-application:${id}`);if(x)apps.push(x);}
    const levels=await agentLevelLadder(ds);
    // Standing travels with the agent so the console can draw the bar without
    // asking for each one, and so the rate on screen is the rate that will
    // actually be paid — override included.
    const agents=[]; for(const id of (await getJSON(ds,'agent-index')||[]).slice().reverse()){const x=await getJSON(ds,`agent:${id}`);if(x){const ax=await getJSON(authStore(),`agent-auth:${id}`);agents.push({...x,auth_ready:!!ax,standing:agentLevelStanding(x.lifetime_sales,levels),effective_rate:effectiveCommissionRate(x,levels)});}}
    return json({ok:true,applications:apps,agents,levels});
  }
  /*
   * The ladder itself. Read by any admin who can see the agent screen, written
   * only by a super admin — the same person who can approve an agent and set
   * their rate by hand, since this is the same decision made once for everyone.
   */
  if(action==='admin.agents.levels'){
    if(!isAdmin(ss)) return json({ok:false,error:'unauthorized'},401);
    return json({ok:true,levels:await agentLevelLadder(dataStore()),defaults:DEFAULT_AGENT_LEVELS});
  }
  if(action==='admin.agents.levels.save'){
    if(!maySuperAdmin(ss,'admin.agents.levels.save')) return json({ok:false,error:'forbidden_super_admin_only'},403);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    if(!Array.isArray(b.levels)||!b.levels.length) return json({ok:false,error:'invalid_input'},422);
    const ds=dataStore();
    // Normalised before storing, not after reading: a ladder whose rungs are
    // out of order is repaired once, here, rather than on every read for ever.
    const levels=normalizeAgentLevels(b.levels);
    await ds.setJSON(AGENT_LEVELS_KEY,levels);
    forgetPublicRead('agent-levels');
    await auditLog(req,ss,'admin.agents.levels.save',{levels});
    return json({ok:true,levels});
  }
  if(action==='admin.agents.action'){
    if(!maySuperAdmin(ss,'admin.agents.action')) return json({ok:false,error:'forbidden_super_admin_only'},403); if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const ds=dataStore(), id=clean(b.id,100), op=clean(b.operation,40); if(!id||!op) return json({ok:false,error:'invalid_input'},422);
    let app=await getJSON(ds,`agent-application:${id}`), agent=await getJSON(ds,`agent:${id}`); const now=new Date().toISOString();
    if(op==='approve'){
      if(!app) return json({ok:false,error:'application_not_found'},404);
      let agentId=agent?.agent_id||''; if(!agentId){ const seq=Number(await getJSON(ds,'agent-sequence')||0)+1; await ds.setJSON('agent-sequence',seq); agentId=`AGT-${String(seq).padStart(6,'0')}`; }
      let code=agent?.referral_code||clean(b.referral_code,40).toUpperCase().replace(/[^A-Z0-9_-]/g,'');
      if(!code){ const base=(app.store_name||'AGENT').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10)||'AGENT'; code=`${base}${random(2).slice(0,4).toUpperCase()}`; }
      const codeOwner=await getJSON(ds,`agent-code:${code}`); if(codeOwner&&codeOwner!==id) return json({ok:false,error:'referral_code_taken'},409);
      // New applications always carry the password hash chosen by the agent.
      // Keep an explicit legacy fallback for an administrator handling an old
      // record, but never generate or return a password during approval.
      const temporary_password=clean(b.temporary_password,120);
      if(!app.password_hash&&!temporary_password) return json({ok:false,error:'agent_password_missing'},422);
      if(temporary_password&&temporary_password.length<10) return json({ok:false,error:'weak_agent_password'},422);
      let uplineAgentId=clean(b.upline_agent_id,100)||app.upline_agent_id||agent?.upline_agent_id||'';if(uplineAgentId===id)return json({ok:false,error:'invalid_upline'},422);const upline=uplineAgentId?await getJSON(ds,`agent:${uplineAgentId}`):null;if(uplineAgentId&&(!upline||upline.status!=='approved'))return json({ok:false,error:'upline_not_found'},422);
      agent={...app,id,agent_id:agentId,referral_code:code,lifetime_sales:Math.max(0,Number(app.lifetime_sales||0)),level:1,commission_rate_override:(b.commission_rate===undefined||b.commission_rate===null||String(b.commission_rate).trim()==='')?null:cleanRate(b.commission_rate),commission_rate:0,upline_agent_id:upline?.id||'',upline_agent_code:upline?.referral_code||'',upline_commission_rate:Math.max(0,Math.min(100,Number(b.upline_commission_rate??process.env.AGENT_LEVEL2_COMMISSION_RATE??1)||0)),status:'approved',approved_at:now,approved_by:ss.data.username,updated_at:now};
      await authStore().setJSON(`agent-auth:${id}`,{id,email:String(app.email||'').toLowerCase(),password_hash:app.password_hash||hashPassword(temporary_password),must_change_password:!app.password_hash,created_at:now,updated_at:now});
      await authStore().setJSON(`agent-email:${sha(String(app.email||'').toLowerCase())}`,{id});
      // Worked out after the record exists, so a new agent starts on the rate
      // their level pays rather than on a hard-coded 3% nobody chose.
      agent.commission_rate=effectiveCommissionRate(agent,await agentLevelLadder(ds));
      await ds.setJSON(`agent:${id}`,agent); await ds.setJSON(`agent-code:${code}`,id); await appendToIndex(ds,'agent-index',id); app.status='approved';app.updated_at=now;await ds.setJSON(`agent-application:${id}`,app);
      await auditLog(req,ss,'admin.agents.approve',{id,agent_id:agentId,referral_code:code}); await notifyTelegram(`✅ อนุมัติตัวแทนแล้ว\n${agent.store_name}\nAgent ID: ${agentId}\nReferral: ${code}`); return json({ok:true,agent,password_set:!!app.password_hash});
    }
    if(op==='reject'){
      if(!app) return json({ok:false,error:'application_not_found'},404); app.status='rejected';app.rejection_reason=clean(b.reason,600);app.updated_at=now;app.reviewed_by=ss.data.username;await ds.setJSON(`agent-application:${id}`,app);await auditLog(req,ss,'admin.agents.reject',{id});return json({ok:true,application:app});
    }
    if(op==='reset_password'){
      if(!agent) return json({ok:false,error:'agent_not_found'},404);
      const temporary_password=clean(b.temporary_password,120)||(`Ag!${random(6)}9z`);if(temporary_password.length<10)return json({ok:false,error:'weak_agent_password'},422);
      const email=String(agent.email||'').toLowerCase();if(!email)return json({ok:false,error:'agent_email_missing'},422);
      await authStore().setJSON(`agent-auth:${id}`,{id,email,password_hash:hashPassword(temporary_password),must_change_password:true,created_at:now,updated_at:now});await authStore().setJSON(`agent-email:${sha(email)}`,{id});
      await auditLog(req,ss,'admin.agents.reset_password',{id,agent_id:agent.agent_id});return json({ok:true,temporary_password});
    }
    if(op==='set_rate'){
      if(!agent) return json({ok:false,error:'agent_not_found'},404);
      /*
       * A rate typed here is an override of the ladder, and it can be cleared.
       *
       * `Number(x)||0` turned every falsy reading into 0, which is right for
       * nothing: an empty box meant "pay this agent nothing" rather than "go
       * back to their level". Sending nothing now clears the override, and the
       * agent falls back to what their level pays. Half percents survive
       * because `cleanRate` rounds to two decimals instead of to an integer.
       */
      const raw=b.commission_rate;
      const clearing=raw===undefined||raw===null||raw===''||String(raw).trim()==='';
      if(clearing){ agent.commission_rate_override=null; }
      else {
        if(!Number.isFinite(Number(raw))) return json({ok:false,error:'invalid_rate'},422);
        agent.commission_rate_override=cleanRate(raw);
      }
      const levels=await agentLevelLadder(ds);
      // Kept in step so anything still reading the old field sees the truth.
      agent.commission_rate=effectiveCommissionRate(agent,levels);
      agent.updated_at=now;agent.updated_by=ss.data.username;
      await ds.setJSON(`agent:${id}`,agent);
      await auditLog(req,ss,'admin.agents.set_rate',{id,override:agent.commission_rate_override,effective:agent.commission_rate});
      return json({ok:true,agent:{...agent,standing:agentLevelStanding(agent.lifetime_sales,levels),effective_rate:agent.commission_rate}});
    }
    if(op==='set_upline'){
      if(!agent)return json({ok:false,error:'agent_not_found'},404);const uplineId=clean(b.upline_agent_id,100);if(uplineId===agent.id)return json({ok:false,error:'invalid_upline'},422);const upline=uplineId?await getJSON(ds,`agent:${uplineId}`):null;if(uplineId&&(!upline||upline.status!=='approved'))return json({ok:false,error:'upline_not_found'},422);let cursor=upline,depth=0;while(cursor?.upline_agent_id&&depth<20){if(cursor.upline_agent_id===agent.id)return json({ok:false,error:'upline_cycle'},409);cursor=await getJSON(ds,`agent:${cursor.upline_agent_id}`);depth++;}agent.upline_agent_id=upline?.id||'';agent.upline_agent_code=upline?.referral_code||'';agent.upline_commission_rate=Math.max(0,Math.min(100,Number(b.upline_commission_rate??agent.upline_commission_rate??1)||0));agent.updated_at=now;agent.updated_by=ss.data.username;await ds.setJSON(`agent:${id}`,agent);await auditLog(req,ss,'admin.agents.set_upline',{id,upline_agent_id:agent.upline_agent_id,upline_commission_rate:agent.upline_commission_rate});return json({ok:true,agent});
    }
    if(['suspend','terminate','reactivate'].includes(op)){
      if(!agent) return json({ok:false,error:'agent_not_found'},404); const next=op==='suspend'?'suspended':op==='terminate'?'terminated':'approved'; agent.status=next;agent.status_reason=clean(b.reason,600);agent.updated_at=now;agent.updated_by=ss.data.username;await ds.setJSON(`agent:${id}`,agent); if(app){app.status=next;app.updated_at=now;await ds.setJSON(`agent-application:${id}`,app);} await auditLog(req,ss,`admin.agents.${op}`,{id});return json({ok:true,agent});
    }
    if(op==='delete'){
      const orderIdx=await getJSON(ds,'order-index')||[]; let used=false; for(const oid of orderIdx.slice(-5000)){const o=await getJSON(ds,`order:${oid}`);if(o?.agent_id===id){used=true;break;}} if(used) return json({ok:false,error:'agent_has_order_history'},409);
      if(agent?.referral_code) await ds.delete(`agent-code:${agent.referral_code}`); await ds.delete(`agent:${id}`); await ds.delete(`agent-application:${id}`); await removeFromIndex(ds,'agent-index',id); await removeFromIndex(ds,'agent-application-index',id); await auditLog(req,ss,'admin.agents.delete',{id}); return json({ok:true});
    }
    return json({ok:false,error:'invalid_operation'},422);
  }


  if(action==='admin.coupons.list'){
    if(!maySuperAdmin(ss,'admin.coupons.list')) return json({ok:false,error:'forbidden_super_admin_only'},403); const ds=dataStore(); const idx=await getJSON(ds,'coupon-index')||[]; const coupons=[];
    for(const code of idx){const c=await getJSON(ds,`coupon:${code}`);if(c)coupons.push(c);} return json({ok:true,coupons});
  }
  if(action==='admin.coupons.save'){
    if(!maySuperAdmin(ss,'admin.coupons.save')) return json({ok:false,error:'forbidden_super_admin_only'},403); if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const ds=dataStore(); const code=clean(b.code,40).toUpperCase().replace(/[^A-Z0-9_-]/g,''); if(code.length<3)return json({ok:false,error:'invalid_code'},422);
    const current=await getJSON(ds,`coupon:${code}`)||{}; const allowedTypes=['fixed','percent','shipping_free','shipping_fixed','shipping_percent']; const type=allowedTypes.includes(b.type)?b.type:'percent'; const c={...current,code,type,value:Math.max(0,Number(b.value||0)),min_order:Math.max(0,Number(b.min_order||0)),max_discount:Math.max(0,Number(b.max_discount||0)),usage_limit:Math.max(0,Math.floor(Number(b.usage_limit||0))),used_count:Number(current.used_count||0),start_at:clean(b.start_at,40),end_at:clean(b.end_at,40),active:b.active!==false,updated_at:new Date().toISOString()};
    await ds.setJSON(`coupon:${code}`,c); await appendToIndex(ds,'coupon-index',code); await auditLog(req,ss,'admin.coupons.save',{code}); return json({ok:true,coupon:c});
  }
  if(action==='admin.coupons.delete'){
    if(!maySuperAdmin(ss,'admin.coupons.delete')) return json({ok:false,error:'forbidden_super_admin_only'},403); if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403); const ds=dataStore(); const code=clean(b.code,40).toUpperCase(); await ds.delete(`coupon:${code}`); await ds.setJSON('coupon-index',(await getJSON(ds,'coupon-index')||[]).filter(x=>x!==code)); await auditLog(req,ss,'admin.coupons.delete',{code}); return json({ok:true});
  }


  if(action==='customer.wishlist.list'){
    if(ss.data?.type!=='customer') return json({ok:false,error:'unauthorized'},401); const ds=dataStore(); const ids=await getJSON(ds,`wishlist:${ss.data.customer.id}`)||[]; const products=[]; for(const id of ids){const p=await getJSON(ds,`product:${id}`);if(p&&p.state==='active')products.push(productPublicView(p));} return json({ok:true,ids,products});
  }
  if(action==='customer.wishlist.toggle'){
    if(ss.data?.type!=='customer') return json({ok:false,error:'unauthorized'},401); if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403); const ds=dataStore(); const id=clean(b.product_id,80); if(!await getJSON(ds,`product:${id}`))return json({ok:false,error:'not_found'},404); let ids=await getJSON(ds,`wishlist:${ss.data.customer.id}`)||[]; const has=ids.includes(id); ids=has?ids.filter(x=>x!==id):[id,...ids.filter(x=>x!==id)].slice(0,200); await ds.setJSON(`wishlist:${ss.data.customer.id}`,ids); return json({ok:true,added:!has,ids});
  }


  if(action==='customer.addresses.list'){
    if(ss.data?.type!=='customer') return json({ok:false,error:'unauthorized'},401); return json({ok:true,addresses:await getJSON(dataStore(),`addresses:${ss.data.customer.id}`)||[]});
  }
  if(action==='customer.addresses.save'){
    if(ss.data?.type!=='customer') return json({ok:false,error:'unauthorized'},401); if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403); const ds=dataStore(); let list=await getJSON(ds,`addresses:${ss.data.customer.id}`)||[]; const id=clean(b.id,80)||crypto.randomUUID(); const item={id,label:clean(b.label,80)||'ที่อยู่จัดส่ง',name:clean(b.name,150),phone:clean(b.phone,40),address:clean(b.address,1000),province:clean(b.province,100),zip:clean(b.zip,10),is_default:!!b.is_default}; if(!item.name||!item.phone||!item.address)return json({ok:false,error:'invalid_input'},422); if(item.is_default)list=list.map(x=>({...x,is_default:false})); const i=list.findIndex(x=>x.id===id); if(i>=0)list[i]=item;else list.unshift(item); if(list.length===1)list[0].is_default=true; await ds.setJSON(`addresses:${ss.data.customer.id}`,list.slice(0,20)); return json({ok:true,addresses:list});
  }
  if(action==='customer.addresses.delete'){
    if(ss.data?.type!=='customer') return json({ok:false,error:'unauthorized'},401); if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403); const ds=dataStore(); let list=(await getJSON(ds,`addresses:${ss.data.customer.id}`)||[]).filter(x=>x.id!==clean(b.id,80)); if(list.length&&!list.some(x=>x.is_default))list[0].is_default=true; await ds.setJSON(`addresses:${ss.data.customer.id}`,list); return json({ok:true,addresses:list});
  }


  if(action==='reviews.list'){
    const pid=clean(b.product_id||url.searchParams.get('product_id'),80); const ds=dataStore(); const ids=await getJSON(ds,`reviews-by-product:${pid}`)||[]; const reviews=[]; for(const id of ids.slice(-200).reverse()){const r=await getJSON(ds,`review:${id}`);if(r&&r.status==='approved')reviews.push(r);} const avg=reviews.length?reviews.reduce((a,x)=>a+Number(x.rating||0),0)/reviews.length:0; return json({ok:true,reviews,average:Number(avg.toFixed(2)),count:reviews.length});
  }
  if(action==='customer.review.media.presign'){
    if(ss.data?.type!=='customer') return json({ok:false,error:'login_required'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const rl=await rateLimit(req,'review-media',20,60*60,ss.data.customer.id); if(!rl.ok) return tooMany(rl);
    if(!mediaConfigured()) return json({ok:false,error:'media_storage_not_configured'},503);
    const productId=clean(b.product_id,80),mime=clean(b.mime_type,120).toLowerCase(),filename=clean(b.filename,180)||'review-image.webp';
    const size=Math.max(0,Number(b.size_bytes||0));
    if(!productId||!['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(mime)||size<=0||size>5*1024*1024) return json({ok:false,error:'invalid_review_media'},422);
    const product=await getJSON(dataStore(),`product:${productId}`); if(!product) return json({ok:false,error:'not_found'},404);
    const out=await presignUpload({filename,mime_type:mime,owner_type:'review',owner_id:productId,created_by:ss.data.customer.id});
    return json({ok:true,...out});
  }
  if(action==='customer.review.media.commit'){
    if(ss.data?.type!=='customer') return json({ok:false,error:'login_required'},401);
    if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403);
    const productId=clean(b.product_id,80),key=clean(b.key,600),mime=clean(b.mime_type,120).toLowerCase(),size=Math.max(0,Number(b.size_bytes||0));
    if(!productId||!key.startsWith('review/')||!['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(mime)||size<=0||size>5*1024*1024) return json({ok:false,error:'invalid_review_media'},422);
    const product=await getJSON(dataStore(),`product:${productId}`); if(!product) return json({ok:false,error:'not_found'},404);
    const out=await commitMedia({key,mime_type:mime,size_bytes:size,width:Math.max(0,Number(b.width||0))||null,height:Math.max(0,Number(b.height||0))||null,owner_type:'review',owner_id:productId,created_by:ss.data.customer.id});
    return json(out);
  }
  if(action==='reviews.create'){
    if(ss.data?.type!=='customer') return json({ok:false,error:'login_required'},401); if(!requireCsrf(b,ss)) return json({ok:false,error:'invalid_csrf'},403); const rl=await rateLimit(req,'review',8,60*60,ss.data.customer.id);if(!rl.ok)return tooMany(rl); const ds=dataStore(); const pid=clean(b.product_id,80), rating=Math.max(1,Math.min(5,Math.floor(Number(b.rating||0)))),comment=clean(b.comment,2000); const rawImages=Array.isArray(b.images)?b.images:(Array.isArray(b.image_urls)?b.image_urls:[]); const images=rawImages.map(x=>clean(typeof x==='string'?x:x?.url,1200)).filter(x=>/^https?:\/\//i.test(x)||x.startsWith('/media/')).slice(0,5); if(!pid||!comment)return json({ok:false,error:'invalid_input'},422); const p=await getJSON(ds,`product:${pid}`);if(!p)return json({ok:false,error:'not_found'},404); const orderIds=await getJSON(ds,`orders-by-customer:${ss.data.customer.id}`)||[]; let verified=false; for(const oid of orderIds){const o=await getJSON(ds,`order:${oid}`);if(o&&['paid','processing','packing','shipped','completed'].includes(o.status)&&(o.items||[]).some(x=>x.id===pid)){verified=true;break;}} const id=crypto.randomUUID(); const r={id,product_id:pid,customer_id:ss.data.customer.id,customer_name:clean(ss.data.customer.name,100),rating,comment,images,verified_purchase:verified,status:'pending',created_at:new Date().toISOString()}; await ds.setJSON(`review:${id}`,r); const idx=await getJSON(ds,`reviews-by-product:${pid}`)||[];idx.push(id);await ds.setJSON(`reviews-by-product:${pid}`,idx);const all=await getJSON(ds,'review-index')||[];all.push(id);await ds.setJSON('review-index',all);return json({ok:true,review:r,message:'pending_moderation'});
  }
  if(action==='admin.reviews.list'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);const ds=dataStore();const idx=await getJSON(ds,'review-index')||[];const reviews=[];for(const id of idx.slice(-500).reverse()){const r=await getJSON(ds,`review:${id}`);if(r)reviews.push(r);}return json({ok:true,reviews});
  }
  if(action==='admin.reviews.moderate'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);const ds=dataStore();const id=clean(b.id,80),r=await getJSON(ds,`review:${id}`);if(!r)return json({ok:false,error:'not_found'},404);r.status=['approved','rejected','pending'].includes(b.status)?b.status:'pending';r.moderated_at=new Date().toISOString();r.moderated_by=ss.data.username;await ds.setJSON(`review:${id}`,r);await auditLog(req,ss,'admin.reviews.moderate',{id,status:r.status});return json({ok:true,review:r});
  }


  if(action==='order.track'){
    const rl=await rateLimit(req,'order-track',30,60*60);if(!rl.ok)return tooMany(rl); const ds=dataStore(); const orderNo=clean(b.order_no||url.searchParams.get('order_no'),50); const token=clean(b.upload_token||url.searchParams.get('token'),200); const order=await findOrderByNumber(ds,orderNo); if(!order)return json({ok:false,error:'not_found'},404); const owns=ss.data?.type==='customer'&&order.customer_id===ss.data.customer.id; const validToken=token&&order.upload_token_hash&&sha(token)===order.upload_token_hash; if(!owns&&!validToken)return json({ok:false,error:'forbidden'},403); const {upload_token_hash,...safe}=order; return json({ok:true,order:safe});
  }


  if(action==='admin.dashboard.metrics'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);
    if(relationalOrderReadsEnabled()){
      try{
        const metrics=await relationalDashboardMetrics(activeTenant().id,tenantNamespaces(activeTenant()).auth);
        if(metrics&&Number(metrics.orders||metrics.products||metrics.customers||0)>0)return json({ok:true,metrics,source:'relational'});
      }catch(error){console.warn('relational dashboard metrics failed',error?.message||error);}
    }
    // The dashboard used to read every order with its own round trip, so it got
    // linearly slower with each sale and would eventually time out the console
    // for a shop that is actually succeeding. One prefix query instead.
    const ds=dataStore();
    const [oidx,cidx,products,orders]=await Promise.all([
      Promise.resolve(getJSON(ds,'order-index')).then(v=>Array.isArray(v)?v:[]).catch(()=>[]),
      Promise.resolve(getJSON(ds,'customer-index')).then(v=>Array.isArray(v)?v:[]).catch(()=>[]),
      listJSONByPrefix(ds,'product:','product-index'),
      listJSONByPrefix(ds,'order:','order-index'),
    ]);
    let revenue=0,todayRevenue=0,ordersToday=0,pending=0,lowStock=0;const today=new Date().toISOString().slice(0,10);
    const EARNED=['paid','processing','packing','shipped','completed'];
    for(const o of orders){if(!o)continue;const earned=EARNED.includes(o.status);if(earned)revenue+=Number(o.total||0);if(String(o.created_at||'').slice(0,10)===today){ordersToday++;if(earned)todayRevenue+=Number(o.total||0);}if(['new','awaiting_verification'].includes(o.status))pending++;}
    for(const p of products){if(p&&p.state==='active'&&Number(p.stock||0)<=5)lowStock++;}
    return json({ok:true,metrics:{products:products.length,customers:cidx.length,orders:oidx.length,orders_today:ordersToday,pending_orders:pending,low_stock:lowStock,revenue,revenue_today:todayRevenue,scanned_orders:oidx.length,complete:true}});
  }
  if(action==='admin.catalog.integrity'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore(),productIndex=await getJSON(ds,'product-index')||[],productRows=await listJSONByPrefix(ds,'product:','product-index'),customerIndex=await getJSON(ds,'customer-index')||[],lastCheck=await getJSON(ds,'catalog-integrity-meta');
    let mirroredProducts=null,databaseStatus=postgresEnabled()?'unavailable':'not_enabled';
    if(postgresEnabled())try{const result=await database().pool.query(`SELECT COUNT(*)::int AS count FROM app_kv WHERE namespace=$1 AND key LIKE 'product:%'`,[dataNamespace()]);mirroredProducts=Number(result.rows[0]?.count||0);databaseStatus=mirroredProducts===productIndex.length?'synced':'catching_up';}catch(error){console.warn('catalog integrity database check failed',error?.message||error);}
    const indexHealthy=productIndex.length===productRows.length&&new Set(productIndex).size===productIndex.length;
    return json({ok:true,status:(databaseStatus==='synced'||databaseStatus==='not_enabled')&&indexHealthy?'healthy':'degraded',products:{indexed:productIndex.length,index_unique:new Set(productIndex).size,stored:productRows.length,mirrored:mirroredProducts,index_status:indexHealthy?'synced':'stale'},users:{indexed:customerIndex.length,auth_connection:'ok'},database_status:databaseStatus,last_reconciliation:lastCheck||null,checked_at:new Date().toISOString()});
  }
  if(action==='analytics.event'){
    if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
    const rl=await rateLimit(req,'analytics-event',120,60);if(!rl.ok)return tooMany(rl);
    const type=String(b.type||'');
    if(!EVENT_TYPES.has(type)||!/^[-a-zA-Z0-9]{16,80}$/.test(String(b.visitor||''))||!/^[-a-zA-Z0-9]{16,80}$/.test(String(b.session||'')))return json({ok:false,error:'invalid_event'},422);
    const path=String(b.path||'/').split(/[?#]/)[0].slice(0,250);
    if(!path.startsWith('/')||path.startsWith('//')||/^\/(admin|owner|account|operations)(\/|$)/.test(path))return json({ok:true,ignored:true});
    const created_at=new Date().toISOString(),id=crypto.randomUUID();
    const hash=v=>crypto.createHash('sha256').update(`${dataNamespace()}:${v}`).digest('hex');
    await dataStore().setJSON(`analytics-event:${created_at.slice(0,10)}:${id}`,{type,path,visitor:hash(b.visitor),session:hash(b.session),product_id:clean(b.product_id,100),created_at});
    return json({ok:true});
  }
  if(action==='admin.analytics.report'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore();
    if(typeof ds.listPrefix!=='function')return json({ok:false,error:'analytics_storage_unavailable'},503);
    const from=clean(b.from||url.searchParams.get('from'),10),to=clean(b.to||url.searchParams.get('to'),10);
    // The window immediately before the one asked for, of the same length, so
    // every figure can say how it moved rather than only how large it is.
    const day=v=>String(v||'').slice(0,10);
    let prevFrom='',prevTo='';
    if(from&&to){
      const spanDays=Math.max(1,Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000)+1);
      const shift=n=>new Date(Date.parse(`${from}T00:00:00Z`)-n*86400000).toISOString().slice(0,10);
      prevFrom=shift(spanDays);prevTo=shift(1);
    }
    const within=(d,a,z)=>(!a||d>=a)&&(!z||d<=z);
    const all=(await ds.listPrefix('analytics-event:',{limit:20000})).map(r=>r.value).filter(Boolean);
    // Completed purchases come from the order ledger, not the tracker: an order
    // is recorded server-side and does not depend on the browser's last beacon.
    const paidForFunnel=new Set(['paid','processing','packing','shipped','completed']);
    let purchases=0,prevPurchases=0;
    const reportOrders=await listJSONByPrefix(ds,'order:','order-index');
    for(const order of reportOrders){
      if(!order||!paidForFunnel.has(order.status))continue;
      const d=day(order.created_at);
      if(within(d,from,to))purchases++;
      if(prevFrom&&within(d,prevFrom,prevTo))prevPurchases++;
    }
    const report=aggregateEvents(all.filter(e=>within(day(e.created_at),from,to)),{purchases});
    report.top_products=await Promise.all(report.top_products.map(async row=>{const p=await getJSON(ds,`product:${row.product_id}`);return {...row,name:p?.name||row.product_id,image_url:p?.img||p?.image_url||p?.image||''};}));
    // Members are the shop's whole register, so the total is not windowed; only
    // the sign-ups are. The index alone gives the total for free, and the
    // records are read only when a range asks how many of them are new.
    const customerIds=await getJSON(ds,'customer-index')||[];
    const members={total:customerIds.length,joined:0,previous_joined:0};
    if(from||to||prevFrom){
      const au=authStore();
      const customers=await listJSONByPrefix(au,'customer:','customer-index');
      for(const c of customers){
        if(!c)continue;
        const d=day(c.created_at);if(!d)continue;
        if(within(d,from,to))members.joined++;
        if(prevFrom&&within(d,prevFrom,prevTo))members.previous_joined++;
      }
    } else members.joined=customerIds.length;
    const previous=prevFrom?(()=>{const r=aggregateEvents(all.filter(e=>within(day(e.created_at),prevFrom,prevTo)),{purchases:prevPurchases});return {summary:r.summary,funnel:r.funnel};})():null;
    // The written analysis is asked for separately.
    //
    // It used to run inside this request with a twenty-five second ceiling, so
    // a slow or unreachable provider held the entire report — every figure,
    // every chart — behind it. The page renders its numbers first and asks for
    // the analysis afterwards.
    const wantsInsights=String(b.with_insights||url.searchParams.get('with_insights')||'')==='1';
    const ai=wantsInsights?await generateInsights(report,{tenantId:tenant.id}):{insights:[],status:'deferred',provider:null,attempts:[]};
    return json({ok:true,...report,members,previous,range:{from:from||null,to:to||null,previous_from:prevFrom||null,previous_to:prevTo||null},insights:ai.insights,insight_status:ai.status,insight_provider:ai.provider,insight_attempts:ai.attempts||[],complete:all.length<20000,generated_at:new Date().toISOString()});
  }
  if(action==='admin.reports.sales'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore();
    const from=clean(b.from||url.searchParams.get('from'),10);
    const to=clean(b.to||url.searchParams.get('to'),10);
    const channel=clean(b.channel||url.searchParams.get('channel'),30).toLowerCase();
    const previousEnabled=String(b.include_previous||url.searchParams.get('include_previous')||'')==='1'&&from&&to;
    if(relationalReportReadsEnabled()){
      try{
        const relational=await relationalSalesReport(activeTenant().id,{from,to,channel,includePrevious:previousEnabled});
        if(relational&&!relational.empty)return json({ok:true,...relational});
      }catch(error){console.warn('relational sales report failed',error?.message||error);}
    }
    const paidStatuses=new Set(['paid','processing','packing','shipped','completed']);
    // Read the order collection once. The previous implementation fetched each
    // order by key in a serial loop, so report time grew with every sale.
    const orderRows=await listJSONByPrefix(ds,'order:','order-index');
    const summarize=(rangeFrom,rangeTo)=>{
      const status_counts={},daily=new Map(),products=new Map();
      let matched=0,paid_orders=0,units=0,revenue=0,refunds=0,shipping=0,discount=0,cost=0;
      for(const order of orderRows){
        if(!order)continue;
        const day=String(order.created_at||'').slice(0,10);
        if(rangeFrom&&day<rangeFrom)continue;
        if(rangeTo&&day>rangeTo)continue;
        const source=String(order.channel||order.marketplace_source||'website').toLowerCase();
        if(channel&&channel!=='all'&&source!==channel)continue;
        matched++; status_counts[order.status]=(status_counts[order.status]||0)+1;
        if(order.status==='refunded'){refunds+=Number(order.total||0);continue;}
        if(!paidStatuses.has(order.status))continue;
        paid_orders++; revenue+=Number(order.total||0); shipping+=Number(order.shipping||0); discount+=Number(order.discount||0);
        const d=daily.get(day)||{date:day,orders:0,revenue:0,units:0,profit:0};
        d.orders++; d.revenue+=Number(order.total||0);
        for(const item of order.items||[]){
          const qty=Math.max(0,Number(item.qty||item.quantity||0));
          const lineRevenue=Math.max(0,Number(item.price||0))*qty;
          const lineCost=Math.max(0,Number(item.cost_price||0))*qty;
          units+=qty; cost+=lineCost; d.units+=qty; d.profit+=lineRevenue-lineCost;
          const key=`${item.id||item.product_id||item.sku}::${item.variant_id||''}`;
          const row=products.get(key)||{product_id:item.id||item.product_id||'',variant_id:item.variant_id||'',name:item.name||'',variant_label:item.variant_label||'',sku:item.sku||'',units:0,revenue:0,cost:0,profit:0};
          row.units+=qty; row.revenue+=lineRevenue; row.cost+=lineCost; row.profit+=lineRevenue-lineCost; products.set(key,row);
        }
        daily.set(day,d);
      }
      const net_sales=Math.max(0,revenue-refunds),gross_profit=Math.max(-999999999,net_sales-shipping-cost),vat_included=net_sales*7/107;
      return {summary:{orders:matched,paid_orders,units,revenue,refunds,net_sales,shipping,discount,cost,gross_profit,margin_percent:net_sales?gross_profit/net_sales*100:0,vat_included,pre_vat:net_sales-vat_included},status_counts,daily:[...daily.values()].sort((a,z)=>a.date.localeCompare(z.date)),top_products:[...products.values()].sort((a,z)=>z.revenue-a.revenue).slice(0,100)};
    };
    const current=summarize(from,to);
    const enrichProducts=async rows=>Promise.all(rows.map(async row=>{const p=row.product_id?await getJSON(ds,`product:${row.product_id}`):null;return {...row,image_url:p?.img||p?.image_url||p?.image||''};}));
    let previous=null;
    if(previousEnabled){
      const span=Math.max(1,Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000)+1);
      const shift=n=>new Date(Date.parse(`${from}T00:00:00Z`)-n*86400000).toISOString().slice(0,10);
      previous=summarize(shift(span),shift(1));
    }
    return json({ok:true,filters:{from,to,channel:channel||'all'},...current,top_products:await enrichProducts(current.top_products),previous:previous?{...previous,top_products:[]}:null,generated_at:new Date().toISOString(),scanned_orders:orderRows.length,complete:true});
  }


  if(action==='admin.newsletter.list'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);const ds=dataStore();const subscribers=(await listJSONByPrefix(ds,'subscriber:','subscriber-index')).filter(Boolean);return json({ok:true,subscribers});
  }




  if(action==='customer.return.request'){
    if(ss.data?.type!=='customer')return json({ok:false,error:'unauthorized'},401);if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);
    const ds=dataStore(),orderNo=clean(b.order_no,50),reason=clean(b.reason,2000);if(!orderNo||!reason)return json({ok:false,error:'invalid_input'},422);let order=null;const ids=await getJSON(ds,`orders-by-customer:${ss.data.customer.id}`)||[];for(const oid of ids){const o=await getJSON(ds,`order:${oid}`);if(o?.order_no===orderNo){order=o;break;}}if(!order)return json({ok:false,error:'not_found'},404);if(['cancelled','refunded','expired'].includes(order.status))return json({ok:false,error:'order_not_eligible'},409);const existing=await getJSON(ds,`return-by-order:${order.id}`);if(existing)return json({ok:false,error:'return_exists'},409);const id=crypto.randomUUID(),r={id,order_id:order.id,order_no:order.order_no,customer_id:ss.data.customer.id,customer_name:ss.data.customer.name,phone:ss.data.customer.phone,reason,status:'requested',created_at:new Date().toISOString(),history:[{status:'requested',at:new Date().toISOString(),by:'customer'}]};await ds.setJSON(`return:${id}`,r);await ds.setJSON(`return-by-order:${order.id}`,id);const idx=await getJSON(ds,'return-index')||[];idx.push(id);await ds.setJSON('return-index',idx);await notifyTelegram(`คำขอคืนสินค้า ${order.order_no}\nลูกค้า: ${r.customer_name}\nเหตุผล: ${reason}`);return json({ok:true,return_request:r});
  }
  if(action==='admin.returns.list'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);
    const returns=(await listJSONByPrefix(dataStore(),'return:','return-index'))
      .filter(Boolean)
      .sort((a,z)=>String(z.created_at||'').localeCompare(String(a.created_at||'')))
      .slice(0,500);
    return json({ok:true,returns});
  }
  if(action==='admin.returns.status'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);const allowed=['requested','approved','rejected','received','refunded','closed'];const status=clean(b.status,30);if(!allowed.includes(status))return json({ok:false,error:'invalid_status'},422);const ds=dataStore(),id=clean(b.id,80),r=await getJSON(ds,`return:${id}`);if(!r)return json({ok:false,error:'not_found'},404);r.status=status;r.admin_note=clean(b.admin_note,2000)||r.admin_note||'';r.history=[...(r.history||[]),{status,at:new Date().toISOString(),by:ss.data.username}];await ds.setJSON(`return:${id}`,r);await auditLog(req,ss,'admin.returns.status',{id,status});return json({ok:true,return_request:r});
  }
  if(action==='admin.newsletter.send'){
if(!maySuperAdmin(ss,'admin.newsletter.send'))return json({ok:false,error:'forbidden_super_admin_only'},403);if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);const subject=clean(b.subject,180),message=clean(b.message,12000);if(!subject||!message)return json({ok:false,error:'invalid_input'},422);const settings=await getBusinessSettings(),mailer=await buildMailer(settings);if(!mailer)return json({ok:false,error:'smtp_not_configured'},422);const ds=dataStore();const emails=(await listJSONByPrefix(ds,'subscriber:','subscriber-index')).filter(x=>x?.status==='active'&&x.email).map(x=>x.email);let sent=0,failed=0;const from=`"${settings.email.from_name}" <${settings.email.from_email||settings.email.smtp_user}>`;for(let i=0;i<emails.length;i+=50){const batch=emails.slice(i,i+50);try{await mailer.sendMail({from,to:settings.email.from_email||settings.email.smtp_user,bcc:batch,subject,text:message});sent+=batch.length;}catch(error){failed+=batch.length;console.warn('newsletter batch failed',error?.message||'unknown_error');}}await auditLog(req,ss,'admin.newsletter.send',{sent,failed,subject});return json({ok:failed===0,sent,failed,error:failed?'newsletter_delivery_failed':undefined},failed?502:200);
  }



  if(action==='telegram.chat.webhook'){
    const config=await tskTelegramConfig();
    if(!config.webhookSecret||req.headers.get('x-telegram-bot-api-secret-token')!==config.webhookSecret)return json({ok:false,error:'invalid_webhook_secret'},401);
    if(req.method!=='POST')return json({ok:true,webhook:true});
    const update=b||{},message=update.message||update.edited_message;
    if(!message||!message.text||String(message.chat?.id)!==String(config.chatId))return json({ok:true,ignored:true});
    if(message.from?.is_bot)return json({ok:true,ignored:true});
    const senderId=message.from?.id!=null?String(message.from.id):'';
    if(config.adminIds.length&&!config.adminIds.includes(senderId))return json({ok:true,ignored:true});
    const replyId=message.reply_to_message?.message_id;
    if(replyId==null)return json({ok:true,ignored:true});
    const ds=dataStore(),mapping=await getJSON(ds,'chat-telegram-map:'+String(replyId)).catch(()=>null);
    if(!mapping?.conversation_id)return json({ok:true,ignored:true});
    const conversation=await tskChatConversation(ds,mapping.conversation_id);
    if(!conversation||conversation.status!=='open')return json({ok:true,ignored:true});
    const sender=message.from?.username||[message.from?.first_name,message.from?.last_name].filter(Boolean).join(' ')||'Telegram admin';
    await tskChatAppend(ds,conversation,{role:'admin',text:message.text,sender,telegram_message_id:message.message_id,telegram_user_id:senderId,delivery:'received'});
    return json({ok:true,received:true});
  }

  if(action==='telegram.chat.get'){
    const ds=dataStore(),id=clean(b.conversation_id||url.searchParams.get('conversation_id'),100),visitorToken=clean(b.visitor_token||url.searchParams.get('visitor_token'),200),customerId=tskChatCustomerId(ss),conversation=await tskChatConversation(ds,id);
    if(!tskChatMayRead(conversation,visitorToken,customerId))return json({ok:false,error:'conversation_forbidden'},403);
    // Reading your own thread while signed in is also how a guest room becomes
    // an account room, so it survives this browser.
    if(customerId)await tskChatClaim(ds,conversation,customerId);
    await tskChatCloseIfStale(ds,conversation);
    const after=Math.max(0,Number(b.after||url.searchParams.get('after')||0));
    return json({ok:true,conversation_id:conversation.id,status:conversation.status,cursor:Number(conversation.message_seq||0),messages:(conversation.messages||[]).filter(x=>Number(x.seq||0)>after)});
  }

  if(action==='telegram.chat.send'){
    const text=clean(b.message,TSK_CHAT_MAX_TEXT);
    if(!text)return json({ok:false,error:'message_required'},422);
    // The only unauthenticated write left without a quota, and the most
    // expensive one on the API: each call opened a room in Supabase and sent a
    // real Telegram message. A loop could fill the table, flood the shop's
    // Telegram group and burn the worker's CPU budget for nothing.
    //
    // Keyed on the address alone, with no identity narrowing the bucket:
    // `visitor_token` comes from the caller, so folding it in would let an
    // attacker rotate it and get a fresh quota every request. 30 messages an
    // hour is far above a real conversation and far below a flood.
    const rl=await rateLimit(req,'chat-send',30,60*60); if(!rl.ok)return tooMany(rl);
    const ds=dataStore();
    let visitorToken=clean(b.visitor_token,200)||random(32);
    const customerId=tskChatCustomerId(ss);
    let conversation=await tskChatConversation(ds,clean(b.conversation_id,100));
    if(conversation&&!tskChatMayRead(conversation,visitorToken,customerId))return json({ok:false,error:'conversation_forbidden'},403);
    // Signed in on a device that has never chatted before: pick up whichever
    // room the account already has open rather than starting a second one the
    // shop would have to notice separately.
    if(!conversation&&customerId){
      const rooms=await tskChatCustomerRooms(ds,customerId);
      for(const room of rooms){const fresh=await tskChatCloseIfStale(ds,room);if(fresh.status==='open'){conversation=fresh;break;}}
    }
    if(conversation)conversation=await tskChatCloseIfStale(ds,conversation);
    // Coming back after the room timed out starts a fresh one rather than
    // appending to a closed thread nobody is watching.
    if(conversation&&conversation.status!=='open')conversation=null;
    const isNewRoom=!conversation;
    if(!conversation)conversation=await tskChatCreate(ds,visitorToken,customerId);
    else if(customerId)conversation=await tskChatClaim(ds,conversation,customerId);
    const config=await tskTelegramConfig();
    let telegramMessage;
    try{
      // The context block is only worth the two reads on the message that
      // opens a room; after that the operator already has it above in the
      // thread, and repeating it on every line would bury the question.
      const context=isNewRoom?await tskChatContext(ds,ss,b.page,b.message):'';
      telegramMessage=await tskTelegramCall(config,'sendMessage',{chat_id:config.chatId,text:'💬 แชทจากเว็บไซต์ THAISERKIT SUPPLY\nห้อง: '+conversation.id.slice(0,8)+(context?'\n'+context:'')+'\n\n'+text+'\n\n↩️ กด Reply ที่ข้อความนี้เพื่อตอบลูกค้า',disable_web_page_preview:true});
    }catch(error){
      await tskChatAppend(ds,conversation,{role:'customer',text,delivery:'telegram_failed'});
      return json({ok:false,error:error.code||'telegram_unavailable',visitor_token:visitorToken,conversation_id:conversation.id},error.code==='telegram_not_configured'?503:502);
    }
    await tskChatMap(ds,telegramMessage.message_id,conversation.id);
    await tskChatAppend(ds,conversation,{role:'customer',text,telegram_message_id:telegramMessage.message_id,delivery:'sent'});
    return json({ok:true,visitor_token:visitorToken,conversation_id:conversation.id,messages:conversation.messages});
  }

  // The profile's chat history. Guests keep a room only as long as their
  // browser keeps the token; an account keeps every room it has ever had.
  if(action==='telegram.chat.mine'){
    const customerId=tskChatCustomerId(ss);
    if(!customerId)return json({ok:false,error:'login_required'},401);
    const ds=dataStore(),rooms=await tskChatCustomerRooms(ds,customerId);
    for(const room of rooms)await tskChatCloseIfStale(ds,room);
    const active=rooms.find(x=>x.status==='open')||null;
    return json({ok:true,active_conversation_id:active?active.id:'',conversations:rooms.map(x=>({
      id:x.id,
      status:x.status,
      created_at:x.created_at,
      updated_at:x.updated_at,
      message_count:Array.isArray(x.messages)?x.messages.length:0,
      messages:Array.isArray(x.messages)?x.messages.slice(-100):[]
    }))});
  }

  if(action==='telegram.chat.admin.list'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);
    const chatDs=dataStore();
    const allRooms=await tskChatList(chatDs);
    /*
     * The inbox is also where the retention sweep gets its regular run.
     *
     * An operator opens this screen many times a day, which is more often than
     * any schedule would fire, and it is the one place that has already paid
     * for a full listing — so the rooms past thirty days are found here for
     * free rather than by a job that has to be kept alive separately. Bounded
     * per call, so a backlog drains over a few refreshes instead of holding one
     * up.
     */
    const expired=allRooms.filter(tskChatIsExpired).map(x=>x.id);
    if(expired.length)await tskChatSweepExpired(chatDs,expired);
    const live=expired.length?allRooms.filter(x=>!expired.includes(x.id)):allRooms;
    for(const room of live)await tskChatCloseIfStale(chatDs,room);
    const conversations=live.sort((a,z)=>String(z.updated_at||'').localeCompare(String(a.updated_at||'')));
    return json({ok:true,conversations:conversations.map(x=>({id:x.id,status:x.status,created_at:x.created_at,updated_at:x.updated_at,message_count:Array.isArray(x.messages)?x.messages.length:0,last_message:Array.isArray(x.messages)?x.messages.at(-1)||null:null}))});
  }

  if(action==='telegram.chat.admin.get'){
    if(!isAdmin(ss))return json({ok:false,error:'unauthorized'},401);
    const conversation=await tskChatConversation(dataStore(),clean(b.conversation_id||url.searchParams.get('conversation_id'),100));
    if(!conversation)return json({ok:false,error:'not_found'},404);
    await tskChatCloseIfStale(dataStore(),conversation);
    const {visitor_token_hash,...safeConversation}=conversation;
    return json({ok:true,conversation:safeConversation});
  }

  if(action==='telegram.chat.admin.reply'){
    if(!isAdmin(ss)||!requireCsrf(b,ss))return json({ok:false,error:'unauthorized'},401);
    const ds=dataStore(),conversation=await tskChatConversation(ds,clean(b.conversation_id,100)),text=clean(b.message,TSK_CHAT_MAX_TEXT);
    if(!conversation||!text)return json({ok:false,error:'invalid_input'},422);
    const config=await tskTelegramConfig();
    try{
      const payload={chat_id:config.chatId,text:'🛠 ตอบจากหน้าแอดมิน\nห้อง: '+conversation.id.slice(0,8)+'\n\n'+text};
      if(conversation.last_telegram_message_id)payload.reply_parameters={message_id:Number(conversation.last_telegram_message_id)};
      await tskTelegramCall(config,'sendMessage',payload);
    }catch(error){return json({ok:false,error:error.code||'telegram_unavailable'},502);}
    const item=await tskChatAppend(ds,conversation,{role:'admin',text,sender:ss.data.username||'admin',delivery:'sent'});
    return json({ok:true,message:item});
  }

  if(action==='telegram.chat.test'){
    if(!maySuperAdmin(ss,'telegram.chat.test')||!requireCsrf(b,ss))return json({ok:false,error:'forbidden_super_admin_only'},403);
    const config=await tskTelegramConfig();
    try{
      await tskTelegramCall(config,'sendMessage',{chat_id:config.chatId,text:'✅ THAISERKIT SUPPLY: ทดสอบบอทแชทลูกค้าสำเร็จ'});
      return json({ok:true});
    }catch(error){return json({ok:false,error:error.code||'telegram_unavailable'},502);}
  }

  if(action==='telegram.chat.setup'){
    if(!maySuperAdmin(ss,'telegram.chat.setup')||!requireCsrf(b,ss))return json({ok:false,error:'forbidden_super_admin_only'},403);
    const config=await tskTelegramConfig();
    if(!config.webhookSecret)return json({ok:false,error:'telegram_webhook_secret_missing'},422);
    const endpoint=new URL(req.url);endpoint.search='?action=telegram.chat.webhook';
    try{
      const result=await tskTelegramCall(config,'setWebhook',{url:endpoint.toString(),secret_token:config.webhookSecret,allowed_updates:['message']});
      return json({ok:true,webhook_url:endpoint.toString(),configured:Boolean(result&&result.url)});
    }catch(error){return json({ok:false,error:error.code||'telegram_unavailable'},502);}
  }

  /**
   * Delete chat rooms outright. The owner's decision, and nobody else's.
   *
   * Closing a room keeps it: the transcript stays readable and the retention
   * sweep removes it after thirty days. An inbox with hundreds of one-line
   * rooms in it is a different problem — the operator cannot find the two that
   * matter — and waiting a month for each is not an answer.
   *
   * `isSuperAdmin` rather than `maySuperAdmin`, which is the wider test that
   * also admits a store manager. This is not money and not keys, so the wider
   * test would have allowed it; the shop's owner asked for it to be theirs
   * alone, and a customer's messages are exactly the kind of thing worth
   * keeping to one pair of hands.
   *
   * Ids only, never a date range. "Delete everything before March" cannot be
   * checked by the person typing it, and this is the one operation in the
   * console with nothing behind it — what goes has to be what somebody looked
   * at and chose.
   */
  if(action==='telegram.chat.admin.delete'){
    if(!isSuperAdmin(ss))return json({ok:false,error:'forbidden_super_admin_only'},403);
    if(!requireCsrf(b,ss))return json({ok:false,error:'invalid_csrf'},403);

    const asked=Array.isArray(b.conversation_ids)
      ? b.conversation_ids
      : [b.conversation_id];
    const ids=[...new Set(asked.map(x=>clean(x,100)).filter(Boolean))];
    if(!ids.length)return json({ok:false,error:'conversation_id_required'},422);
    // Capped per call for the same reason every other bulk path here is: a
    // worker gets fifty subrequests, and a request that quietly does half the
    // work is worse than one that says how much it did.
    if(ids.length>25)return json({ok:false,error:'too_many',limit:25},422);

    const ds=dataStore();
    const removed=await tskChatRemove(ds,ids,{expiredOnly:false,limit:25});
    // Named individually: this is the console's only unrecoverable action, and
    // an audit line saying "5 rooms" answers no question anybody would ask of
    // it afterwards.
    await auditLog(req,ss,'telegram.chat.admin.delete',{ids:removed,count:removed.length});
    return json({ok:true,deleted:removed.length,ids:removed});
  }

  if(action==='telegram.chat.close'){
    if(!isAdmin(ss)||!requireCsrf(b,ss))return json({ok:false,error:'unauthorized'},401);
    const conversation=await tskChatConversation(dataStore(),clean(b.conversation_id,100));
    if(!conversation)return json({ok:false,error:'not_found'},404);
    conversation.status='closed';await tskChatSave(dataStore(),conversation);return json({ok:true});
  }

  return json({ok:false,error:'not_found'},404);
};
