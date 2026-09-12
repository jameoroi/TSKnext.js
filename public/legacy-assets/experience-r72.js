(function(){
  'use strict';

  const CONSENT_KEY='tsk_consent_r72';
  const CONSENT_VERSION='2026-08-15-r72';
  const THEME_KEY='tsk_theme_r72';
  const RECENT_KEY='tsk_recent_products_r72';
  const esc=value=>(typeof window.escapeHtml==='function'
    ? window.escapeHtml(value)
    : String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])));
  const asset=value=>(typeof window.safeAssetUrl==='function'?window.safeAssetUrl(value):String(value||''));
  const money=value=>(typeof window.formatPrice==='function'?window.formatPrice(value):`${Number(value||0).toLocaleString('th-TH')} บาท`);

  function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
  function currentConsent(){const value=readJson(CONSENT_KEY,null);return value&&value.version===CONSENT_VERSION?value:null}
  function consentAllows(category){if(category==='necessary')return true;return currentConsent()?.[category]===true}
  window.tskConsentAllows=consentAllows;

  let optionalServicesStarted=false;
  function activateOptionalServices(){
    const consent=currentConsent();
    if(!consent||optionalServicesStarted)return;
    const privacy=(typeof API_CONFIG!=='undefined'&&API_CONFIG.privacy)?API_CONFIG.privacy:{};
    if(consent.analytics){
      const ga=String(privacy.ga4MeasurementId||'').trim();
      if(/^G-[A-Z0-9]+$/i.test(ga)&&!document.getElementById('tsk-ga4')){
        const script=document.createElement('script');script.id='tsk-ga4';script.async=true;script.src=`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`;document.head.appendChild(script);
        window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};
        window.gtag('js',new Date());window.gtag('config',ga,{anonymize_ip:true,allow_google_signals:false});
      }
      const dsn=String(privacy.sentryDsn||'').trim();
      if(dsn&&window.Sentry?.init)window.Sentry.init({dsn,environment:'production',tracesSampleRate:0.05});
    }
    optionalServicesStarted=true;
  }

  function saveConsent(next){
    const value={version:CONSENT_VERSION,necessary:true,analytics:!!next.analytics,marketing:!!next.marketing,updatedAt:new Date().toISOString()};
    localStorage.setItem(CONSENT_KEY,JSON.stringify(value));
    localStorage.removeItem('tsk_privacy_notice');
    document.getElementById('tskConsentBanner')?.remove();
    document.getElementById('tskConsentSettings')?.setAttribute('hidden','');
    document.documentElement.classList.remove('r72-consent-open');
    window.dispatchEvent(new CustomEvent('tsk:consent',{detail:value}));
    optionalServicesStarted=false;activateOptionalServices();
  }

  function ensureConsentSettings(){
    let modal=document.getElementById('tskConsentSettings');
    if(modal)return modal;
    modal=document.createElement('div');modal.id='tskConsentSettings';modal.className='r72-modal';modal.hidden=true;
    modal.innerHTML=`<section class="r72-modal-card r72-consent-settings" role="dialog" aria-modal="true" aria-labelledby="tskConsentTitle">
      <button class="r72-modal-close" type="button" data-consent-close aria-label="ปิดการตั้งค่าคุกกี้">×</button>
      <h2 id="tskConsentTitle">ตั้งค่าความเป็นส่วนตัว</h2>
      <p>คุณเปลี่ยนตัวเลือกได้ทุกเมื่อ คุกกี้ที่จำเป็นใช้เพื่อให้ตะกร้า การเข้าสู่ระบบ และความปลอดภัยทำงานได้</p>
      <div class="r72-consent-option"><label>คุกกี้ที่จำเป็น<small>ตะกร้า เซสชัน ความปลอดภัย และการตั้งค่าพื้นฐาน</small></label><input type="checkbox" checked disabled aria-label="คุกกี้ที่จำเป็น เปิดใช้งานเสมอ"></div>
      <div class="r72-consent-option"><label for="tskConsentAnalytics">การวิเคราะห์<small>ช่วยวัดประสิทธิภาพและปรับปรุงเว็บไซต์ โดยเริ่มทำงานเมื่อคุณยินยอม</small></label><input id="tskConsentAnalytics" type="checkbox"></div>
      <div class="r72-consent-option"><label for="tskConsentMarketing">การตลาดและแชทภายนอก<small>อนุญาตเครื่องมือจากผู้ให้บริการภายนอก เช่น Facebook Customer Chat</small></label><input id="tskConsentMarketing" type="checkbox"></div>
      <button class="btn-solid r72-consent-save" type="button" data-consent-save>บันทึกการตั้งค่า</button>
    </section>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('[data-consent-close]'))closeConsentSettings()});
    modal.querySelector('[data-consent-save]').addEventListener('click',()=>saveConsent({analytics:modal.querySelector('#tskConsentAnalytics').checked,marketing:modal.querySelector('#tskConsentMarketing').checked}));
    return modal;
  }

  let consentReturnFocus=null;
  function openConsentSettings(){
    consentReturnFocus=document.activeElement;
    const modal=ensureConsentSettings(),consent=currentConsent()||{};
    modal.querySelector('#tskConsentAnalytics').checked=!!consent.analytics;
    modal.querySelector('#tskConsentMarketing').checked=!!consent.marketing;
    modal.hidden=false;document.documentElement.classList.add('r72-consent-open');
    modal.querySelector('#tskConsentAnalytics').focus();
  }
  function closeConsentSettings(){const modal=document.getElementById('tskConsentSettings');if(modal)modal.hidden=true;document.documentElement.classList.remove('r72-consent-open');consentReturnFocus?.focus?.()}

  function mountConsent(){
    if(currentConsent()){activateOptionalServices();return}
    if(document.getElementById('tskConsentBanner'))return;
    document.getElementById('tskPrivacyNotice')?.remove();
    const banner=document.createElement('section');banner.id='tskConsentBanner';banner.className='r72-consent';banner.setAttribute('role','dialog');banner.setAttribute('aria-label','ตัวเลือกความเป็นส่วนตัว');
    banner.innerHTML=`<div class="r72-consent-copy"><strong>เราเคารพความเป็นส่วนตัวของคุณ</strong><p>เราใช้ข้อมูลที่จำเป็นเพื่อให้ร้านค้าทำงาน ส่วนการวิเคราะห์และบริการภายนอกจะไม่เริ่มจนกว่าคุณจะยินยอม อ่าน <a href="privacy.html">นโยบายความเป็นส่วนตัว</a></p></div><div class="r72-consent-actions"><button class="r72-consent-reject" type="button" data-consent-reject>ปฏิเสธส่วนเสริม</button><button class="r72-consent-manage" type="button" data-consent-manage>ตั้งค่า</button><button class="r72-consent-accept" type="button" data-consent-accept>ยอมรับทั้งหมด</button></div>`;
    document.body.appendChild(banner);
    banner.querySelector('[data-consent-reject]').addEventListener('click',()=>saveConsent({analytics:false,marketing:false}));
    banner.querySelector('[data-consent-manage]').addEventListener('click',openConsentSettings);
    banner.querySelector('[data-consent-accept]').addEventListener('click',()=>saveConsent({analytics:true,marketing:true}));
  }
  window.tskConsentMount=mountConsent;
  window.tskOpenConsentSettings=openConsentSettings;

  function storedTheme(){
    const current=localStorage.getItem(THEME_KEY);
    if(current==='dark'||current==='light')return current;
    return localStorage.getItem('tsk_theme')==='dark'?'dark':'light';
  }
  function persistTheme(theme){
    localStorage.setItem(THEME_KEY,theme);
    localStorage.setItem('tsk_theme',theme);
  }
  function applyTheme(theme){
    const dark=theme==='dark';document.documentElement.dataset.theme=dark?'dark':'light';
    document.querySelectorAll('.r72-theme-toggle').forEach(button=>{button.setAttribute('aria-pressed',String(dark));button.textContent=dark?'☀ โหมดสว่าง':'◐ โหมดมืด'});
    document.querySelectorAll('.theme-toggle-btn').forEach(button=>{button.setAttribute('aria-pressed',String(dark));const label=button.querySelector('.tt-label');if(label)label.textContent=dark?'โหมดสว่าง':'โหมดมืด'});
  }
  function mountThemeToggle(){
    const topActions=document.querySelector('.top-actions');
    const existing=document.querySelector('.theme-toggle-btn');
    const legacy=document.querySelector('.r72-theme-toggle');
    if(existing){
      if(legacy&&legacy!==existing)legacy.remove();
      if(!existing.dataset.r72Bound){
        existing.dataset.r72Bound='1';
        existing.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();const next=document.documentElement.dataset.theme==='dark'?'light':'dark';persistTheme(next);applyTheme(next)},true);
      }
      applyTheme(storedTheme());
      return true;
    }
    if(!topActions)return false;
    let button=legacy;
    if(button){
      if(button.parentElement!==topActions)topActions.prepend(button);
      if(!button.dataset.r72Bound){
        button.dataset.r72Bound='1';
        button.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';persistTheme(next);applyTheme(next)});
      }
      applyTheme(storedTheme());
      return true;
    }
    button=document.createElement('button');button.type='button';button.className='r72-theme-toggle';button.setAttribute('aria-label','สลับโหมดสี');
    button.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';persistTheme(next);applyTheme(next)});
    topActions.prepend(button);applyTheme(storedTheme());return true;
  }
  applyTheme(storedTheme());

  function mountCookieSettingsLink(){
    const host=document.querySelector('.footer-bottom,.footer-legal,.site-footer .wrap');if(!host||document.getElementById('tskCookieSettingsButton'))return;
    const button=document.createElement('button');button.id='tskCookieSettingsButton';button.type='button';button.className='r72-cookie-settings';button.textContent='ตั้งค่าคุกกี้';button.addEventListener('click',openConsentSettings);host.appendChild(button);
  }

  function enhanceA11y(root=document){
    if(root===document){
      const main=document.getElementById('main-content')||document.querySelector('main')||document.querySelector('body[data-page="home"] .home-commerce')||document.querySelector('body>section');
      if(main){if(!main.id)main.id='main-content';main.setAttribute('tabindex','-1')}
      const existing=document.querySelector('.skip-link,.tsk-skip-link');
      if(existing){existing.classList.add('tsk-skip-link');if(main)existing.href=`#${main.id}`}
      else if(main){const link=document.createElement('a');link.href=`#${main.id}`;link.className='tsk-skip-link';link.textContent='ข้ามไปยังเนื้อหาหลัก';document.body.prepend(link)}
    }
    const all=selector=>root.matches?.(selector)?[root]:[...root.querySelectorAll?.(selector)||[]];
    all('img:not([alt])').forEach(image=>{const label=image.closest('[data-product-name]')?.dataset.productName||image.closest('a')?.textContent?.trim();image.alt=label?`รูป ${label}`:'';if(!label)image.setAttribute('role','presentation')});
    all('button[title]:not([aria-label])').forEach(button=>button.setAttribute('aria-label',button.title));
    all('button:not([type])').forEach(button=>{if(!button.closest('form'))button.type='button'});
    all('input:not([aria-label]),select:not([aria-label]),textarea:not([aria-label])').forEach(field=>{if(field.id&&document.querySelector(`label[for="${CSS.escape(field.id)}"]`))return;if(field.closest('label'))return;const label=field.getAttribute('placeholder')||field.getAttribute('name')||field.id;if(label)field.setAttribute('aria-label',label)});
    all('.empty-state,.r63-empty,.tsk-empty').forEach(node=>node.setAttribute('role','status'));
    all('[onclick]:not(a):not(button):not(input):not(select):not(textarea)').forEach(node=>{if(!node.hasAttribute('tabindex'))node.tabIndex=0;if(!node.hasAttribute('role'))node.setAttribute('role','button');if(node.dataset.r72KeyBound)return;node.dataset.r72KeyBound='1';node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();node.click()}})});
    document.querySelector('.toast')?.setAttribute('aria-live','polite');
  }

  let quickReturnFocus=null;
  function ensureQuickView(){
    let modal=document.getElementById('tskQuickView');if(modal)return modal;
    modal=document.createElement('div');modal.id='tskQuickView';modal.className='r72-modal';modal.hidden=true;
    modal.innerHTML='<section class="r72-modal-card" role="dialog" aria-modal="true" aria-labelledby="tskQuickTitle"><button type="button" class="r72-modal-close" data-qv-close aria-label="ปิดหน้าดูสินค้าแบบย่อ">×</button><div id="tskQuickContent"></div></section>';
    document.body.appendChild(modal);
    modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('[data-qv-close]'))closeQuickView();const add=event.target.closest('[data-qv-add]');if(add){const product=window.getProductById?.(decodeURIComponent(add.dataset.qvAdd));if(product){const variant=(product.variants||[]).find(v=>v.is_default)||(product.variants||[])[0];window.addToCart?.(product.id,1,variant?.id||'');closeQuickView()}}});
    return modal;
  }
  function closeQuickView(){const modal=document.getElementById('tskQuickView');if(modal)modal.hidden=true;document.body.style.overflow='';quickReturnFocus?.focus?.()}
  window.tskOpenQuickView=function(id,trigger){
    const product=window.getProductById?.(id);if(!product)return window.showToast?.('ยังไม่พบข้อมูลสินค้า');
    quickReturnFocus=trigger||document.activeElement;
    const modal=ensureQuickView(),out=product.stock!==undefined&&product.stock!==null&&Number(product.stock)<=0;
    modal.querySelector('#tskQuickContent').innerHTML=`<div class="r72-qv-grid"><div class="r72-qv-image"><img src="${asset(product.img)}" alt="${esc(product.name)}" decoding="async"></div><div class="r72-qv-copy"><div class="p-brand">${esc(product.brand||'THAISERKIT SUPPLY')}</div><h2 id="tskQuickTitle">${esc(product.name)}</h2><div class="r72-qv-price"><span>${money(product.price)}</span>${product.oldPrice?`<del>${money(product.oldPrice)}</del>`:''}</div><div class="r72-qv-stock${out?' out':''}">${out?'สินค้าหมดชั่วคราว':'พร้อมสั่งซื้อ · จัดส่งทั่วประเทศ'}</div><div class="r72-qv-actions"><button type="button" class="btn-solid" data-qv-add="${encodeURIComponent(String(product.id||''))}" ${out?'disabled':''}>เพิ่มลงตะกร้า</button><a class="btn-line" href="product.html?id=${encodeURIComponent(String(product.id||''))}">ดูรายละเอียดและตัวเลือก</a></div></div></div>`;
    modal.hidden=false;document.body.style.overflow='hidden';modal.querySelector('[data-qv-close]').focus();enhanceA11y(modal);
  };

  function mountHeroValue(){
    const hero=document.querySelector('body[data-page="home"] .hero-slide');if(!hero||hero.querySelector('.r72-hero-value'))return;
    const value=document.createElement('div');value.className='r72-hero-value';value.innerHTML='<span>THAISERKIT SUPPLY · OFFICIAL STORE</span><h1>เครื่องมือคุณภาพ พร้อมใช้ พร้อมส่ง</h1><p>เลือกสินค้าแท้จากแบรนด์ชั้นนำ พร้อมคำแนะนำ บริการหลังการขาย และจัดส่งทั่วประเทศ</p><a href="products.html">เลือกซื้อสินค้าทั้งหมด →</a>';hero.appendChild(value);
  }

  function recentIds(){return readJson(RECENT_KEY,[]).filter(id=>typeof id==='string').slice(0,8)}
  function rememberProduct(product){if(!product?.id)return;const id=String(product.id),next=[id,...recentIds().filter(item=>item!==id)].slice(0,8);localStorage.setItem(RECENT_KEY,JSON.stringify(next))}
  function mountRecentProducts(){
    if(document.getElementById('tskRecentProducts')||typeof window.getProductById!=='function'||typeof window.productCardHtml!=='function')return;
    const current=String(window.__currentProduct?.id||''),products=recentIds().filter(id=>id!==current).map(id=>window.getProductById(id)).filter(Boolean).slice(0,4);
    if(!products.length)return;
    const footer=document.getElementById('site-footer');if(!footer)return;
    const section=document.createElement('section');section.id='tskRecentProducts';section.className='r72-recent';section.setAttribute('aria-labelledby','tskRecentHeading');
    section.innerHTML=`<div class="wrap"><div class="r72-recent-head"><div><h2 id="tskRecentHeading">ดูล่าสุด</h2><p>กลับไปดูสินค้าที่คุณสนใจได้ทันที</p></div><a class="btn-outline" href="products.html">ดูสินค้าทั้งหมด</a></div><div class="r72-recent-grid">${products.map(window.productCardHtml).join('')}</div></div>`;
    footer.before(section);enhanceA11y(section);
  }

  function waitForProduct(attempt=0){
    const product=window.__currentProduct;
    if(product){rememberProduct(product);mountMobileAtc(product);mountRecentProducts();return}
    if(attempt<30)setTimeout(()=>waitForProduct(attempt+1),200);
  }
  function mountMobileAtc(product){
    if(document.getElementById('tskMobileAtc'))return;
    const out=product.stock!==undefined&&product.stock!==null&&Number(product.stock)<=0;
    const bar=document.createElement('div');bar.id='tskMobileAtc';bar.className='r72-mobile-atc';bar.innerHTML=`<div class="r72-mobile-atc-copy"><small>${esc(product.name)}</small><strong>${money(product.price)}</strong></div><button type="button" class="btn-solid" ${out?'disabled':''}>${out?'สินค้าหมด':'เพิ่มลงตะกร้า'}</button>`;
    bar.querySelector('button').addEventListener('click',()=>window.addToCart?.(product.id,Math.max(1,Number(document.getElementById('qtyInput')?.value||1)),window.__selectedVariantId||''));
    document.body.appendChild(bar);document.body.classList.add('r72-has-mobile-atc');
  }

  function bindGlobalKeys(){
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'){if(!document.getElementById('tskQuickView')?.hidden)closeQuickView();if(!document.getElementById('tskConsentSettings')?.hidden)closeConsentSettings()}
      if(event.key!=='Tab')return;
      const modal=[document.getElementById('tskQuickView'),document.getElementById('tskConsentSettings')].find(node=>node&&!node.hidden);if(!modal)return;
      const focusable=[...modal.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')];if(!focusable.length)return;
      const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    });
  }

  document.addEventListener('DOMContentLoaded',()=>{
    mountConsent();mountHeroValue();enhanceA11y();bindGlobalKeys();
    if(!mountThemeToggle())setTimeout(mountThemeToggle,100);
    mountCookieSettingsLink();setTimeout(mountCookieSettingsLink,150);
    if(document.body.dataset.page==='product')waitForProduct();else setTimeout(mountRecentProducts,700);
    const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)enhanceA11y(node)})));observer.observe(document.body,{subtree:true,childList:true});
  });
})();


