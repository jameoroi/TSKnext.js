/* Injects the shared top bar, nav, and footer into every page so the
   header/footer only need to be maintained in one place. */

/* NOTE: platform-polish-v45.css, layout-recovery-r58.css, ui-recovery-r60.css,
   platform-unification-r62.css, mobile-rebuild.css and session-nav-r62.js are
   now linked directly in each page's <head> (deterministic load order, no
   race with this script). agent-flow-r60.js is linked only on the pages that
   actually use it (partner-register.html, agent-center.html, agent-store.html).
   This file used to also late-inject storefront-r52.css / visual-system-r53.css
   and add a "tsk-r53" class to <body> — that was an abandoned pink/gold visual
   direction superseded by the current green/gold system, and injecting it on
   every page caused the storefront to randomly flash/mix the old pink theme
   with the new one. session-nav-r61.js was also being injected alongside its
   replacement session-nav-r62.js, which meant two scripts fought over the same
   header elements. All of that has been removed. */
if (location.pathname.endsWith('/partner-register.html')) {
  const form = document.getElementById('partnerForm');
  if (form && !document.getElementById('partnerLoginGuide')) {
    const guide = document.createElement('aside'); guide.id = 'partnerLoginGuide'; guide.className = 'partner-login-guide';
    guide.innerHTML = '<b>หลังสมัครแล้วเข้าสู่ระบบอย่างไร?</b><span>1. ตั้งรหัสผ่านของคุณเองตอนสมัคร  2. รอบริษัทตรวจและอนุมัติใบสมัคร  3. เข้า Agent Center ด้วยอีเมลและรหัสผ่านที่ตั้งไว้</span><a href="agent-center.html">ไปหน้า Agent Center →</a>';
    form.before(guide);
  }
}

