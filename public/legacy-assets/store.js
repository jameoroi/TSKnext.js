/* =========================================================================
   THAISERKIT SUPPLY — CONTENT STORE (ข่าวสาร/โปรโมชั่น, วิดีโอ, บทความ)
   -------------------------------------------------------------------------
   Authentication, customer profiles, orders and admin mutations are server-owned.
   The local store below is retained only for non-sensitive presentation migration
   and offline UI state; it is never an authentication or authorization source.
========================================================================= */

/* ------------------------------- SERVER AUTH + ROLES/สิทธิ์ ------------------------------ */
/*
 * Authentication is server-owned. This file intentionally contains no
 * credential persistence: browser storage is not an authentication store.
 */
const ADMIN_MODULES = [
  { key:"products",    label:"สินค้า" },
  { key:"categories",  label:"หมวดหมู่สินค้า" },
  { key:"news",        label:"ข่าวสารและโปรโมชั่น" },
  { key:"videos",      label:"วิดีโอ" },
  { key:"articles",    label:"บทความ" },
  { key:"media",       label:"แบนเนอร์ & แบรนด์" },
  { key:"marketplace", label:"เชื่อมต่อร้านค้า (Shopee/Lazada)" },
  { key:"settings",    label:"ตั้งค่าเว็บไซต์ (แบนเนอร์ประกาศ)" }
];
const ALL_MODULE_KEYS = ADMIN_MODULES.map(m=>m.key);

function getAdminAccount(){
  const username=sessionStorage.getItem('tsk_server_admin_username')||'';
  return { username, password:'' };
}
async function adminLogin(username, password){
  if(!window.tskAdminLogin) return {ok:false,error:'auth_client_unavailable'};
  return window.tskAdminLogin(String(username||'').trim(),String(password||''));
}
async function adminLogout(){
  try{if(window.tskAdminLogout)return await window.tskAdminLogout();}
  finally{sessionStorage.removeItem('tsk_server_admin');sessionStorage.removeItem('tsk_server_admin_role');sessionStorage.removeItem('tsk_server_admin_username');}
  return null;
}
function isAdminLoggedIn(){
  return sessionStorage.getItem('tsk_server_admin')==='1';
}
function currentAdminSession(){
  if(sessionStorage.getItem('tsk_server_admin')==='1'){
    const role=sessionStorage.getItem('tsk_server_admin_role')||'admin';
    return {username:sessionStorage.getItem('tsk_server_admin_username')||'server-admin',name:role==='super_admin'?'เจ้าของระบบ':'ผู้ดูแลระบบ',role,permissions:ALL_MODULE_KEYS.slice(),isOwner:role==='super_admin',at:Date.now()};
  }
  return null;
}
function currentAdminUsername(){
  const s = currentAdminSession(); return s ? s.username : null;
}
function currentAdminRole(){
  const s = currentAdminSession(); return s ? s.role : null;
}
/* true ถ้าบัญชีที่ล็อกอินอยู่ตอนนี้ทำสิ่งนั้นได้ — role "admin" ทำได้ทุกอย่างเสมอ
   role "support" ทำได้เฉพาะโมดูลที่ถูกเลือกไว้ตอนสร้าง/แก้ไขบัญชีเท่านั้น */
function hasPermission(moduleKey){
  const s = currentAdminSession();
  if(!s) return false;
  if(s.role === 'admin' || s.role === 'super_admin') return true;
  return (s.permissions||[]).includes(moduleKey);
}
function isAdminRole(){ return ['admin','super_admin'].includes(currentAdminRole()); }

async function changeAdminPassword(oldPassword, newPassword){
  if(!window.tskAdminPasswordChange)return {ok:false,error:'auth_client_unavailable'};
  return window.tskAdminPasswordChange(oldPassword,newPassword);
}
/* redirect helper — วางไว้บนสุดของหน้าแอดมินที่ต้องล็อกอินก่อนถึงจะเข้าได้ */
function requireAdminOrRedirect(){
  // Cloudflare Pages middleware is the authoritative gate for protected
  // documents. Do not redirect a valid server session merely because the
  // client-side session cache has not hydrated yet; bootAdmin() calls the
  // server API immediately and the API enforces the same role boundary.
  const path=String(window.location.pathname||'');
  const protectedDocument=/\/(?:admin(?:\.html)?|admin-settings(?:\.html)?|inventory(?:\.html)?|reports(?:\.html)?|network-ops(?:\.html)?|owner-console(?:\.html)?)$/.test(path);
  if(protectedDocument)return true;
  if(!isAdminLoggedIn()){
    window.location.href = "login.html?next=admin";
    return false;
  }
  return true;
}

