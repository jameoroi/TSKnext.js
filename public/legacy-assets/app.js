/* =========================================================================
   THAISERKIT SUPPLY — shared data + cart logic
   -------------------------------------------------------------------------
   การเชื่อมต่อ API จริง (NexGen Commerce / URBRAND) ให้แก้ที่ assets/config.js
   ไฟล์เดียว — ไม่ต้องแก้ไฟล์นี้ ยกเว้นถ้าโครงสร้างข้อมูลที่ API ส่งกลับมาไม่ตรงกับ
   ที่เดาไว้ ให้ปรับฟังก์ชัน mapNexgenProduct() / mapNexgenCategory() ด้านล่าง
   สินค้า Production อ่านจาก Supabase เท่านั้น ไม่มีสินค้าตัวอย่างฝังในไฟล์นี้
========================================================================= */

/* App loading experience: lightweight launch screen + native PWA install UI (mobile).
   On mobile it always shows on launch. On PC it only appears if loading is actually
   slow (after a short grace period), so fast page loads never flash the overlay. */
(function initAppLoadingExperience(){
  if(!document.body) return;
  const isMobile=window.matchMedia('(max-width:820px)').matches;
  const standalone=window.matchMedia('(display-mode:standalone)').matches || window.navigator.standalone===true;
  const loader=document.createElement('div');
  loader.className='tsk-app-loader';loader.setAttribute('role','status');loader.setAttribute('aria-live','polite');
  loader.innerHTML='<div class="tsk-app-loader-mark"><span></span></div><small>กำลังโหลด...</small><i aria-hidden="true"><b></b></i>';
  let shown=false,ready=false,loaderHidden=false,started=Date.now();
  function showLoader(){
    if(shown||ready)return;shown=true;started=Date.now();
    document.body.appendChild(loader);requestAnimationFrame(()=>loader.classList.add('is-visible'));
  }
  function hideLoader(){
    ready=true;if(loaderHidden)return;loaderHidden=true;
    if(!shown)return;
    setTimeout(()=>{loader.classList.add('is-done');setTimeout(()=>loader.remove(),420);},Math.max(0,(standalone?850:520)-(Date.now()-started)));
  }
  if(isMobile)showLoader();
  else setTimeout(showLoader,400); /* PC: only surface it once loading has taken a while */
  window.addEventListener('tsk:app-ready',hideLoader,{once:true});
  if(document.readyState==='complete')setTimeout(hideLoader,350);else window.addEventListener('load',()=>setTimeout(hideLoader,350),{once:true});
  setTimeout(hideLoader,5000);
  if(!isMobile)return; /* install prompt UI below stays mobile-only */
  if(standalone)return;
  const dismissedAt=Number(localStorage.getItem('tsk_install_prompt_dismissed')||0);
  if(Date.now()-dismissedAt<7*24*60*60*1000)return;
  let installEvent=null,promptMounted=false;const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  function mountInstallPrompt(mode){
    if(promptMounted||document.querySelector('.r75-entry-popup.is-visible')){if(!promptMounted)setTimeout(()=>mountInstallPrompt(mode),1800);return;}
    promptMounted=true;const wrap=document.createElement('div');wrap.className='tsk-install-prompt';
    wrap.innerHTML=`<section class="tsk-install-panel" role="dialog" aria-modal="true" aria-labelledby="tskInstallTitle"><button type="button" class="tsk-install-close" aria-label="ไว้ภายหลัง">×</button><img src="assets/icon-192.png" alt=""><div><small>ใช้งานได้เหมือนแอป</small><h2 id="tskInstallTitle">ติดตั้ง THAISERKIT ไหม?</h2><p>${mode==='ios'?'แตะปุ่มแชร์ใน Safari แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”':'เปิดร้านได้ไวจากหน้าจอหลัก ใช้พื้นที่น้อยและไม่เสียค่าใช้จ่าย'}</p></div><button type="button" class="tsk-install-primary">${mode==='ios'?'เข้าใจแล้ว':'ติดตั้งแอป'}</button><button type="button" class="tsk-install-later">ไว้ภายหลัง</button></section>`;
    document.body.appendChild(wrap);requestAnimationFrame(()=>wrap.classList.add('is-visible'));
    const close=()=>{localStorage.setItem('tsk_install_prompt_dismissed',String(Date.now()));wrap.classList.remove('is-visible');setTimeout(()=>wrap.remove(),320);};
    wrap.querySelector('.tsk-install-close').addEventListener('click',close);wrap.querySelector('.tsk-install-later').addEventListener('click',close);wrap.addEventListener('click',e=>{if(e.target===wrap)close();});
    wrap.querySelector('.tsk-install-primary').addEventListener('click',async()=>{if(mode==='ios'){close();return;}if(!installEvent){close();return;}installEvent.prompt();await installEvent.userChoice.catch(()=>null);installEvent=null;close();});
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;setTimeout(()=>mountInstallPrompt('native'),2800);});
  window.addEventListener('appinstalled',()=>localStorage.setItem('tsk_install_prompt_dismissed',String(Date.now())));
  if(isiOS)setTimeout(()=>mountInstallPrompt('ios'),3200);
})();