function siteHeader(activePage){
  const nav = [
    { href:"partners.html", label:"Partner Program", key:"partners" },
    { href:"index.html#home", label:"หน้าหลัก", key:"home" },
    { href:"products.html?status=สินค้าลดราคา", label:"สินค้าลดราคา", key:"sale" },
    { href:"products.html?category=tools", label:"เครื่องมือช่าง", key:"tools" },
    { href:"products.html?category=agri", label:"อุปกรณ์การเกษตร", key:"agri" },
    { href:"products.html?category=power", label:"เครื่องมือไฟฟ้า", key:"power" },
    { href:"about.html", label:"เกี่ยวกับเรา", key:"about" },
    { href:"news.html", label:"ข่าวสารและโปรโมชั่น", key:"news" },
    { href:"videos.html", label:"วิดีโอและบทความ", key:"videos" },
    { href:"contact.html", label:"ติดต่อเรา", key:"contact" }
  ];
  const navHtml = nav.map(n=>`<li class="${n.key===activePage?'active':''}"><a href="${n.href}">${n.label}</a></li>`).join('');

  const customer = (typeof isCustomerLoggedIn === 'function') && isCustomerLoggedIn() ? currentCustomer() : null;
  const settings = (typeof getSiteSettings === 'function') ? getSiteSettings() : { announcement:"" };

  const announceHtml = (settings.announcement && settings.announcement.trim()) ? `
  <div class="site-announce"><div class="wrap"><span>${settings.announcement}</span></div></div>` : "";

  return `
  <div class="market-utility">
    <div class="wrap market-utility-inner">
      <div class="market-welcome">ยินดีต้อนรับสู่ <b>THAISERKIT SUPPLY</b></div>
      <div class="market-promises">
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>สินค้ารับประกันศูนย์</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/></svg>จัดส่งทั่วประเทศ</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6" stroke-linecap="round"/></svg>ออกใบกำกับภาษีได้</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M4 15a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2v1Zm16 0a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2v1Z"/><path d="M17 19c-1 2-3 3-5 3" stroke-linecap="round"/></svg>บริการหลังการขาย</span>
      </div>
      <div class="market-account">
        <span class="market-phone"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 3a2 2 0 0 1-.4 2.1L8 10.3a16 16 0 0 0 6 6l1.5-1.4a2 2 0 0 1 2.1-.4c1 .4 2 .6 3 .7a2 2 0 0 1 1.7 2Z"/></svg>054-468139 | 088-2608042</span>
        ${customer ? `<a href="account.html">เข้าสู่บัญชี</a>` : `<a href="login.html">เข้าสู่ระบบ</a>`}
        <span class="market-sep">|</span><a href="login.html">สมัครสมาชิก</a><span class="market-sep">|</span><a href="partner-register.html">สมัครตัวแทน</a>
      </div>
    </div>
  </div>
  ${announceHtml}
  <div class="topbar">
    <div class="wrap">
      <a class="brand" href="index.html">
        <div class="brand-logo">
          ${robustImgTag(companyLogoCandidates(), "THAISERKIT SUPPLY")}
          <span class="brand-mark-text" aria-hidden="true">TSK</span>
        </div>
        <div>
          <div class="brand-name-th">THAISERKIT SUPPLY</div>
          <div class="brand-name-en">ไทยเซอร์กิจ ซัพพลาย</div>
        </div>
      </a>
      <form class="header-search" onsubmit="event.preventDefault(); const q=this.q.value.trim(); window.location.href = 'products.html' + (q?('?q='+encodeURIComponent(q)):'');">
        <input name="q" type="text" placeholder="ค้นหาสินค้า, แบรนด์, รุ่น...">
        <button type="submit" aria-label="ค้นหา"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3" stroke-linecap="round"/></svg></button>
      </form>
      <div class="top-info">
        <div class="item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 3a2 2 0 0 1-.4 2.1L8 10.3a16 16 0 0 0 6 6l1.5-1.4a2 2 0 0 1 2.1-.4c1 .4 2 .6 3 .7a2 2 0 0 1 1.7 2Z"/></svg>
          <span>054-468139<br><b>088-2608042</b></span>
        </div>
        <div class="item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round"/></svg>
          <span>จันทร์ - เสาร์<br><b>07.00 - 17.00 น.</b></span>
        </div>
        <div class="item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/></svg>
          <span>จัดส่งทั่วประเทศ<br><b>รวดเร็วทันใจ</b></span>
        </div>
      </div>
      <div class="top-actions">
        ${customer ? `
        <a class="action" href="account.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
          <span>สวัสดี, ${customer.name.split(' ')[0]}</span>
        </a>` : `
        <a class="action" href="login.html">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
          <span>เข้าสู่ระบบ</span>
        </a>`}
        <a class="action" href="wishlist.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg><span>รายการโปรด</span></a>
        <a class="action" href="cart.html" style="position:relative;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 7h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>
          <span>ตะกร้าสินค้า</span>
          <span class="cart-count js-cart-count">0</span>
        </a>
      </div>
    </div>
  </div>
  <nav class="navbar">
    <div class="wrap">
      <div class="category-nav-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16" stroke-linecap="round"/></svg><span>หมวดหมู่สินค้า</span></div>
      <ul class="nav-links">${navHtml}</ul>
      <form class="nav-search" onsubmit="event.preventDefault(); const q=this.q.value.trim(); window.location.href = 'products.html' + (q?('?q='+encodeURIComponent(q)):'');">
        <input name="q" type="text" placeholder="ค้นหาสินค้า...">
        <button type="submit" aria-label="ค้นหา">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3" stroke-linecap="round"/></svg>
        </button>
      </form>
    </div>
  </nav>`;
}

/* คืนลิงก์เพจ Facebook ของร้าน — ใช้ pageId ถ้ามี ไม่งั้นใช้ pageUsernameOrId
   ใช้ทั้งไอคอน Facebook ในฟุตเตอร์และปุ่มแชทลอย ให้ตั้งค่าที่เดียว (assets/config.js) พอ */
function facebookPageUrl(){
  const fb = (typeof API_CONFIG !== 'undefined' && API_CONFIG.facebook) ? API_CONFIG.facebook : {};
  const handle = (fb.pageId || fb.pageUsernameOrId || "").trim();
  return handle ? `https://facebook.com/${handle}` : "#";
}