/* ------------------------------- CUSTOMER (สมาชิกลูกค้า) AUTH -------------------------------
   ระบบสมาชิกฝั่งลูกค้า — เก็บบัญชี/เซสชันไว้ใน localStorage ของเบราว์เซอร์เครื่องนั้น ๆ
   (รูปแบบเดียวกับระบบแอดมินด้านบน) ใช้สำหรับสาธิต/ใช้งานเบื้องต้นโดยไม่ต้องมีเซิร์ฟเวอร์
   สำหรับใช้งานจริงระยะยาว ควรต่อกับฐานข้อมูลสมาชิกฝั่งเซิร์ฟเวอร์จริงในภายหลัง */
const CUSTOMER_ORDERS_KEY = "tsk_customer_orders";
async function registerCustomer(fields){
  if(!window.tskCustomerRegister)return {ok:false,error:'auth_client_unavailable'};
  return window.tskCustomerRegister(fields);
}
async function customerLogin(identifier,password){
  if(!window.tskCustomerLogin)return {ok:false,error:'auth_client_unavailable'};
  return window.tskCustomerLogin(identifier,password);
}
async function customerLogout(){
  try{if(window.tskCustomerLogout)return await window.tskCustomerLogout();}
  finally{sessionStorage.removeItem('tsk_server_customer');}
  return null;
}
function isCustomerLoggedIn(){
  return !!sessionStorage.getItem('tsk_server_customer');
}
function currentCustomer(){
  try{ const s=sessionStorage.getItem('tsk_server_customer'); if(s) return JSON.parse(s); }catch(e){}
  return null;
}

/* แก้ไขข้อมูลโปรไฟล์ (ชื่อ/อีเมล/เบอร์/ที่อยู่/จังหวัด/รหัสไปรษณีย์) ของสมาชิกที่ล็อกอินอยู่
   คืนค่า { ok:true } เสมอถ้ามีเซสชันอยู่ — ใช้กับทั้งบัญชีทดสอบและบัญชีที่สมัครเอง */
async function updateCustomerProfile(fields){
  if(!window.tskCustomerProfile)return {ok:false,error:'auth_client_unavailable'};
  return window.tskCustomerProfile(fields);
}

/* เปลี่ยนรหัสผ่านของสมาชิกที่ล็อกอินอยู่ */
async function changeCustomerPassword(oldPassword, newPassword){
  if(!window.tskCustomerPassword)return {ok:false,error:'auth_client_unavailable'};
  return window.tskCustomerPassword(oldPassword,newPassword);
}

/* ประวัติคำสั่งซื้อของสมาชิกที่ล็อกอินอยู่ (บันทึกไว้ตอนกดยืนยันคำสั่งซื้อในหน้า checkout) */
function saveCustomerOrder(order){
  // Orders are server-owned; never cache customer/order data in localStorage.
  return false;
}
function getCustomerOrders(){
  return [];
}