/* หมวดหมู่ตัวอย่างเริ่มต้น — ใช้ครั้งเดียวตอน "seed" เข้า localStorage ให้เป็นรายการที่แอดมิน
   จัดการได้ (ดู seedCategoriesOnce() ด้านล่าง) หลังจาก seed แล้ว หน้าเว็บทุกหน้าจะอ่านหมวดหมู่
   จาก getCategories() (รวมหมวดหมู่เดิม + หมวดหมู่ใหม่ที่แอดมินเพิ่มเอง) แทนอาเรย์นี้โดยตรง */
const DEFAULT_CATEGORIES = [
  { key:"tools",     name:"เครื่องมือช่าง",        icon:"wrench" },
  { key:"pump",      name:"ปั๊มน้ำ",               icon:"pump" },
  { key:"borewell",  name:"ปั๊มบาดาล",             icon:"bars" },
  { key:"pipe",      name:"ท่อ PE",                icon:"pipe" },
  { key:"power",     name:"เครื่องมือไฟฟ้า",        icon:"drill" },
  { key:"cordless",  name:"เครื่องมือช่างไร้สาย",   icon:"cordless" },
  { key:"garden",    name:"งานสวน",                icon:"plant" },
  { key:"trimmer",   name:"เครื่องตัดหญ้า",         icon:"trimmer" },
  { key:"agri",      name:"อุปกรณ์การเกษตร",       icon:"sprayer" },
  { key:"other",     name:"อื่นๆ",                 icon:"boxes" }
];
/* รายการหมวดหมู่ที่ใช้จริงทั้งเว็บ (เก่า+ใหม่รวมกัน หลัง seed) — ทุกหน้าควรเรียกฟังก์ชันนี้
   แทนการอ้างอิง DEFAULT_CATEGORIES ตรง ๆ */
function getCategories(){
  if(Array.isArray(window.TSK_SERVER_CATEGORIES) && window.TSK_SERVER_CATEGORIES_READY) return window.TSK_SERVER_CATEGORIES.slice();
  const list = (typeof getCategoryList === 'function') ? getCategoryList() : [];
  return list.length ? list : DEFAULT_CATEGORIES;
}