function siteFooter(){
  return `
  <footer id="contact">
    <div class="wrap">
      <div class="foot-grid">
        <div class="foot-brand">
          <a class="brand" href="index.html">
            <div class="brand-logo">
              ${robustImgTag(companyLogoCandidates(), "THAISERKIT SUPPLY")}
              <span class="brand-mark-text" aria-hidden="true">TSK</span>
            </div>
            <div>
              <div class="brand-name-th">THAISERKIT SUPPLY</div>
              <div class="brand-name-en">ไทยเซอร์กิจ ซัพพลาย</div>
            </div>
          </a>
          <p>จำหน่ายเครื่องมือช่าง อุปกรณ์การเกษตร เครื่องมือไฟฟ้า ปั๊มน้ำ ปั๊มบาดาล ท่อ PE และสินค้าครบครัน คุณภาพมาตรฐาน ราคาคุ้มค่า พร้อมบริการด้วยใจ</p>
          <div class="soc-row">
            <a href="${facebookPageUrl()}" ${facebookPageUrl()!=='#'?'target="_blank" rel="noopener"':''} aria-label="Facebook"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 4h-2a4 4 0 0 0-4 4v3H7v4h2v7h4v-7h3l1-4h-4V8a1 1 0 0 1 1-1h3Z"/></svg></a>
            <a href="#" aria-label="Line"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="4"/><path d="M8 10v4M12 10v4M16 10v4M8 12h8" stroke-linecap="round"/></svg></a>
            <a href="#" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17" cy="7" r="1"/></svg></a>
            <a href="#" aria-label="TikTok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v10.5a3.5 3.5 0 1 1-3-3.46"/><path d="M14 3a5 5 0 0 0 5 5"/></svg></a>
          </div>
        </div>
        <div>
          <h4>เมนูหลัก</h4>
          <ul class="foot-links">
            <li><a href="index.html">หน้าหลัก</a></li>
            <li><a href="products.html?status=สินค้าลดราคา">สินค้าลดราคา</a></li>
            <li><a href="products.html?category=tools">เครื่องมือช่าง</a></li>
            <li><a href="products.html?category=agri">อุปกรณ์การเกษตร</a></li>
            <li><a href="products.html?category=power">เครื่องมือไฟฟ้า</a></li>
            <li><a href="about.html">เกี่ยวกับเรา</a></li>
            <li><a href="videos.html">วิดีโอและบทความ</a></li>
            <li><a href="track-order.html">ติดตามคำสั่งซื้อ</a></li>
            <li><a href="wishlist.html">รายการโปรด</a></li>
            <li><a href="contact.html">ติดต่อเรา</a></li>
          </ul>
        </div>
        <div>
          <h4>ข้อมูลติดต่อ</h4>
          <ul class="foot-contact">
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 3a2 2 0 0 1-.4 2.1L8 10.3a16 16 0 0 0 6 6l1.5-1.4a2 2 0 0 1 2.1-.4c1 .4 2 .6 3 .7a2 2 0 0 1 1.7 2Z"/></svg><span>054-468139</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 3a2 2 0 0 1-.4 2.1L8 10.3a16 16 0 0 0 6 6l1.5-1.4a2 2 0 0 1 2.1-.4c1 .4 2 .6 3 .7a2 2 0 0 1 1.7 2Z"/></svg><span>088-2608042</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg><span>thaiserkit.supply@gmail.com</span></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="10" r="2.3"/></svg><span>89 หมู่ 9 บ้านห้วยบง ต.น้ำแวน<br>อ.เชียงคำ จ.พะเยา 56110</span></li>
          </ul>
        </div>
        <div>
          <h4>บริการลูกค้า</h4>
          <ul class="foot-links">
            <li><a href="terms.html">การสั่งซื้อและระเบียบการชำระ</a></li>
            <li><a href="track-order.html">การจัดส่งและติดตามสินค้า</a></li>
            <li><a href="contact.html">การรับประกันสินค้า</a></li>
            <li><a href="returns.html">เงื่อนไขการคืนสินค้า</a></li>
            <li><a href="contact.html">คำถามที่พบบ่อย / ติดต่อเรา</a></li>
          </ul>
        </div>
      </div>
      <div style="padding:32px 0;border-bottom:1px solid var(--border);">
        <h4 style="margin-bottom:10px;">ติดตามข่าวสาร</h4>
        <p style="font-size:12.5px;color:#a9bdb2;max-width:320px;margin-bottom:14px;">รับข่าวสาร โปรโมชั่นพิเศษและสิทธิพิเศษก่อนใคร</p>
        <div class="news-input" style="max-width:320px;">
          <input class="tsk-newsletter-email" type="email" placeholder="ใส่อีเมลของคุณ">
          <button class="tsk-newsletter-submit" type="button" aria-label="สมัคร"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m9 6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
      </div>
      <div class="foot-bottom">
        <span>© ${new Date().getFullYear()} THAISERKIT SUPPLY. All Rights Reserved.</span>
        <div class="policy">
          <a href="privacy.html">นโยบายความเป็นส่วนตัว</a>
          <a href="terms.html">ข้อกำหนดและเงื่อนไข</a>
          <a href="returns.html">คืนสินค้าและคืนเงิน</a>
        </div>
      </div>
    </div>
  </footer>`;
}