/* ------------------------------ generic list store ------------------------------ */
function loadList(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if(raw === null) return fallback.slice();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback.slice();
  }catch(e){ return fallback.slice(); }
}
function saveList(key, list){ localStorage.setItem(key, JSON.stringify(list)); }
function genId(prefix){ return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ------------------------------- one-time seeding flags -------------------------------
   ใช้บอกว่า "รายการเริ่มต้น" (แบนเนอร์/แบรนด์/หมวดหมู่ตัวอย่างเดิม) ถูกโอนเข้า localStorage
   ให้เป็นรายการที่แอดมินจัดการได้แล้วหรือยัง — ทำครั้งเดียวตอนเปิดเว็บครั้งแรกเท่านั้น
   ถ้าแอดมินลบรายการออกจนหมดในภายหลัง จะไม่ seed ซ้ำ (เคารพการลบของแอดมิน) */
function isSeeded(flagKey){ return localStorage.getItem(flagKey) === "1"; }
function markSeeded(flagKey){ localStorage.setItem(flagKey, "1"); }

function todayThaiDate(){
  const months = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const d = new Date();
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()+543}`;
}

/* ------------------------------- ข่าวสารและโปรโมชั่น ------------------------------- */
const NEWS_KEY = "tsk_news_data";
const DEFAULT_NEWS = [
  { id:"n01", title:"โปรโมชั่น PUMA", desc:"ลดแรง แจกซองแขนเมื่อซื้อครบตามเงื่อนไข", content:"ลดแรง แจกซองแขนเมื่อซื้อครบตามเงื่อนไข เฉพาะสินค้าที่ร่วมรายการ สอบถามรายละเอียดเพิ่มเติมได้ที่หน้าร้านหรือโทรสอบถามทีมงาน", date:"15 พ.ค. 2567", img:"https://placehold.co/800x440/0B2E22/D79A8B?text=PUMA+PROMOTION" },
  { id:"n02", title:"ส่งเร็วทั่วไทย", desc:"จัดส่งรวดเร็วทุกออเดอร์ แพ็คสินค้าปลอดภัยส่งทั่วประเทศ", content:"ทุกออเดอร์จัดส่งรวดเร็ว แพ็คสินค้าอย่างดีเพื่อความปลอดภัยระหว่างขนส่ง ให้บริการทั่วประเทศผ่านขนส่งชั้นนำ", date:"10 พ.ค. 2567", img:"https://placehold.co/800x440/7a2020/E9B7A8?text=Delivery" },
  { id:"n03", title:"รับประกันสินค้าของแท้ 100%", desc:"รับประกันสินค้าทุกชิ้นโดยศูนย์บริการ มั่นใจทุกการใช้งาน", content:"สินค้าทุกชิ้นของแท้ 100% รับประกันโดยศูนย์บริการที่ได้มาตรฐาน มั่นใจได้ทุกการใช้งาน หากพบปัญหาสามารถติดต่อทีมงานได้ทันที", date:"5 พ.ค. 2567", img:"https://placehold.co/800x440/123A2C/D79A8B?text=Warranty" }
];
function getNewsList(){ return loadList(NEWS_KEY, DEFAULT_NEWS); }
function saveNewsList(list){ saveList(NEWS_KEY, list); }
function getNewsById(id){ return getNewsList().find(n=>n.id===id); }
function upsertNewsItem(item){
  const list = getNewsList();
  if(item.id){
    const i = list.findIndex(n=>n.id===item.id);
    if(i>-1){ list[i] = { ...list[i], ...item }; saveNewsList(list); return list[i]; }
  }
  const created = { ...item, id: genId("n"), date: item.date || todayThaiDate() };
  list.unshift(created);
  saveNewsList(list);
  return created;
}
function deleteNewsItem(id){ saveNewsList(getNewsList().filter(n=>n.id!==id)); }

/* ------------------------------------- วิดีโอ ------------------------------------- */
const VIDEOS_KEY = "tsk_videos_data";
const DEFAULT_VIDEOS = [
  { id:"v01", title:"วิธีเลือกสว่านไร้สายให้เหมาะกับงาน", duration:"6:12", videoUrl:"", thumb:"https://placehold.co/500x300/123A2C/E9B7A8?text=Video+1" },
  { id:"v02", title:"รีวิวปั๊มน้ำอัตโนมัติ ใช้งานจริงในบ้าน", duration:"4:48", videoUrl:"", thumb:"https://placehold.co/500x300/1E4A39/E9B7A8?text=Video+2" },
  { id:"v03", title:"เทคนิคดูแลรักษาเครื่องตัดหญ้าให้ใช้งานได้นาน", duration:"8:05", videoUrl:"", thumb:"https://placehold.co/500x300/0B2E22/D79A8B?text=Video+3" }
];
function getVideosList(){ return loadList(VIDEOS_KEY, DEFAULT_VIDEOS); }
function saveVideosList(list){ saveList(VIDEOS_KEY, list); }
function getVideoById(id){ return getVideosList().find(v=>v.id===id); }
function upsertVideoItem(item){
  const list = getVideosList();
  if(item.id){
    const i = list.findIndex(v=>v.id===item.id);
    if(i>-1){ list[i] = { ...list[i], ...item }; saveVideosList(list); return list[i]; }
  }
  const created = { ...item, id: genId("v") };
  list.unshift(created);
  saveVideosList(list);
  return created;
}
function deleteVideoItem(id){
  saveVideosList(getVideosList().filter(v=>v.id!==id));
  deleteVideoBlob(id); // เผื่อวิดีโอนี้เป็นไฟล์ที่อัปโหลดไว้ ลบไฟล์ออกจาก IndexedDB ด้วย (ไม่ต้องรอผลลัพธ์)
}

/* --------------------------- ไฟล์วิดีโอที่แอดมินอัปโหลดเอง (IndexedDB) ---------------------------
   วิดีโอที่แอดมิน "อัปโหลดไฟล์" (ไม่ใช่วางลิงก์) จะถูกเก็บเป็น Blob ใน IndexedDB ของเบราว์เซอร์
   เครื่องที่ล็อกอินอยู่ — ไม่ใช้ localStorage เพราะไฟล์วิดีโอมักมีขนาดใหญ่เกินโควตาของ localStorage
   (ปกติจำกัดแค่ ~5-10MB ต่อเว็บไซต์) ส่วน localStorage (VIDEOS_KEY ด้านบน) เก็บแค่ข้อมูลรายละเอียด
   (ชื่อ ความยาว ภาพปก และธง hasFile:true) ไม่ได้เก็บตัวไฟล์วิดีโอจริง */
const MEDIA_DB_NAME = "tsk_media_store";
const MEDIA_DB_VERSION = 1;
const VIDEO_BLOB_STORE = "video_files";
function openMediaDB(){
  return new Promise((resolve, reject)=>{
    if(!('indexedDB' in window)){ reject(new Error("IndexedDB ไม่รองรับในเบราว์เซอร์นี้")); return; }
    const req = indexedDB.open(MEDIA_DB_NAME, MEDIA_DB_VERSION);
    req.onupgradeneeded = ()=>{
      if(!req.result.objectStoreNames.contains(VIDEO_BLOB_STORE)){
        req.result.createObjectStore(VIDEO_BLOB_STORE);
      }
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
async function saveVideoBlob(id, blob){
  const db = await openMediaDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(VIDEO_BLOB_STORE, "readwrite");
    tx.objectStore(VIDEO_BLOB_STORE).put(blob, id);
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}
async function getVideoBlob(id){
  const db = await openMediaDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(VIDEO_BLOB_STORE, "readonly");
    const req = tx.objectStore(VIDEO_BLOB_STORE).get(id);
    req.onsuccess = ()=> resolve(req.result || null);
    req.onerror = ()=> reject(req.error);
  });
}
async function deleteVideoBlob(id){
  try{
    const db = await openMediaDB();
    return new Promise((resolve)=>{
      const tx = db.transaction(VIDEO_BLOB_STORE, "readwrite");
      tx.objectStore(VIDEO_BLOB_STORE).delete(id);
      tx.oncomplete = ()=> resolve(true);
      tx.onerror = ()=> resolve(false);
    });
  }catch(e){ return false; }
}

/* YouTube helpers — แอดมินแค่วางลิงก์ YouTube ปกติ (youtu.be/..., youtube.com/watch?v=...,
   youtube.com/shorts/...) ระบบจะแกะรหัสวิดีโอ ดึงภาพปกและสร้างลิงก์ embed ให้อัตโนมัติ */
function youtubeIdFromUrl(url){
  if(!url) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/
  ];
  for(const re of patterns){ const m = url.match(re); if(m) return m[1]; }
  return null;
}
function youtubeThumbFor(v){
  if(v.thumb) return v.thumb; // แอดมินอัปโหลด/ระบุภาพปกเองไว้ (ใช้กับลิงก์ที่ไม่ใช่ YouTube หรือจะบังคับใช้ก็ได้)
  const id = youtubeIdFromUrl(v.videoUrl);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "https://placehold.co/500x300/123A2C/E9B7A8?text=Video";
}
function youtubeEmbedUrl(url){
  const id = youtubeIdFromUrl(url);
  return id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : null;
}
function youtubeWatchUrl(url){
  const id = youtubeIdFromUrl(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : (url || "#");
}

/* ------------------------------------- บทความ ------------------------------------- */
const ARTICLES_KEY = "tsk_articles_data";
const DEFAULT_ARTICLES = [
  { id:"a01", tag:"คู่มือการใช้งาน", title:"5 เครื่องมือช่างพื้นฐานที่บ้านทุกหลังควรมี", excerpt:"รวมเครื่องมือจำเป็นสำหรับงานซ่อมแซมเล็ก ๆ น้อย ๆ ในบ้าน", content:"รวมเครื่องมือจำเป็นสำหรับงานซ่อมแซมเล็ก ๆ น้อย ๆ ในบ้าน เช่น ไขควงชุด ค้อน คีม ตลับเมตร และสว่านไร้สาย ช่วยให้จัดการงานซ่อมแซมเบื้องต้นได้ด้วยตัวเอง", date:"20 พ.ค. 2567", img:"https://placehold.co/400x220/F7F7F7/123A2C?text=Article+1" },
  { id:"a02", tag:"เกษตร", title:"เลือกปั๊มบาดาลยังไงให้เหมาะกับพื้นที่", excerpt:"ปัจจัยสำคัญที่ต้องพิจารณาก่อนติดตั้งปั๊มบาดาลในสวน/ไร่", content:"ปัจจัยสำคัญที่ต้องพิจารณาก่อนติดตั้งปั๊มบาดาลในสวน/ไร่ ได้แก่ ความลึกของบ่อ กำลังมอเตอร์ที่เหมาะสม ขนาดท่อส่งน้ำ และระยะทางจากบ่อถึงจุดใช้งาน", date:"12 พ.ค. 2567", img:"https://placehold.co/400x220/F7F7F7/123A2C?text=Article+2" },
  { id:"a03", tag:"ดูแลรักษา", title:"วิธียืดอายุแบตเตอรี่เครื่องมือไร้สาย", excerpt:"เคล็ดลับง่าย ๆ ที่ช่วยให้แบตเตอรี่ใช้งานได้นานขึ้น", content:"เคล็ดลับง่าย ๆ ที่ช่วยให้แบตเตอรี่ใช้งานได้นานขึ้น เช่น หลีกเลี่ยงการชาร์จทิ้งไว้ข้ามคืน เก็บในที่แห้งและอุณหภูมิไม่สูงเกินไป และไม่ปล่อยให้แบตเตอรี่หมดประจุจนสุด", date:"2 พ.ค. 2567", img:"https://placehold.co/400x220/F7F7F7/123A2C?text=Article+3" }
];
function getArticlesList(){ return loadList(ARTICLES_KEY, DEFAULT_ARTICLES); }
function saveArticlesList(list){ saveList(ARTICLES_KEY, list); }
function getArticleById(id){ return getArticlesList().find(a=>a.id===id); }
function upsertArticleItem(item){
  const list = getArticlesList();
  if(item.id){
    const i = list.findIndex(a=>a.id===item.id);
    if(i>-1){ list[i] = { ...list[i], ...item }; saveArticlesList(list); return list[i]; }
  }
  const created = { ...item, id: genId("a"), date: item.date || todayThaiDate() };
  list.unshift(created);
  saveArticlesList(list);
  return created;
}
function deleteArticleItem(id){ saveArticlesList(getArticlesList().filter(a=>a.id!==id)); }

/* ------------------------------------ แบนเนอร์หน้าแรก (สไลด์โชว์) ------------------------------------
   แอดมินอัปโหลด/ลบรูปแบนเนอร์ได้เองในหน้า admin.html — รูปถูกแปลงเป็น base64 แล้วเก็บใน
   localStorage ของเบราว์เซอร์เครื่องที่ล็อกอิน (ข้อจำกัดเดียวกับข้อมูลอื่น ๆ ในระบบนี้)
   ถ้ายังไม่มีรายการที่แอดมินอัปโหลดเลย หน้าร้านจะไม่แสดงภาพเก่าหรือ placeholder
   และจะรอรายการจาก API/การอัปโหลดใหม่ — ดูลำดับความสำคัญที่ initSiteData() ใน app.js */
const BANNERS_KEY = "tsk_banners_data";
function getBannerList(){ return loadList(BANNERS_KEY, []); }
function saveBannerList(list){ saveList(BANNERS_KEY, list); }
function getBannerById(id){ return getBannerList().find(b=>b.id===id); }
function upsertBannerItem(item){
  const list = getBannerList();
  if(item.id){
    const i = list.findIndex(b=>b.id===item.id);
    if(i>-1){ list[i] = { ...list[i], ...item }; saveBannerList(list); return list[i]; }
  }
  const created = { ...item, id: genId("bn") };
  list.push(created);
  saveBannerList(list);
  return created;
}
function deleteBannerItem(id){ saveBannerList(getBannerList().filter(b=>b.id!==id)); }
function moveBannerItem(id, dir){
  const list = getBannerList();
  const i = list.findIndex(b=>b.id===id);
  const j = i + dir;
  if(i<0 || j<0 || j>=list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  saveBannerList(list);
}

/* ------------------------------------ หมวดหมู่สินค้า ------------------------------------
   หมวดหมู่เริ่มต้น (ตัวอย่างเดิม) ถูก seed เข้ามาเป็นรายการที่แอดมินจัดการได้ตั้งแต่เปิดเว็บครั้งแรก
   (ดู seedCategoriesOnce() ใน assets/app.js) แอดมินเพิ่ม/แก้ไข/ลบ/จัดลำดับได้เองในหน้า admin.html
   เหมือนแบนเนอร์และแบรนด์ — หมวดหมู่เก่าและใหม่จะรวมอยู่ในรายการเดียวกันทั้งหมด */
const CATEGORIES_KEY = "tsk_categories_data";
function getCategoryList(){ return loadList(CATEGORIES_KEY, []); }
function saveCategoryList(list){ saveList(CATEGORIES_KEY, list); }
function getCategoryByKey(key){ return getCategoryList().find(c=>c.key===key); }
function slugifyCategoryName(name){
  const base = (name||"").trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/g,"-").replace(/(^-+|-+$)/g,"");
  return base || "cat";
}
function upsertCategoryItem(item){
  const list = getCategoryList();
  if(item.key){
    const i = list.findIndex(c=>c.key===item.key);
    if(i>-1){ list[i] = { ...list[i], ...item }; saveCategoryList(list); return list[i]; }
  }
  let key = slugifyCategoryName(item.name);
  if(list.some(c=>c.key===key)) key = key + "-" + Date.now().toString(36).slice(-4);
  const created = { ...item, key, icon: item.icon || "boxes" };
  list.push(created);
  saveCategoryList(list);
  return created;
}
function deleteCategoryItem(key){ saveCategoryList(getCategoryList().filter(c=>c.key!==key)); }
function moveCategoryItem(key, dir){
  const list = getCategoryList();
  const i = list.findIndex(c=>c.key===key);
  const j = i + dir;
  if(i<0 || j<0 || j>=list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  saveCategoryList(list);
}

/* ------------------------------------ แบรนด์ที่จำหน่าย ------------------------------------
   เช่นเดียวกับแบนเนอร์ — แอดมินอัปโหลด/ลบโลโก้แบรนด์ได้เองในหน้า admin.html
   ถ้ายังไม่มีรายการที่แอดมินอัปโหลดเลย หน้าร้านจะไม่เติมโลโก้แบรนด์เก่าอัตโนมัติ */
const BRANDS_KEY = "tsk_brands_data";
function getBrandList(){ return loadList(BRANDS_KEY, []); }
function saveBrandList(list){ saveList(BRANDS_KEY, list); }
function getBrandItemById(id){ return getBrandList().find(b=>b.id===id); }
function upsertBrandItem(item){
  const list = getBrandList();
  if(item.id){
    const i = list.findIndex(b=>b.id===item.id);
    if(i>-1){ list[i] = { ...list[i], ...item }; saveBrandList(list); return list[i]; }
  }
  const created = { ...item, id: genId("bd") };
  list.push(created);
  saveBrandList(list);
  return created;
}
function deleteBrandItem(id){ saveBrandList(getBrandList().filter(b=>b.id!==id)); }
function moveBrandItem(id, dir){
  const list = getBrandList();
  const i = list.findIndex(b=>b.id===id);
  const j = i + dir;
  if(i<0 || j<0 || j>=list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  saveBrandList(list);
}

/* ------------------------------------- สินค้า (รายการเดียว จัดการได้ทั้งหมด) -------------------------------------
   สินค้าตัวอย่างเดิม (อาเรย์ PRODUCTS ใน assets/app.js) จะถูก "seed" เข้ามาอยู่ในรายการเดียวกันนี้ตั้งแต่
   เปิดเว็บครั้งแรก (ดู seedProductsOnce() ใน app.js) เหมือนกับหมวดหมู่/แบรนด์/แบนเนอร์ — หลังจากนั้น
   สินค้าทุกชิ้น (เดิม+ที่เพิ่มใหม่) จะแก้ไข/ลบ/ดูได้จากแท็บ "สินค้า" ในหน้าแอดมินทั้งหมดในที่เดียว
   ไม่ต้องแก้โค้ดอีกต่อไป — เลือกแบรนด์ตอนเพิ่ม/แก้ไขสินค้าได้จากรายการที่ "สร้างไว้แล้วเท่านั้น"
   (ดู allBrandNames() ใน app.js) เพื่อให้แบรนด์กับสินค้าสัมพันธ์กันเสมอ ไม่มีสินค้าแบรนด์ที่ไม่มีอยู่จริงในระบบ */
const ADMIN_PRODUCTS_KEY = "tsk_admin_products_data";
function getAdminProductList(){ return loadList(ADMIN_PRODUCTS_KEY, []); }
function saveAdminProductList(list){ saveList(ADMIN_PRODUCTS_KEY, list); }
function getAdminProductById(id){ return getAdminProductList().find(p=>p.id===id); }
function upsertAdminProductItem(item){
  const list = getAdminProductList();
  if(item.id){
    const i = list.findIndex(p=>p.id===item.id);
    if(i>-1){ list[i] = { ...list[i], ...item }; saveAdminProductList(list); return list[i]; }
  }
  const created = { ...item, id: genId("ap") };
  list.unshift(created);
  saveAdminProductList(list);
  return created;
}
function deleteAdminProductItem(id){ saveAdminProductList(getAdminProductList().filter(p=>p.id!==id)); }

/* ==========================================================================
   MARKETPLACE SYNC — Shopee / Lazada
   -------------------------------------------------------------------------
   หน้าที่ของโค้ดชุดนี้ (ฝั่งเบราว์เซอร์) คือ:
   1) เก็บ "สถานะการเชื่อมต่อ" (connected/shopId/shopName/lastSync) ไว้ดูในแอดมิน
   2) เก็บ "ตารางจับคู่สินค้า" ระหว่างสินค้าในระบบนี้ กับ item ID ฝั่ง Shopee/Lazada
   3) เรียก proxy ฝั่งเซิร์ฟเวอร์ (ที่ตั้งค่า baseUrl ไว้ใน assets/config.js) เพื่อ
      ดึงสต๊อก/ราคาล่าสุดจากร้านจริงมาอัปเดตสินค้าในระบบ
   ⚠️ โค้ดฝั่งนี้ "ไม่มี" และ "ต้องไม่มี" App Secret ของ Shopee/Lazada อยู่เลย
   การขอ token / เซ็น signature ต้องทำที่ proxy ฝั่งเซิร์ฟเวอร์เท่านั้น (ดูโฟลเดอร์
   /server-proxy-examples ที่แนบมาให้ และคำอธิบายเต็มใน assets/config.js)
========================================================================= */
const MP_CONN_KEY = "tsk_marketplace_connections";
const MP_LINKS_KEY = "tsk_marketplace_links";

function defaultMpConnections(){
  return {
    shopee: { connected:false, shopId:"", shopName:"", autoStockSync:true, lastSync:null },
    lazada: { connected:false, shopId:"", shopName:"", autoStockSync:true, lastSync:null }
  };
}
function getMarketplaceConnections(){
  try{
    const saved = JSON.parse(localStorage.getItem(MP_CONN_KEY));
    if(saved && typeof saved === "object") return { ...defaultMpConnections(), ...saved };
  }catch(e){}
  return defaultMpConnections();
}
function saveMarketplaceConnections(conns){ localStorage.setItem(MP_CONN_KEY, JSON.stringify(conns)); }

function setMarketplaceConnection(platform, data){
  const conns = getMarketplaceConnections();
  conns[platform] = { ...conns[platform], ...data };
  saveMarketplaceConnections(conns);
  return conns[platform];
}
function disconnectMarketplace(platform){
  const conns = getMarketplaceConnections();
  conns[platform] = { connected:false, shopId:"", shopName:"", autoStockSync:true, lastSync:null };
  saveMarketplaceConnections(conns);
  // เลิกจับคู่สินค้าทั้งหมดของแพลตฟอร์มนี้ไปด้วย เพื่อไม่ให้ค้างสถานะ "เชื่อมแล้ว" ผิด ๆ
  const links = getMarketplaceLinks().map(l=>({ ...l, [platform+"Id"]: "", [platform+"Stock"]: null }));
  saveMarketplaceLinks(links);
}

/* ---- ตารางจับคู่: สินค้าในระบบ (productId) <-> item id ฝั่ง Shopee/Lazada ---- */
function getMarketplaceLinks(){ return loadList(MP_LINKS_KEY, []); }
function saveMarketplaceLinks(list){ saveList(MP_LINKS_KEY, list); }
function getMarketplaceLinkForProduct(productId){
  return getMarketplaceLinks().find(l=>l.productId===productId) || { productId, shopeeId:"", lazadaId:"", shopeeStock:null, lazadaStock:null };
}
function upsertMarketplaceLink(productId, patch){
  const list = getMarketplaceLinks();
  const i = list.findIndex(l=>l.productId===productId);
  if(i>-1){ list[i] = { ...list[i], ...patch }; }
  else{ list.push({ productId, shopeeId:"", lazadaId:"", shopeeStock:null, lazadaStock:null, ...patch }); }
  saveMarketplaceLinks(list);
}

/* ---- เรียก proxy จริงเพื่อดึงสต๊อกล่าสุด (ต้องตั้งค่า config.js ให้ครบก่อน) ---- */
async function fetchMarketplaceStock(platform, externalItemId){
  const cfg = (typeof API_CONFIG !== "undefined") ? API_CONFIG[platform] : null;
  if(!cfg || !cfg.baseUrl || !cfg.stockEndpoint){
    throw new Error("ยังไม่ได้ตั้งค่า " + platform + " ใน assets/config.js (baseUrl/stockEndpoint ว่างอยู่)");
  }
  const url = cfg.baseUrl.replace(/\/$/,"") + cfg.stockEndpoint.replace("{itemId}", encodeURIComponent(externalItemId));
  const res = await fetch(url, { headers: { "Accept":"application/json" } });
  if(!res.ok) throw new Error(platform + " proxy ตอบกลับผิดพลาด (" + res.status + ")");
  return res.json(); // คาดหวังรูปแบบ { stock: number, price?: number, name?: string }
}

/* ดึงรายการสินค้าทั้งร้านจาก proxy (ใช้ตอนกด "นำเข้าสินค้าจากร้าน") */
async function fetchMarketplaceProductList(platform){
  const cfg = (typeof API_CONFIG !== "undefined") ? API_CONFIG[platform] : null;
  if(!cfg || !cfg.baseUrl || !cfg.productListEndpoint){
    throw new Error("ยังไม่ได้ตั้งค่า " + platform + " ใน assets/config.js (baseUrl/productListEndpoint ว่างอยู่)");
  }
  const url = cfg.baseUrl.replace(/\/$/,"") + cfg.productListEndpoint;
  const res = await fetch(url, { headers: { "Accept":"application/json" } });
  if(!res.ok) throw new Error(platform + " proxy ตอบกลับผิดพลาด (" + res.status + ")");
  return res.json(); // คาดหวังรูปแบบ [{ itemId, name, price, stock, image }, ...]
}

/* Sync สต๊อกทุกสินค้าที่จับคู่ไว้แล้วของแพลตฟอร์มหนึ่ง — คืนค่าจำนวนที่อัปเดตสำเร็จ/ที่พลาด */
async function syncMarketplaceStock(platform){
  const conns = getMarketplaceConnections();
  if(!conns[platform] || !conns[platform].connected){
    throw new Error("ยังไม่ได้เชื่อมต่อ " + platform + " — กดปุ่ม \"เชื่อมต่อ\" ก่อน");
  }
  const links = getMarketplaceLinks().filter(l => l[platform+"Id"]);
  let ok = 0, fail = 0;
  for(const link of links){
    try{
      const data = await fetchMarketplaceStock(platform, link[platform+"Id"]);
      upsertMarketplaceLink(link.productId, { [platform+"Stock"]: data.stock ?? null });
      const p = getAdminProductById(link.productId);
      if(p) upsertAdminProductItem({ id: p.id, stock: data.stock ?? p.stock });
      ok++;
    }catch(e){ fail++; }
  }
  setMarketplaceConnection(platform, { lastSync: new Date().toISOString() });
  return { ok, fail, total: links.length };
}

/* ------------------------------------ ตั้งค่าเว็บไซต์ ------------------------------------ */
const SETTINGS_KEY = "tsk_site_settings";
const DEFAULT_SETTINGS = { announcement: "" };
function getSiteSettings(){
  try{
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if(saved && typeof saved === "object") return { ...DEFAULT_SETTINGS, ...saved };
  }catch(e){}
  return { ...DEFAULT_SETTINGS };
}
function saveSiteSettings(s){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

/* ------------------------------- small shared UI bits ------------------------------- */
function confirmAdminAction(msg){ return window.confirm(msg); }