// The supplied brand files are a deterministic fallback for managed/API media.
const BRAND_LIBRARY=[{id:'bundled-brand-0',name:"Rinnai",img:'assets/brands/rinnai.png',source:'bundled-brand-library'},{id:'bundled-brand-1',name:"Bosch",img:'assets/brands/bosch.png',source:'bundled-brand-library'},{id:'bundled-brand-2',name:"Burkin",img:'assets/brands/burkin.png',source:'bundled-brand-library'},{id:'bundled-brand-3',name:"Dayuan",img:'assets/brands/dayuan.png',source:'bundled-brand-library'},{id:'bundled-brand-4',name:"DeWalt",img:'assets/brands/dewalt.png',source:'bundled-brand-library'},{id:'bundled-brand-5',name:"DOS Life",img:'assets/brands/dos.png',source:'bundled-brand-library'},{id:'bundled-brand-6',name:"Hitachi",img:'assets/brands/hitachi.png',source:'bundled-brand-library'},{id:'bundled-brand-7',name:"Honda",img:'assets/brands/honda.png',source:'bundled-brand-library'},{id:'bundled-brand-8',name:"Hugong",img:'assets/brands/hugong.png',source:'bundled-brand-library'},{id:'bundled-brand-9',name:"Jasic",img:'assets/brands/jasic.png',source:'bundled-brand-library'},{id:'bundled-brand-10',name:"Jets",img:'assets/brands/jets.png',source:'bundled-brand-library'},{id:'bundled-brand-11',name:"Kaisei",img:'assets/brands/kaisei.png',source:'bundled-brand-library'},{id:'bundled-brand-12',name:"Lucky Pro",img:'assets/brands/luckypro.png',source:'bundled-brand-library'},{id:'bundled-brand-13',name:"Makita",img:'assets/brands/makita.png',source:'bundled-brand-library'},{id:'bundled-brand-14',name:"Maruyama",img:'assets/brands/maruyama.png',source:'bundled-brand-library'},{id:'bundled-brand-15',name:"Milwaukee",img:'assets/brands/milwaukee.png',source:'bundled-brand-library'},{id:'bundled-brand-16',name:"Mitsubishi",img:'assets/brands/mitsubishi.png',source:'bundled-brand-library'},{id:'bundled-brand-17',name:"Mr. Pump",img:'assets/brands/mrpump.png',source:'bundled-brand-library'},{id:'bundled-brand-18',name:"Osuka",img:'assets/brands/osuka.png',source:'bundled-brand-library'},{id:'bundled-brand-19',name:"Polo",img:'assets/brands/polo.png',source:'bundled-brand-library'},{id:'bundled-brand-20',name:"Puma",img:'assets/brands/puma.png',source:'bundled-brand-library'},{id:'bundled-brand-21',name:"Pumpkin",img:'assets/brands/pumpkin.png',source:'bundled-brand-library'},{id:'bundled-brand-22',name:"Rowel",img:'assets/brands/rowel.png',source:'bundled-brand-library'},{id:'bundled-brand-23',name:"SATA",img:'assets/brands/sata.png',source:'bundled-brand-library'},{id:'bundled-brand-24',name:"Stanley",img:'assets/brands/stanley.png',source:'bundled-brand-library'},{id:'bundled-brand-25',name:"Super Pump",img:'assets/brands/super pump.png',source:'bundled-brand-library'},{id:'bundled-brand-26',name:"Torque",img:'assets/brands/torque.png',source:'bundled-brand-library'},{id:'bundled-brand-27',name:"Valu",img:'assets/brands/valu.png',source:'bundled-brand-library'},{id:'bundled-brand-28',name:"Wadfow",img:'assets/brands/wadfow.png',source:'bundled-brand-library'},{id:'bundled-brand-29',name:"Wasabi",img:'assets/brands/wasabi.png',source:'bundled-brand-library'},{id:'bundled-brand-30',name:"Welpro",img:'assets/brands/welpro.png',source:'bundled-brand-library'},{id:'bundled-brand-31',name:"Zapp",img:'assets/brands/zapp.png',source:'bundled-brand-library'},{id:'bundled-brand-32',name:"Zinsano",img:'assets/brands/zinsano.png',source:'bundled-brand-library'}];
if(typeof window!=='undefined')window.TSK_BRAND_LIBRARY=BRAND_LIBRARY;
const BRAND_LIBRARY_BY_NAME=new Map(BRAND_LIBRARY.map(item=>[String(item.name||'').trim().toLowerCase(),item]));
const BRAND_NAME_ALIASES={jet:'jets'};
const LOCAL_BANNER_LIBRARY=['assets/banners/1.png','assets/banners/2.png','assets/banners/3.png','assets/banners/4.png','assets/banners/5.png','assets/banners/6.png'];
const BRAND_ASSET_ALIASES={'assets/brands/rinnai.png':'assets/brands/26.png','assets/brands/torque.png':'assets/brands/toque.png'};
function brandAssetCandidates(brand){
  const name=String(brand?.name||'').trim().toLowerCase();
  const local=BRAND_LIBRARY_BY_NAME.get(BRAND_NAME_ALIASES[name]||name);
  const requested=String(brand?.img||brand?.logo_data_url||'').trim();
  const requestedAsset=BRAND_ASSET_ALIASES[requested]||requested;
  const localAsset=BRAND_ASSET_ALIASES[local?.img]||local?.img;
  return Array.from(new Set([requestedAsset,localAsset].filter(Boolean)));
}
const BRANDS = [];
/* รายชื่อแบรนด์ทั้งหมดที่เลือกได้ตอนเพิ่มสินค้า — อ่านจากรายการแบรนด์ที่จัดการได้ (getBrandList(),
   เก่า+ใหม่รวมกันหลัง seed) ถ้ายังไม่ seed (หรือเรียกจากที่ที่ไม่มี store.js) จะได้รายการว่าง */
function allBrandNames(){
  if(Array.isArray(window.TSK_SERVER_BRANDS) && window.TSK_SERVER_BRANDS_READY) return Array.from(new Set(window.TSK_SERVER_BRANDS.map(b=>b.name).filter(Boolean)));
  const adminNames = (typeof getBrandList === 'function') ? getBrandList().map(b=>b.name).filter(Boolean) : [];
  return Array.from(new Set([...(adminNames.length ? [] : BRANDS), ...adminNames]));
}
const BRAND_COLORS = {};

const CATEGORY_ICONS = {
  wrench:   `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94Z"/>`,
  pump:     `<path d="M12 3.5c3 3.3 5.5 6.4 5.5 9.5a5.5 5.5 0 1 1-11 0c0-3.1 2.5-6.2 5.5-9.5Z"/><path d="M9 14.5c0 1.4 1.1 2.5 2.5 2.5"/>`,
  bars:     `<path d="M12 3v8"/><path d="m8 8 4 4 4-4"/><path d="M4 21h16"/><path d="M6 21v-5M12 21v-3M18 21v-6"/>`,
  pipe:     `<rect x="3" y="10" width="14" height="4" rx="2"/><circle cx="6" cy="12" r="1"/><path d="M17 10v4"/><path d="M17 11h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2"/>`,
  drill:    `<path d="M2 9.5h7v5H2z"/><path d="M9 10.5h5.5l4.5 1.5v1L14.5 14.5H9"/><path d="M6 14.5V18"/><path d="M4 18h4"/>`,
  cordless: `<rect x="6" y="4" width="12" height="16" rx="2.4"/><path d="M9.5 4V2.4h5V4"/><path d="M13.2 8.2 9.8 12.6h2.6l-1 3.4 3.9-4.8h-2.6l1-3Z"/>`,
  plant:    `<path d="M12 21v-8.2"/><path d="M12 12.8C6.8 12.8 5 8.7 5 4.6c5.6 0 7.4 3 7 8.2Z"/><path d="M12 12.8c5.2 0 7-4.1 7-8.2-5.6 0-7.4 3-7 8.2Z"/><path d="M7.5 21h9"/>`,
  trimmer:  `<circle cx="12" cy="18.5" r="2"/><path d="M12 16.5V4"/><path d="M8 4h8" stroke-linecap="round"/><path d="m7 8 4-2M17 8l-4-2"/>`,
  sprayer:  `<rect x="6.5" y="6" width="10" height="13" rx="2.2"/><path d="M9 6V3.6h5V6"/><path d="M16.5 9.6h2.7l1.3 2"/><path d="M12 19v2.6"/>`,
  boxes:    `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`
};
function categoryIconSvg(iconKey){
  const key = CATEGORY_ICONS[iconKey] ? iconKey : 'boxes';
  return `<svg class="cat-ic cat-ic-${key}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${CATEGORY_ICONS[key]}</svg>`;
}