/* R94: keep the light-mode control discoverable in the compact utility header. */
(function(){
  'use strict';
  const THEME_KEY='tsk_theme_r72';
  const LEGACY_THEME_KEY='tsk_theme';
  const readTheme=()=>{const value=localStorage.getItem(THEME_KEY)||localStorage.getItem(LEGACY_THEME_KEY);return value==='dark'?'dark':'light'};
  const syncTheme=(theme)=>{
    const dark=theme==='dark';
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.querySelectorAll('.theme-toggle-btn').forEach(button=>{
      button.setAttribute('aria-pressed',String(dark));
      const label=button.querySelector('.tt-label');
      if(label)label.textContent=dark?'โหมดสว่าง':'โหมดมืด';
    });
    document.querySelectorAll('.r72-theme-toggle').forEach(button=>{
      button.setAttribute('aria-pressed',String(dark));
      button.textContent=dark?'☀ โหมดสว่าง':'◐ โหมดมืด';
    });
  };
  const toggle=(event)=>{
    event.preventDefault();
    event.stopPropagation();
    const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
    localStorage.setItem(THEME_KEY,next);
    localStorage.setItem(LEGACY_THEME_KEY,next);
    syncTheme(next);
  };
  const mount=()=>{
    const host=document.querySelector('.market-utility-inner');
    if(!host)return;
    let button=host.querySelector('.r72-theme-toggle');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='r72-theme-toggle';
      button.setAttribute('aria-label','สลับโหมดมืด/สว่าง');
      host.appendChild(button);
    }
    if(button.dataset.r94Bound!=='1'){
      button.dataset.r94Bound='1';
      button.addEventListener('click',toggle);
    }
    syncTheme(readTheme());
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
  
})();


/* R95: add a clear customer sign-up CTA and simplify admin-settings labels. */
(function(){
  'use strict';
  const addMemberCta=()=>{
    const card=document.querySelector('.home-member-card');
    if(!card||card.querySelector('.member-signup-btn'))return;
    const link=document.createElement('a');
    link.className='member-signup-btn';
    link.href='login.html';
    link.textContent='สมัครสมาชิก';
    card.appendChild(link);
  };
  const stripSettingsIcons=()=>{
    if(document.body?.dataset.page!=='admin-settings')return;
    document.querySelectorAll('.as-nav,.as-card h3,.as-card button,.as-card label.btn-outline').forEach(element=>{
      if(element.dataset.r95IconsRemoved==='1')return;
      const textNode=[...element.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim());
      if(textNode){
        textNode.textContent=textNode.textContent.replace(/^\s*(?:(?:\p{Extended_Pictographic}|\uFE0F|\u200D)|\s)+/u,'').trimStart();
      }
      element.dataset.r95IconsRemoved='1';
    });
  };
  const mount=()=>{addMemberCta();stripSettingsIcons();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});
})();