function ensurePlatformPerfectTheme(){
  if(document.querySelector('link[data-r66-theme],link[data-r72-css-bundle],link[href*="platform-perfect-r66.css"]')) return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='assets/platform-perfect-r66.css?v=66';
  link.dataset.r66Theme='1';
  document.head.appendChild(link);
  const r67=document.createElement('link'); r67.rel='stylesheet'; r67.href='assets/header-recovery-r67.css?v=67'; document.head.appendChild(r67);
}
function mountLayout(activePage){
  ensurePlatformPerfectTheme();
  document.getElementById('site-header').innerHTML = siteHeader(activePage);
  document.getElementById('site-footer').innerHTML = siteFooter();
  updateCartBadge();
  initStickyHeader();
  initBackToTop();
  initFbChatBubble();
}

function initStickyHeader(){
  const header = document.getElementById('site-header');
  if(!header) return;
  let lastY = window.scrollY;
  let ticking = false;

  function onScroll(){
    const y = window.scrollY;
    header.classList.toggle('scrolled', y > 60);

    if(y > lastY && y > 140){
      header.classList.add('hide');   // scrolling down — fade + slide bar away
    } else {
      header.classList.remove('hide'); // scrolling up — fade + slide back in
    }
    lastY = y;
    ticking = false;
  }
  window.addEventListener('scroll', ()=>{
    if(!ticking){ requestAnimationFrame(onScroll); ticking = true; }
  }, { passive:true });
}

function initBackToTop(){
  if(document.querySelector('.back-to-top')) return;
  const btn = document.createElement('button');
  btn.className = 'back-to-top';
  btn.setAttribute('aria-label','กลับขึ้นด้านบน');
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m5 12 7-7 7 7M12 5v14" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  btn.onclick = ()=> window.scrollTo({ top:0, behavior:'smooth' });
  document.body.appendChild(btn);
  window.addEventListener('scroll', ()=>{
    btn.classList.toggle('show', window.scrollY > 500);
  }, { passive:true });
}

/* Facebook Messenger — สองวิธี อ่านรายละเอียดที่ assets/config.js (API_CONFIG.facebook)
   1) ถ้ากรอก appId + pageId ครบ -> โหลด Facebook SDK จริง แสดงกล่อง "Customer Chat Plugin"
      (ของแท้จาก Meta, ข้อความเข้ากล่องข้อความเพจ Facebook ของร้านโดยตรง)
   2) ถ้ากรอกแค่ pageUsernameOrId -> ใช้ปุ่มลอย m.me/ชื่อเพจ (เปิดแอป/หน้าเว็บ Messenger)
   3) ถ้ายังไม่ตั้งค่าอะไรเลย -> ปุ่มลอยยังโชว์อยู่แต่คลิกแล้วเด้งข้อความแจ้งให้ตั้งค่าก่อน */
function initFbChatBubble(){
  const fb = (typeof API_CONFIG !== 'undefined' && API_CONFIG.facebook) ? API_CONFIG.facebook : {};
  const appId = (fb.appId || "").trim();
  const pageId = (fb.pageId || "").trim();

  if(appId && pageId){
    let marketingConsent=false;
    try{const saved=JSON.parse(localStorage.getItem('tsk_consent_r72')||'null');marketingConsent=!!(saved&&saved.version==='2026-08-15-r72'&&saved.marketing===true)}catch(_){marketingConsent=false}
    if(!marketingConsent){
      if(!window.__tskFbConsentListener){
        window.__tskFbConsentListener=true;
        window.addEventListener('tsk:consent',event=>{if(event.detail?.marketing)initFbChatBubble()});
      }
      return;
    }
    initFbCustomerChatPlugin(appId, pageId, fb);
    return;
  }
  initFbSimpleBubble(fb.pageUsernameOrId || "");
}