// Production catalog lives exclusively in Supabase. No bundled demo products.
const PRODUCTS = [];
/* ---------- data access (this is what pages call — do not edit) ---------- */
let _productsData = PRODUCTS;
let _bannersData = [];
let _dataReady = false;

function getProducts(){
  if(Array.isArray(window.TSK_SERVER_CATALOG_PRODUCTS) && window.TSK_SERVER_CATALOG_PRODUCTS_READY) return window.TSK_SERVER_CATALOG_PRODUCTS.slice();
  // Never resurrect stale demo rows from a visitor's localStorage while the
  // production API is starting or temporarily unavailable.
  return [];
}
function getBanners(){
  const server = Array.isArray(window.TSK_SERVER_BANNERS) ? window.TSK_SERVER_BANNERS.filter(Boolean) : [];
  const stored = server.length ? server : (Array.isArray(_bannersData) ? _bannersData.filter(Boolean) : []);
  const list = stored.length ? stored : LOCAL_BANNER_LIBRARY.map(img=>({img,candidates:[img],source:'local-fallback'}));
  return list.map(b=>({
    ...b,
    candidates:Array.from(new Set([
      ...(Array.isArray(b.candidates)?b.candidates:[]),
      ...(b.img?[b.img]:[]),
      ...LOCAL_BANNER_LIBRARY
    ].filter(Boolean)))
  }));
}
function getProductById(id){ return getProducts().find(p=>p.id===id); }
function getCategoryName(key){ const c=getCategories().find(c=>c.key===key); return c?c.name:key; }
function formatPrice(n){ return n.toLocaleString('th-TH') + '.-'; }

/* ---------- live API calls (reads config from assets/config.js) ---------- */
function buildAuthHeaders(cfg){
  const headers = { "Accept":"application/json" };
  if(cfg.apiKey){ headers[cfg.apiKeyHeader] = (cfg.apiKeyPrefix||"") + cfg.apiKey; }
  return headers;
}

async function fetchLiveProducts(){
  const cfg = API_CONFIG.nexgen;
  if(!cfg.baseUrl || !cfg.productsEndpoint){ return null; }
  try{
    const res = await fetch(cfg.baseUrl + cfg.productsEndpoint, { headers: buildAuthHeaders(cfg) });
    if(!res.ok) throw new Error("NexGen API responded " + res.status);
    const data = await res.json();
    // INTEGRATION POINT: โครงสร้าง response จริงของ NexGen อาจไม่ตรงกับที่เดาไว้นี้
    // ปรับ mapNexgenProduct() ด้านล่างให้ตรงกับ field จริงที่ API ส่งกลับมา
    const rawList = Array.isArray(data) ? data : (data.items || data.data || data.products || []);
    const mapped = rawList.map(mapNexgenProduct).filter(Boolean);
    return mapped.length ? mapped : null;
  }catch(err){
    console.warn("[NexGen] โหลดสินค้าจริงไม่สำเร็จ ใช้ข้อมูลตัวอย่างแทน:", err);
    return null;
  }
}

function mapNexgenProduct(raw){
  if(!raw) return null;
  return {
    id: String(raw.id ?? raw.sku ?? raw.product_id ?? crypto.randomUUID()),
    brand: raw.brand ?? raw.brand_name ?? "",
    category: mapNexgenCategory(raw.category ?? raw.category_id ?? raw.category_name),
    name: raw.name ?? raw.product_name ?? "",
    price: Number(raw.price ?? raw.sale_price ?? 0),
    oldPrice: raw.compare_price ? Number(raw.compare_price) : (raw.original_price ? Number(raw.original_price) : null),
    status: raw.tags ?? raw.labels ?? [],
    sku: raw.sku ?? raw.code ?? "",
    img: raw.image ?? raw.image_url ?? raw.thumbnail ?? "",
    desc: raw.description ?? raw.detail ?? "",
    specs: raw.attributes ?? raw.specs ?? {}
  };
}

function mapNexgenCategory(catFromApi){
  // INTEGRATION POINT: จับคู่รหัส/ชื่อหมวดหมู่ของ NexGen กับ key ของเว็บนี้
  // (ดูหมวดหมู่ทั้งหมดที่ใช้ได้จากแท็บ "หมวดหมู่" ในหน้าแอดมิน หรือ getCategories())
  const table = {
    // "รหัสหรือชื่อหมวดหมู่จาก NexGen": "key ของเว็บนี้"
    // ตัวอย่าง: "1001": "tools", "เครื่องมือไฟฟ้า": "power",
  };
  return table[catFromApi] || "other";
}

async function fetchLiveBanners(){
  const cfg = API_CONFIG.urbrand;
  if(!cfg.baseUrl || !cfg.bannersEndpoint){ return null; }
  try{
    const res = await fetch(cfg.baseUrl + cfg.bannersEndpoint, { headers: buildAuthHeaders(cfg) });
    if(!res.ok) throw new Error("URBRAND API responded " + res.status);
    const data = await res.json();
    // INTEGRATION POINT: ปรับให้ตรงกับ field จริงที่ URBRAND ส่งกลับมา
    const rawList = Array.isArray(data) ? data : (data.banners || data.items || data.data || []);
    const mapped = rawList.map(b=>({
      img: b.image_url ?? b.image ?? b.banner_url ?? "",
      link: b.link_url ?? b.link ?? null
    })).filter(b=>b.img);
    return mapped.length ? mapped : null;
  }catch(err){
    console.warn("[URBRAND] โหลดแบนเนอร์จริงไม่สำเร็จ ใช้ข้อมูลตัวอย่างแทน:", err);
    return null;
  }
}

/* ---------- one-time seeding: โอนหมวดหมู่/แบรนด์/แบนเนอร์ตัวอย่างเดิมเข้าเป็นรายการ
   ที่แอดมินจัดการได้ (localStorage) — ทำครั้งเดียวตอนเปิดเว็บครั้งแรกเท่านั้น เพื่อให้ของเดิม
   และของใหม่ที่แอดมินเพิ่มเองอยู่ในรายการเดียวกันทั้งหมด แก้ไข/ลบ/เพิ่มได้จากที่เดียวในหน้าแอดมิน */
function seedCategoriesOnce(){
  if(typeof isSeeded !== 'function' || isSeeded('tsk_categories_seeded')) return;
  saveCategoryList(DEFAULT_CATEGORIES.map(c=>({ ...c })));
  markSeeded('tsk_categories_seeded');
}
/* โอนสินค้าตัวอย่างเดิม (อาเรย์ PRODUCTS ด้านบน) เข้าเป็นรายการที่แอดมินจัดการได้ในหน้าแอดมิน
   ทำครั้งเดียวตอนเปิดเว็บครั้งแรกเท่านั้น หลังจากนี้สินค้าทุกชิ้น (เดิม+ใหม่) แก้ไข/ลบ/ดูได้
   จากแท็บ "สินค้า" ในหน้าแอดมินทั้งหมด ไม่ต้องแก้โค้ดอีกต่อไป */