/* วิธีที่ 2 (fallback / เบื้องต้น): ปุ่มลอยมุมขวาล่างที่พาไปเปิด m.me/ชื่อเพจ */
function initFbSimpleBubble(page){
  if(document.querySelector('.fb-chat-bubble')) return;
  const btn = document.createElement('a');
  btn.className = 'fb-chat-bubble';
  btn.setAttribute('aria-label','แชทผ่าน Facebook Messenger');
  btn.innerHTML = `
    <svg viewBox="0 0 36 36" fill="none"><path fill="url(#fbGrad)" d="M18 0C8.06 0 0 7.5 0 16.95c0 5.4 2.63 10.22 6.75 13.37V36l6.17-3.39c1.65.46 3.4.7 5.08.7 9.94 0 18-7.5 18-16.96S27.94 0 18 0Z"/><path fill="#fff" d="m8.4 21.9 5.28-5.6 4.32 3.24 5.7-5.6-5.28 8.24-4.32-3.24z"/><defs><linearGradient id="fbGrad" x1="3" y1="33" x2="33" y2="3" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0099FF"/><stop offset=".6" stop-color="#A033FF"/><stop offset="1" stop-color="#FF5280"/></linearGradient></defs></svg>`;
  if(page){
    btn.href = `https://m.me/${page}`;
    btn.target = "_blank";
    btn.rel = "noopener";
  } else {
    btn.href = "#";
    btn.onclick = (e)=>{ e.preventDefault(); showToast('ยังไม่ได้ตั้งค่าเพจ Facebook — ใส่ชื่อเพจใน assets/config.js'); };
  }
  document.body.appendChild(btn);
}

/* วิธีที่ 1 (แนะนำ): Facebook Customer Chat Plugin ของจริง — โหลด Facebook SDK แล้ว
   ฝังกล่องแชทที่ผูกกับเพจจริงผ่าน Messenger Platform ของ Meta โดยตรง
   ต้องตั้งค่า "Whitelisted Domains" ในแอป Facebook Developer ให้ตรงกับโดเมนที่เว็บรันอยู่
   ไม่งั้นกล่องแชทจะไม่ขึ้น (ดูขั้นตอนเต็มที่คอมเมนต์ใน assets/config.js) */
function initFbCustomerChatPlugin(appId, pageId, fb){
  if(document.getElementById('fb-root')) return; // กันโหลดซ้ำถ้าเรียกมากกว่า 1 ครั้ง

  // 1) เตรียม <div id="fb-root"> และ <div class="fb-customerchat"> ตามที่ Facebook SDK ต้องการ
  const root = document.createElement('div');
  root.id = 'fb-root';
  document.body.appendChild(root);

  const chatDiv = document.createElement('div');
  chatDiv.className = 'fb-customerchat';
  chatDiv.setAttribute('attribution', 'biz_inbox');
  chatDiv.setAttribute('page_id', pageId);
  if(fb.greetingText) chatDiv.setAttribute('greeting_dialog_display', 'show');
  if(fb.greetingText) chatDiv.setAttribute('greeting_dialog_delay', '2');
  document.body.appendChild(chatDiv);

  // 2) ตั้งค่า fbAsyncInit ตามมาตรฐานของ Facebook SDK
  window.fbAsyncInit = function(){
    if(!window.FB) return;
    FB.init({
      xfbml: true,
      version: 'v19.0'
    });
  };

  // 3) โหลดสคริปต์ SDK จริงจาก Facebook (connect.facebook.net) แบบ async
  if(!document.getElementById('facebook-jssdk')){
    const js = document.createElement('script');
    js.id = 'facebook-jssdk';
    js.async = true;
    js.defer = true;
    js.crossOrigin = 'anonymous';
    const locale = fb.locale || 'th_TH';
    js.src = `https://connect.facebook.net/${locale}/sdk/xfbml.customerchat.js#xfbml=1&version=v19.0&appId=${encodeURIComponent(appId)}&autoLogAppEvents=1`;
    document.body.appendChild(js);
  }
}
 