function seedProductsOnce(){
  if(typeof isSeeded !== 'function' || isSeeded('tsk_demo_products_removed_r79')) return;
  saveAdminProductList([]);
  markSeeded('tsk_demo_products_removed_r79');
}
function optimizedBundledProductPathR71(value){
  const path = String(value||'');
  return /^(?:\.\/)?assets\/products\/[A-Za-z0-9_./%+@() -]+\.png(?:\?v=\d+)?$/i.test(path)
    ? path.replace(/\.png(?:\?v=\d+)?$/i,'.webp?v=71')
    : value;
}
function upgradeBundledProductMediaR71(){
  if(typeof isSeeded !== 'function' || isSeeded('tsk_product_media_r71')) return;
  const existing = (typeof getAdminProductList === 'function' ? getAdminProductList() : []).filter(Boolean);
  if(existing.length){
    const upgraded = existing.map(item=>({
      ...item,
      img:optimizedBundledProductPathR71(item.img),
      images:Array.isArray(item.images) ? item.images.map(optimizedBundledProductPathR71) : item.images,
      detailImages:Array.isArray(item.detailImages) ? item.detailImages.map(optimizedBundledProductPathR71) : item.detailImages
    }));
    saveAdminProductList(upgraded);
  }
  markSeeded('tsk_product_media_r71');
}
async function seedBrandsOnce(){
  const existing = (typeof getBrandList === 'function' ? getBrandList() : []).filter(Boolean);
  const library=(typeof window!=='undefined'&&Array.isArray(window.TSK_BRAND_LIBRARY))?window.TSK_BRAND_LIBRARY:[];
  const byName=new Map(existing.filter(item=>!/^https:\/\/placehold\.co\//i.test(String(item.img||item.logo_data_url||''))).map(item=>[String(item.name||'').toLowerCase(),item]));
  for(const item of library){const key=String(item.name||'').toLowerCase();if(key&&!byName.has(key))byName.set(key,item);}
  saveBrandList([...byName.values()]);
  markSeeded('tsk_brands_seeded_r71');
  markSeeded('tsk_brands_seeded_r70');
  markSeeded('tsk_brands_seeded');
}
async function seedBannersOnce(){
  const existing = (typeof getBannerList === 'function' ? getBannerList() : []).filter(Boolean);
  saveBannerList(existing.filter(item=>!/(?:^|\/)assets\/banner\//i.test(String(item.img||''))));
  markSeeded('tsk_banners_seeded_r71');
  markSeeded('tsk_banners_seeded');
}

/* Call once per page, before rendering anything that needs products/categories/brands/banners.
   Falls straight through to the sample data above if useLiveData is off or
   the live call fails, so the site never breaks while waiting on real API access. */
async function initSiteData(){
  if(_dataReady) return;
  _bannersData = LOCAL_BANNER_LIBRARY.map(img=>({img,candidates:[img],source:'local-fallback'}));
  // seed หมวดหมู่/แบรนด์/แบนเนอร์/สินค้าตัวอย่างเดิมเข้าเป็นรายการที่แอดมินจัดการได้ (ทำครั้งเดียว)
  await Promise.all([seedCategoriesOnce(), seedBrandsOnce(), seedBannersOnce(), seedProductsOnce(), upgradeBundledProductMediaR71()]);

  let liveBanners = null;
  if(API_CONFIG.useLiveData){
    const [liveProducts, lb] = await Promise.all([fetchLiveProducts(), fetchLiveBanners()]);
    if(liveProducts) _productsData = liveProducts;
    liveBanners = lb;
  }
  // Production source of truth: load the public catalog and site settings before
  // resolving banners, otherwise an uploaded banner disappears after refresh.
  if(window.tskEnableServerCatalog){ await window.tskEnableServerCatalog(); }
  const serverBanners = Array.isArray(window.TSK_SERVER_BANNERS) ? window.TSK_SERVER_BANNERS.filter(b=>b&&b.img) : [];
  // ลำดับความสำคัญของแบนเนอร์: API จริง, server settings, admin cache, local fallback
  if(liveBanners && liveBanners.length){
    _bannersData = liveBanners;
  } else {
    const adminBanners = serverBanners.length ? serverBanners : (typeof getBannerList === 'function' ? getBannerList() : []).filter(b=>b && b.img);
    if(adminBanners.length) _bannersData = adminBanners.map(b=>({ ...b, img:b.img, candidates:Array.from(new Set([...(Array.isArray(b.candidates)?b.candidates:[]),b.img].filter(Boolean))) }));
  }
  _dataReady = true;
}

/* ---------- robust image loader: tries several file extensions/aliases ----------
   ใช้กับโลโก้บริษัทและโลโก้แบรนด์ — เผื่อไฟล์จริงเป็น .jpg/.jpeg/.webp/.svg แทน .png
   ไม่ต้องกังวลเรื่องนามสกุลไฟล์หรือชื่อไฟล์เพี้ยนเล็กน้อย ระบบจะลองไล่ให้เอง */
function tryNextImg(img){
  let list = [];
  try{ list = JSON.parse(img.dataset.candidates || "[]"); }catch(e){}
  if(list.length){
    img.src = list.shift();
    img.dataset.candidates = JSON.stringify(list);
  } else {
    img.style.display = 'none';
    const fb = img.nextElementSibling;
    if(fb) fb.classList.add('show');
  }
}
if(typeof window!=='undefined'){
  // Inline storefront markup and onerror handlers run outside this bundle's
  // scope after production minification, so keep these two helpers public.
  window.brandAssetCandidates=brandAssetCandidates;
  window.tryNextImg=tryNextImg;
}
function robustImgTag(candidates, alt, extraAttrs){
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if(!list.length) return '';
  const first = list[0];
  const rest = JSON.stringify(list.slice(1)).replace(/'/g,"&#39;");
  return `<img src="${first}" alt="${alt}" data-candidates='${rest}' onerror="tryNextImg(this)" ${extraAttrs||''}>`;
}
function companyLogoCandidates(){
  const logo=String(window.TSK_SITE_SETTINGS?.logo_data_url||'').trim();
  return /^(?:https:\/\/|data:image\/)/i.test(logo) ? [logo] : [];
}

/* ==========================================================================
   แจ้งเตือนผ่าน Telegram (ไม่ต้องมีเซิร์ฟเวอร์/hosting ก็ใช้ได้ทันที)
   -------------------------------------------------------------------------
   ใช้แจ้งเตือนแอดมินทันทีที่มีคนสั่งซื้อ หรือส่งข้อความติดต่อเรา — เรียก Telegram
   Bot API ตรงจากเบราว์เซอร์ลูกค้าได้เลย ไม่ต้องมี backend เพราะ Telegram อนุญาต
   ให้เรียกจากเว็บได้ (ดูวิธีตั้งค่า botToken/chatId ในไฟล์ assets/config.js)
   ⚠️ ข้อจำกัดที่ควรรู้: botToken จะฝังอยู่ในโค้ดฝั่งเบราว์เซอร์ (ใครก็เปิดดูได้ผ่าน
   DevTools) คนอื่นอาจเอาไปยิงข้อความเข้าบอทตัวเองปลอมๆ ได้ (แต่ทำอะไรกับร้านไม่ได้
   นอกจากส่งข้อความก่อกวน) เหมาะเป็นจุดเริ่มต้นตอนยังไม่มี hosting — พอมีเซิร์ฟเวอร์
   จริงแล้ว ควรย้ายการยิง Telegram ไปทำฝั่งเซิร์ฟเวอร์แทนเพื่อความปลอดภัยที่ดีขึ้น ========================================================================= */
async function sendTelegramNotify(text, photoDataUrl){
  console.warn('[Telegram] Production mode uses server-side Telegram notifications configured in Cloudflare Pages environment variables.');
  return false;
}

/* ------------------------------- cart ----------------------------------- */
const CART_KEY = "tsk_cart";
function getCart(){
  try{ return JSON.parse(localStorage.getItem(CART_KEY)) || []; }catch(e){ return []; }
}
function saveCart(cart){ localStorage.setItem(CART_KEY, JSON.stringify(cart)); updateCartBadge(); }
function cartItemKey(itemOrId, variantId=''){
  if(itemOrId && typeof itemOrId==='object') return `${itemOrId.id}::${itemOrId.variant_id||''}`;
  return `${itemOrId}::${variantId||''}`;
}
function productVariant(product,variantId=''){
  const variants=Array.isArray(product?.variants)?product.variants:[];
  return variants.find(v=>String(v.id)===String(variantId))||variants.find(v=>v.is_default)||variants[0]||null;
}
/* สต็อกเป็น optional: p.stock === null/undefined แปลว่า "ไม่จำกัด/ไม่ติดตามสต็อก" (พฤติกรรมเดิม)
   ถ้าแอดมินใส่ตัวเลขไว้ ระบบจะไม่ให้เพิ่มลงตะกร้าเกินจำนวนที่เหลือ เหมือน Shopee/Lazada */
function addToCart(id, qty=1, variantId=''){
  const product = getProductById(id);
  const variant = productVariant(product,variantId);
  const stock = variant ? variant.stock : product?.stock;
  const selectedVariantId = variant?.id || variantId || '';
  const cart = getCart();
  const existing = cart.find(c=>cartItemKey(c)===cartItemKey(id,selectedVariantId));
  const currentQty = existing ? existing.qty : 0;
  let toastMsg = "เพิ่มสินค้าลงตะกร้าแล้ว";
  if(product && stock !== undefined && stock !== null){
    if(stock <= 0){ showToast("สินค้าหมดสต็อก"); return; }
    if(currentQty >= stock){ showToast(`เพิ่มไม่ได้แล้ว — มีสต็อกแค่ ${stock} ชิ้น`); return; }
    if(currentQty + qty > stock){
      qty = stock - currentQty;
      toastMsg = `เพิ่มได้สูงสุด ${stock} ชิ้นตามสต็อกคงเหลือ`;
    }
  }
  if(existing){ existing.qty += qty; } else { cart.push({ id,variant_id:selectedVariantId,sku:variant?.sku||product?.sku||'',barcode:variant?.barcode||product?.barcode||'', qty }); }
  saveCart(cart);
  showToast(toastMsg);
}
function removeFromCart(keyOrId,variantId=''){
  const exact=String(keyOrId).includes('::')?String(keyOrId):cartItemKey(keyOrId,variantId);
  saveCart(getCart().filter(c=>cartItemKey(c)!==exact));
}
function updateCartQty(keyOrId, qty,variantId=''){
  const cart = getCart();
  const exact=String(keyOrId).includes('::')?String(keyOrId):cartItemKey(keyOrId,variantId);
  const item = cart.find(c=>cartItemKey(c)===exact);
  if(!item) return;
  let q = Math.max(1, qty);
  const product = getProductById(item.id),variant=productVariant(product,item.variant_id),stock=variant?variant.stock:product?.stock;
  if(product && stock !== undefined && stock !== null){
    if(stock <= 0){ showToast("สินค้าหมดสต็อก"); return; }
    q = Math.min(q, stock);
  }
  item.qty = q;
  saveCart(cart);
}
function cartCount(){ return getCart().reduce((s,c)=>s+c.qty,0); }
function cartItemsWithProduct(){
  return getCart().map(c=>{const base=getProductById(c.id);if(!base)return null;const variant=productVariant(base,c.variant_id);const product=variant?{...base,sku:variant.sku||base.sku,barcode:variant.barcode||base.barcode,price:Number(variant.price??base.price)||0,oldPrice:variant.oldPrice??base.oldPrice,stock:variant.stock,variant_label:variant.label}:base;return {...c,variant,cart_key:cartItemKey(c),product};}).filter(Boolean);
}
function cartSubtotal(){
  return cartItemsWithProduct().reduce((s,c)=>s + c.product.price*c.qty, 0);
}
function updateCartBadge(){
  document.querySelectorAll('.js-cart-count').forEach(el=>{ el.textContent = cartCount(); el.classList.add('pulse'); setTimeout(()=>el.classList.remove('pulse'), 450); });
}
function showToast(msg){
  let t = document.querySelector('.toast');
  if(!t){
    t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 13 4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span>`;
    document.body.appendChild(t);
  }
  t.querySelector('span').textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* ---------------------------- render helpers ----------------------------- */
function escapeHtml(v){ return String(v??'').replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"}[ch])); }
const EMPTY_IMAGE_SRC='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
function safeAssetUrl(v){ const x=String(v||''); if(/^data:image\/(png|jpeg|webp|gif);base64,/i.test(x)) return x; if(/^https:\/\//i.test(x)) return x; if(/^(?:\.\/)?assets\/[A-Za-z0-9_./%+@() -]+(?:\?v=\d+)?$/i.test(x)) return x; return EMPTY_IMAGE_SRC; }
document.addEventListener('error',event=>{
  const image=event.target;
  if(!(image instanceof HTMLImageElement) || !image.matches('.prod-img img')) return;
  const frame=image.closest('.prod-img');
  if(frame){ frame.classList.add('image-unavailable'); image.alt=''; }
},true);
// Public image deterrence: keep product names/descriptions selectable while
// preventing casual right-click saving and drag-copying of storefront images.
if(!/^\/(?:admin|owner-console|inventory|reports)/.test(location.pathname)){
  document.addEventListener('dragstart',event=>{if(event.target instanceof HTMLImageElement)event.preventDefault();},true);
  document.addEventListener('contextmenu',event=>{if(event.target instanceof HTMLImageElement)event.preventDefault();},true);
}
function productCardHtml(p){
  const outOfStock = (p.stock !== undefined && p.stock !== null && p.stock <= 0);
  const currentPrice=Number(p.price)||0,previousPrice=Number(p.oldPrice)||0;
  const discountPercent=previousPrice>currentPrice&&currentPrice>0?Math.max(1,Math.round((previousPrice-currentPrice)*100/previousPrice)):0;
  const tag = outOfStock ? `<span class="prod-tag out">สินค้าหมด</span>`
            : discountPercent ? `<span class="prod-tag sale">-${discountPercent}%</span>`
            : (p.status||[]).includes("สินค้าลดราคา") ? `<span class="prod-tag sale">ลดราคา</span>`
            : (p.status||[])[0] ? `<span class="prod-tag">${escapeHtml((p.status||[])[0])}</span>` : "";
  const pid=encodeURIComponent(String(p.id||'')), pname=escapeHtml(p.name), pbrand=escapeHtml(p.brand), pimg=safeAssetUrl(p.img);
  return `
  <div class="prod-card${outOfStock?' out-of-stock':''}">
    ${tag}
    <div class="tsk-card-actions"><button type="button" class="tsk-round-action" title="รายการโปรด" aria-label="รายการโปรด" onclick="event.preventDefault();tskToggleWishlist(decodeURIComponent('${pid}'),this)">♡</button><button type="button" class="tsk-round-action" title="เปรียบเทียบ" aria-label="เปรียบเทียบ" onclick="event.preventDefault();tskToggleCompare(decodeURIComponent('${pid}'))">⇄</button><button type="button" class="tsk-round-action tsk-quick-button" title="ดูสินค้าแบบย่อ" aria-label="ดู ${pname} แบบย่อ" onclick="event.preventDefault();tskOpenQuickView(decodeURIComponent('${pid}'),this)">⌕</button></div>
    <a href="product.html?id=${pid}">
      <div class="prod-img" data-product-name="${pname}"><img src="${pimg}" alt="${pname}" loading="lazy" decoding="async" sizes="(max-width:640px) 46vw,(max-width:1100px) 30vw,260px"></div>
    </a>
    <div class="prod-info">
      <div class="p-brand">${pbrand}</div>
      <a href="product.html?id=${pid}"><div class="p-name">${pname}</div></a>
      <div class="prod-bottom">
        <div class="p-price-wrap">
          ${discountPercent ? `<span class="p-price-old">${formatPrice(p.oldPrice)}</span>` : ""}
          <span class="p-price">${formatPrice(p.price)}</span>
        </div>
        <button type="button" class="p-cart" aria-label="เพิ่ม ${pname} ลงตะกร้า" onclick="addToCart(decodeURIComponent('${pid}'),1)" ${outOfStock?'disabled':''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 7h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>
        </button>
      </div>
    </div>
  </div>`;
}

document.addEventListener('DOMContentLoaded', updateCartBadge);

/* ---- scroll reveal: add class="reveal" to any element to fade/slide it in ---- */
function initScrollReveal(root){
  const els = (root||document).querySelectorAll('.reveal:not(.in)');
  if(!('IntersectionObserver' in window)){ els.forEach(el=>el.classList.add('in')); return; }
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold:0.12, rootMargin:"0px 0px -40px 0px" });
  els.forEach(el=>io.observe(el));
}

/* ---- lightweight skeleton cards shown while product data is loading ---- */
function skeletonCardsHtml(count){
  return Array.from({length:count}).map(()=>`
    <div class="skeleton-card">
      <div class="sk-img"></div>
      <div class="sk-line"></div>
      <div class="sk-line short"></div>
    </div>`).join('');
}

