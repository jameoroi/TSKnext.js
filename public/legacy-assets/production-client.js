(function(){
  // One API path everywhere. This used to choose between /api and the
  // Netlify functions route by hostname; there is no Netlify deployment left,
  // and /api is answered on *.pages.dev, on custom domains and locally.
  const API='/api';
  let session={admin:false,customer:null,csrf:'',social:{},promptpay_id:''};
  let refreshPromise=null,sessionHeartbeatTimer=0;
  function handleExpiredAdminSession(action,status){
    if(status!==401||!String(action||'').startsWith('admin.')||action==='admin.login')return;
    session.admin=false;session.admin_role=null;session.csrf='';
    sessionStorage.removeItem('tsk_server_admin');sessionStorage.removeItem('tsk_server_admin_role');sessionStorage.removeItem('tsk_server_admin_username');
    if(/\/admin(?:\.html)?$/.test(location.pathname))setTimeout(()=>location.replace('login.html?next=admin&reason=session-expired'),0);
  }
  const API_RETRY_DELAYS=[0,500,1400];
  const IDEMPOTENT_POST_ACTIONS=new Set(['admin.products.bulk_import','admin.products.bulk_update','admin.products.bulk_patch']);
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function requestJson(action,url,opt){
    const attempts=opt.method==='GET'||IDEMPOTENT_POST_ACTIONS.has(action)?API_RETRY_DELAYS.length:1;
    let lastError;
    for(let attempt=0;attempt<attempts;attempt++){
      if(API_RETRY_DELAYS[attempt])await wait(API_RETRY_DELAYS[attempt]);
      try{
        const r=await fetch(url,opt);let j={};try{j=await r.json();}catch(_){ }
        if(r.ok)return j;
        const error=Object.assign(new Error(j.error||'request_failed'),{status:r.status,data:j});
        const retryable=[408,425,429,500,502,503,504].includes(r.status);
        if(!retryable||attempt===attempts-1){handleExpiredAdminSession(action,r.status);throw error;}
        const retryAfter=Number(r.headers.get('retry-after')||0);
        if(retryAfter>0)await wait(Math.min(10000,retryAfter*1000));
        lastError=error;
      }catch(error){
        if(error?.status&&!([408,425,429,500,502,503,504].includes(error.status)))throw error;
        lastError=error;
        if(attempt===attempts-1)throw error;
      }
    }
    throw lastError||new Error('request_failed');
  }
  async function call(action,data={},method='POST'){
    const opt={method,credentials:'same-origin',headers:{'Accept':'application/json'}};
    if(method!=='GET'){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify({...data,csrf:session.csrf});}
    return requestJson(action,`${API}?action=${encodeURIComponent(action)}`,opt);
  }
  /* Like call(), but for GET requests that need extra query params (pagination/search/filters)
     alongside `action` — params are appended as real query params, never mixed into the action string. */
  async function callQS(action,params={},method='GET'){
    const opt={method,credentials:'same-origin',headers:{'Accept':'application/json'}};
    const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!==undefined&&v!==null&&v!=='')).toString();
    return requestJson(action,`${API}?action=${encodeURIComponent(action)}${qs?('&'+qs):''}`,opt);
  }
  async function refresh(){
    if(refreshPromise)return refreshPromise;
    refreshPromise=(async()=>{const next=await call('session',{},'GET');session=next;window.TSK_SESSION=session;if(session.admin){sessionStorage.setItem('tsk_server_admin','1');sessionStorage.setItem('tsk_server_admin_role',session.admin_role||'admin');sessionStorage.setItem('tsk_server_admin_username',session.admin_username||'');}else{sessionStorage.removeItem('tsk_server_admin');sessionStorage.removeItem('tsk_server_admin_role');sessionStorage.removeItem('tsk_server_admin_username');}if(session.customer)sessionStorage.setItem('tsk_server_customer',JSON.stringify(session.customer));else sessionStorage.removeItem('tsk_server_customer');applySocial(session.social||{});return session;})();
    try{return await refreshPromise;}finally{refreshPromise=null;}
  }
  function sessionLooksActive(){return session.admin||session.customer||sessionStorage.getItem('tsk_server_admin')==='1'||!!sessionStorage.getItem('tsk_server_customer');}
  async function keepSessionAlive(){if(document.visibilityState==='hidden'||!sessionLooksActive())return;try{await refresh();window.dispatchEvent(new CustomEvent('tsk:session-alive',{detail:{expires_at:session.session_expires_at||null}}));}catch(error){window.dispatchEvent(new CustomEvent('tsk:session-temporary-error',{detail:{status:error?.status||0}}));}}
  function startSessionHeartbeat(){if(sessionHeartbeatTimer)return;sessionHeartbeatTimer=setInterval(keepSessionAlive,5*60*1000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')keepSessionAlive();});window.addEventListener('online',keepSessionAlive);}
  const DEFAULT_BRANDING={site_title:'THAISERKIT SUPPLY | ไทยเซอร์กิจ ซัพพลาย',company_name:'THAISERKIT SUPPLY',company_subtitle:'ไทยเซอร์กิจ ซัพพลาย',logo_data_url:'',favicon_data_url:'',entry_popup:{enabled:false,image_url:'',link_url:'',alt_text:'โปรโมชั่นพิเศษจาก THAISERKIT SUPPLY',frequency:'session',delay_ms:700,start_at:'',end_at:''}};
  let branding={...DEFAULT_BRANDING};
  function pageTitleFromSiteTitle(siteTitle){const current=document.title||'';if(document.body?.dataset?.page==='home'||location.pathname==='/'||/\/index\.html$/.test(location.pathname))return siteTitle;const prefix=current.includes('|')?current.split('|')[0].trim():current.trim();const short=(siteTitle.split('|')[0]||siteTitle).trim();return prefix?`${prefix} | ${short}`:siteTitle;}
  function ensureFavicon(href){const value=String(href||'').trim();if(!value)return;let link=document.querySelector('link[rel~=\"icon\"]');if(!link){link=document.createElement('link');link.rel='icon';document.head.appendChild(link);}link.href=value;}
  function ensureCanonical(){
    const cleanPath=location.pathname.endsWith('/index.html')?location.pathname.slice(0,-10)||'/':location.pathname;
    const publicOrigin='https://jayxtsk.shop';
    const host=location.hostname.toLowerCase();
    if(host==='thaiserxtra.pages.dev' && location.origin!==publicOrigin){ location.replace(publicOrigin+cleanPath+location.search+location.hash); return; }
    const href=publicOrigin+cleanPath;
    let c=document.querySelector('link[rel="canonical"]'); if(!c){c=document.createElement('link');c.rel='canonical';document.head.appendChild(c);} c.href=href;
    let og=document.querySelector('meta[property="og:url"]'); if(!og){og=document.createElement('meta');og.setAttribute('property','og:url');document.head.appendChild(og);} og.content=href;
  }
  const GOOGLE_FONT_MAP = {
    "'Kanit',sans-serif":'Kanit:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400',
    "'Prompt',sans-serif":'Prompt:wght@300;400;500;600;700;800',
    "'Sarabun',sans-serif":'Sarabun:wght@300;400;500;600;700;800',
    "'Mitr',sans-serif":'Mitr:wght@300;400;500;600;700',
    "'Noto Sans Thai',sans-serif":'Noto+Sans+Thai:wght@300;400;500;600;700;800'
  };
  function ensureGoogleFont(fontFamilyCss){
    const spec = GOOGLE_FONT_MAP[fontFamilyCss]; if(!spec) return;
    const id = 'tsk-dynamic-font-'+spec.split(':')[0];
    if(document.getElementById(id)) return;
    const link=document.createElement('link'); link.id=id; link.rel='stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
    document.head.appendChild(link);
  }
  function applyTheme(theme){
    if(!theme) return;
    const root=document.documentElement.style;
    const map={dark_1:'--dark-1',dark_2:'--dark-2',dark_3:'--dark-3',pink:'--pink',pink_light:'--pink-light',pink_deep:'--pink-deep',gold_accent:'--gold-accent',gold_soft:'--gold-soft',rose_shadow:'--rose-shadow',gray:'--gray',border:'--border'};
    Object.entries(map).forEach(([k,cssVar])=>{ if(theme[k]) root.setProperty(cssVar, theme[k]); });
    if(theme.font_family){ ensureGoogleFont(theme.font_family); document.body.style.fontFamily = theme.font_family; }
    if(theme.radius_scale!==undefined) root.setProperty('--radius-scale', theme.radius_scale);
    window.TSK_THEME = theme;
  }
  function cleanHeaderLogoBackground(img){
    if(!img || img.dataset.tskLogoCleaned==='1') return;
    const run=()=>{
      try{
        const w=img.naturalWidth||0,h=img.naturalHeight||0;if(!w||!h)return;
        const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);
        const frame=ctx.getImageData(0,0,w,h),d=frame.data,seen=new Uint8Array(w*h),q=[];
        const nearWhite=(i)=>{const r=d[i],g=d[i+1],b=d[i+2],a=d[i+3],neutral=Math.max(r,g,b)-Math.min(r,g,b)<=22&&Math.min(r,g,b)>=150;return a<=12||(r>=242&&g>=242&&b>=242||neutral)};
        const push=(x,y)=>{if(x<0||y<0||x>=w||y>=h)return;const n=y*w+x;if(seen[n])return;const i=n*4;if(!nearWhite(i))return;seen[n]=1;q.push(n);};
        for(let x=0;x<w;x++){push(x,0);push(x,h-1)} for(let y=1;y<h-1;y++){push(0,y);push(w-1,y)}
        for(let k=0;k<q.length;k++){const n=q[k],x=n%w,y=(n/w)|0,i=n*4;d[i+3]=0;push(x-1,y);push(x+1,y);push(x,y-1);push(x,y+1)}
        if(q.length){ctx.putImageData(frame,0,0);img.dataset.tskLogoCleaned='1';img.src=c.toDataURL('image/png');}
      }catch(_){ }
    };
    if(img.complete&&img.naturalWidth)run();else img.addEventListener('load',run,{once:true});
  }
  function cleanStaticBrandLogos(){
    document.querySelectorAll('.brand-logo img').forEach(cleanHeaderLogoBackground);
  }
  document.addEventListener('DOMContentLoaded',cleanStaticBrandLogos,{once:true});
  window.addEventListener('load',cleanStaticBrandLogos,{once:true});
  setTimeout(cleanStaticBrandLogos,1500);
  let entryPopupTimer=0;
  function safeEntryImage(value){const url=String(value||'').trim();return /^(?:https:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(url)?url:'';}
  function safeEntryLink(value){const url=String(value||'').trim();if(/^https:\/\/[^\s]+$/i.test(url))return url;if(/^(?:[a-z0-9][a-z0-9._-]*\.html(?:\?[a-z0-9_=&%+.,:-]*)?|\/(?!\/)[a-z0-9_\-./]*(?:\?[a-z0-9_=&%+.,:-]*)?)$/i.test(url))return url;return '';}
  function entryPopupDateActive(config){const now=Date.now(),start=config.start_at?Date.parse(config.start_at):0,end=config.end_at?Date.parse(config.end_at):0;return (!start||now>=start)&&(!end||now<=end);}
  function entryPopupSeen(config){try{if(config.frequency==='always')return false;if(config.frequency==='daily')return localStorage.getItem('tsk_entry_popup_daily_r75')===new Date().toISOString().slice(0,10);return sessionStorage.getItem('tsk_entry_popup_session_r75')==='1';}catch{return false;}}
  function markEntryPopupSeen(config){try{if(config.frequency==='daily')localStorage.setItem('tsk_entry_popup_daily_r75',new Date().toISOString().slice(0,10));else if(config.frequency!=='always')sessionStorage.setItem('tsk_entry_popup_session_r75','1');}catch{} }
  function closeEntryPopup(){const modal=document.getElementById('tskEntryPopup');if(!modal)return;modal.classList.add('is-closing');document.body.classList.remove('r75-popup-open');setTimeout(()=>modal.remove(),180);}
  function mountEntryPopup(config){
    if(document.getElementById('tskEntryPopup')||document.body?.dataset?.page!=='home')return;
    const imageUrl=safeEntryImage(config.image_url);if(!config.enabled||!imageUrl||!entryPopupDateActive(config)||entryPopupSeen(config))return;
    const modal=document.createElement('div');modal.id='tskEntryPopup';modal.className='r75-entry-popup';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',String(config.alt_text||'โปรโมชั่นพิเศษ'));
    const panel=document.createElement('div');panel.className='r75-entry-popup-panel';
    const close=document.createElement('button');close.type='button';close.className='r75-entry-popup-close';close.setAttribute('aria-label','ปิดป๊อปอัป');close.textContent='×';close.addEventListener('click',closeEntryPopup);
    const image=document.createElement('img');image.src=imageUrl;image.alt=String(config.alt_text||'โปรโมชั่นพิเศษ');image.decoding='async';image.addEventListener('error',closeEntryPopup,{once:true});
    const link=safeEntryLink(config.link_url);if(link){const anchor=document.createElement('a');anchor.className='r75-entry-popup-link';anchor.href=link;if(/^https:\/\//i.test(link)&&!link.startsWith(location.origin)){anchor.target='_blank';anchor.rel='noopener noreferrer';}anchor.appendChild(image);panel.appendChild(anchor);}else panel.appendChild(image);
    panel.appendChild(close);modal.appendChild(panel);modal.addEventListener('click',event=>{if(event.target===modal)closeEntryPopup();});
    const onKey=event=>{if(event.key==='Escape'){closeEntryPopup();document.removeEventListener('keydown',onKey);}};document.addEventListener('keydown',onKey);
    document.body.appendChild(modal);document.body.classList.add('r75-popup-open');markEntryPopupSeen(config);requestAnimationFrame(()=>modal.classList.add('is-visible'));setTimeout(()=>close.focus(),60);
  }
  function syncEntryPopup(settings){clearTimeout(entryPopupTimer);const config={...DEFAULT_BRANDING.entry_popup,...(settings?.entry_popup||{})};if(!config.enabled){closeEntryPopup();return;}entryPopupTimer=setTimeout(()=>mountEntryPopup(config),Math.min(10000,Math.max(0,Number(config.delay_ms)||0)));}
  function applyBranding(settings){branding={...DEFAULT_BRANDING,...(settings||{}),entry_popup:{...DEFAULT_BRANDING.entry_popup,...(settings?.entry_popup||{})}};window.TSK_SITE_SETTINGS=branding;document.title=pageTitleFromSiteTitle(branding.site_title);ensureFavicon(branding.favicon_data_url);const logo=String(branding.logo_data_url||'').trim();document.querySelectorAll('.brand-logo').forEach(slot=>{let img=slot.querySelector('img'),mark=slot.querySelector('.brand-mark-text');if(logo){if(!img){img=document.createElement('img');img.alt=branding.company_name||'THAISERKIT SUPPLY';slot.prepend(img);}img.dataset.tskLogoCleaned='0';img.src=logo;img.style.display='';cleanHeaderLogoBackground(img);if(mark)mark.style.display='none';}else{if(img)img.remove();if(mark)mark.style.display='inline-flex';}});document.querySelectorAll('.brand-name-th').forEach(el=>el.textContent=branding.company_name);document.querySelectorAll('.brand-name-en').forEach(el=>el.textContent=branding.company_subtitle||'');document.querySelectorAll('meta[property=\"og:site_name\"]').forEach(m=>m.content=branding.company_name);document.querySelectorAll('meta[property=\"og:title\"]').forEach(m=>m.content=document.title);applyTheme(settings?.theme);syncEntryPopup(branding);window.dispatchEvent(new CustomEvent('tsk:branding',{detail:branding}));return branding;}
  async function loadBranding(){try{const r=await call('site.settings',{},'GET');return applyBranding(r.settings||{});}catch(e){return applyBranding(DEFAULT_BRANDING);}}
  function applySocial(social){const fb=social.facebook||{};const f=fb.page_username||fb.page_id||'';document.querySelectorAll('a[aria-label="Facebook"]').forEach(a=>{if(f){a.href='https://facebook.com/'+encodeURIComponent(f);a.target='_blank';}});const line=(social.line||{}).oa_url||'';document.querySelectorAll('a[aria-label="Line"]').forEach(a=>{if(line){a.href=line;a.target='_blank';}});/* NOTE: a second floating Messenger button used to be built here from scratch,
   which duplicated the .fb-chat-bubble already mounted by partials.js —
   two overlapping "chat" buttons in the corner. Now we just point the single
   existing bubble at the admin-configured page (see tskSyncMessengerBubble
   in site-refresh-v22.js), so there is always exactly one chat button. */
if(f&&typeof window.tskSyncMessengerBubble==='function') window.tskSyncMessengerBubble(f);}
  window.TSK_API={call,refresh,keepSessionAlive,loadBranding,applyBranding,get branding(){return branding;},get session(){return session;}};
  startSessionHeartbeat();
  window.tskSaveSiteSettings=async function(data){const r=await call('admin.site.settings',{...data,csrf:session.csrf});applyBranding(r.settings||data);return r;};
  window.tskAdminBannersList=async function(){const r=await call('site.settings',{},'GET');return {ok:true,banners:Array.isArray(r.settings?.banners)?r.settings.banners:[]};};
  window.tskAdminBannersSave=async function(banners){const current=await call('site.settings',{},'GET');const s=current.settings||{};const r=await call('admin.site.settings',{...s,banners:Array.isArray(banners)?banners:[],csrf:session.csrf});applyBranding(r.settings||s);return r;};
  window.tskSaveTheme=async function(theme){const r=await call('admin.theme.settings',{theme,csrf:session.csrf});applyBranding(r.settings||{theme});return r;};
  window.tskResetTheme=async function(){const r=await call('admin.theme.reset',{csrf:session.csrf});applyBranding(r.settings||{});return r;};
  window.tskSubscribeNewsletter=async function(email){return call('newsletter.subscribe',{email});};
  window.tskSuppliersList=async function(){return call('suppliers.list',{},'GET');};
  window.tskAdminSuppliersList=async function(){return call('admin.suppliers.list',{},'GET');};
  window.tskAdminSupplierSave=async function(data){return call('admin.suppliers.save',{...data,csrf:session.csrf});};
  window.tskAdminSupplierCredentials=async function(data){return call('admin.suppliers.credentials',{...data,csrf:session.csrf});};
  window.tskAdminSupplierAssignProducts=async function(supplier_id,product_ids){return call('admin.suppliers.assign_products',{supplier_id,product_ids,csrf:session.csrf});};
  window.tskAdminSettlementsList=async function(){return call('admin.settlements.list',{},'GET');};
  window.tskAdminSettlementAction=async function(id,operation,extra={}){return call('admin.settlements.action',{id,operation,...extra,csrf:session.csrf});};
  window.tskSupplierLogin=async function(email,password){const r=await call('supplier.login',{email,password});session.csrf=r.csrf||'';return r;};
  window.tskSupplierLogout=async function(){return call('supplier.logout',{});};
  window.tskSupplierDashboard=async function(){return call('supplier.dashboard',{},'GET');};
  window.tskSupplierPassword=async function(old_password,new_password){return call('supplier.password',{old_password,new_password,csrf:session.csrf});};
  window.tskSupplierFulfillmentUpdate=async function(order_id,data){return call('supplier.fulfillment.update',{order_id,...data,csrf:session.csrf});};
  window.tskContact=async function(payload){return call('contact.create',payload);};
  window.tskValidateCheckoutStock=async function(items){return call('checkout.stock.validate',{items});};
  window.tskCreateOrder=async function(payload){try{const a=JSON.parse(localStorage.getItem('tsk_agent_ref')||'null');if(a&&a.code&&Date.now()<Number(a.expires_at||0))payload={...payload,agent_ref:a.code};}catch{}return call('order.create',payload);};
  window.tskCheckoutSettings=async function(){return call('checkout.settings',{},'GET');};
  window.tskAdminLogin=async function(username,password){const r=await call('admin.login',{username,password});session.admin=true;session.admin_role=r.role||'admin';session.csrf=r.csrf||'';sessionStorage.setItem('tsk_server_admin','1');sessionStorage.setItem('tsk_server_admin_role',r.role||'admin');sessionStorage.setItem('tsk_server_admin_username',String(username||'').trim());return r;};
  window.tskAdminLogout=async function(){try{return await call('admin.logout',{});}finally{session.admin=false;session.csrf='';sessionStorage.removeItem('tsk_server_admin');sessionStorage.removeItem('tsk_server_admin_role');sessionStorage.removeItem('tsk_server_admin_username');}};
  window.tskCustomerLogin=async function(identifier,password){const r=await call('customer.login',{identifier,password});session.customer=r.customer;session.csrf=r.csrf||'';sessionStorage.setItem('tsk_server_customer',JSON.stringify(r.customer));return r;};
  window.tskCustomerProfile=async function(data){const r=await call('customer.profile',{...data,csrf:session.csrf});session.customer=r.customer;sessionStorage.setItem('tsk_server_customer',JSON.stringify(r.customer));return r;};
  window.tskCustomerPassword=async function(old_password,new_password){return call('customer.password',{old_password,new_password,csrf:session.csrf});};
  window.tskCustomerOrders=async function(){return call('customer.orders',{},'GET');};
  window.tskCustomerRegister=async function(data){const r=await call('customer.register',data);session.customer=r.customer;session.csrf=r.csrf||'';sessionStorage.setItem('tsk_server_customer',JSON.stringify(r.customer));return r;};
  window.tskCustomerLogout=async function(){try{return await call('customer.logout',{});}finally{session.customer=null;session.csrf='';sessionStorage.removeItem('tsk_server_customer');}};

  /* ---- Super Admin: business settings (payment / email / facebook) ---- */
  window.tskGetBusinessSettings=async function(){return call('business.settings.get',{},'GET');};
  window.tskSaveBusinessSettings=async function(data){return call('business.settings.save',{...data,csrf:session.csrf});};
  window.tskTestEmail=async function(to){return call('business.settings.test_email',{to,csrf:session.csrf});};
  window.tskProductionStatus=async function(){return call('admin.production.status',{},'GET');};
  window.tskTestTelegram=async function(){return call('admin.production.test_telegram',{csrf:session.csrf});};
  window.tskBackupExport=async function(){return call('admin.backup.export',{},'GET');};
  window.tskBackupRestore=async function(backup){return call('admin.backup.restore',{backup,csrf:session.csrf});};

  /* ---- Media storage: S3/R2/Supabase-compatible object storage via short-lived signed upload URLs ---- */
  window.tskAdminMediaUpload=async function(file,{owner_type='misc',owner_id=''}={}){
    if(!(file instanceof Blob)) throw new Error('invalid_file');
    const filename=file.name||`image-${Date.now()}.webp`;
    const mime_type=file.type||'application/octet-stream';
    const p=await call('admin.media.presign',{filename,mime_type,owner_type,owner_id,csrf:session.csrf});
    const put=await fetch(p.upload_url,{method:'PUT',headers:{'Content-Type':mime_type},body:file});
    if(!put.ok) throw new Error('media_upload_failed');
    let width=0,height=0;
    if(/^image\//.test(mime_type)){ try{ const bm=await createImageBitmap(file);width=bm.width;height=bm.height;bm.close(); }catch{} }
    const c=await call('admin.media.commit',{key:p.key,public_url:p.public_url,mime_type,size_bytes:file.size,width,height,owner_type,owner_id,csrf:session.csrf});
    return c.asset||{key:p.key,public_url:p.public_url};
  };
  window.tskAdminMediaList=async function(params={}){return callQS('admin.media.list',params);};
  window.tskAdminMediaDelete=async function(key){return call('admin.media.delete',{key,csrf:session.csrf});};

  /* ---- Super Admin: sub-admin (role) management ---- */
  window.tskAdminUsersList=async function(){return call('admin.users.list',{},'GET');};
  window.tskAdminUserCreate=async function(data){return call('admin.users.create',{...data,csrf:session.csrf});};
  window.tskAdminUserUpdate=async function(data){return call('admin.users.update',{...data,csrf:session.csrf});};
  window.tskAdminUserDelete=async function(id){return call('admin.users.delete',{id,csrf:session.csrf});};
  window.tskAdminPasswordChange=async function(old_password,new_password){return call('admin.password',{old_password,new_password,csrf:session.csrf});};

  /* ---- Admin: orders / contacts / email ---- */
  window.tskAdminOrdersList=async function(){return call('admin.orders.list',{},'GET');};
  window.tskAdminContactsList=async function(){return call('admin.contacts.list',{},'GET');};
  window.tskSendEmail=async function(data){return call('email.send',{...data,csrf:session.csrf});};

  /* ---- Admin: Facebook Messenger inbox ---- */
  window.tskFbConversations=async function(){return call('facebook.conversations.list',{},'GET');};
  window.tskFbConversationGet=async function(psid){return call('facebook.conversation.get',{psid});};
  window.tskFbMessageSend=async function(psid,text){return call('facebook.message.send',{psid,text,csrf:session.csrf});};

  /* ---- Payment: PromptPay QR / slip upload & verification / order status ---- */
  window.tskPromptPayQr=async function(amount){return call('payment.promptpay_qr',{amount});};
  window.tskUploadSlip=async function(order_no,image_data_url,note,upload_token=''){return call('payment.slip.upload',{order_no,image_data_url,note,upload_token});};
  window.tskAdminSlipsList=async function(){return call('admin.slips.list',{},'GET');};
  window.tskAdminSlipVerify=async function(id,approve){return call('admin.slip.verify',{id,approve,csrf:session.csrf});};
  window.tskAdminOrderStatus=async function(id,status){return call('admin.order.status',{id,status,csrf:session.csrf});};
  window.tskOmiseCharge=async function(data){return call('payment.omise.charge',{...data,csrf:session.csrf});};

  /* ---- Marketplace: Shopee / Lazada (separate function) ---- */
  const MKT_API='/api/marketplace';
  async function mktCall(action,data={},method='POST'){
    const opt={method,credentials:'same-origin',headers:{'Accept':'application/json'}};
    if(method!=='GET'){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify({...data,csrf:session.csrf});}
    const r=await fetch(`${MKT_API}?action=${encodeURIComponent(action)}`,opt); let j={};try{j=await r.json();}catch(_){ } if(!r.ok) throw Object.assign(new Error(j.error||'request_failed'),{status:r.status,data:j}); return j;
  }
  window.tskShopeeAuthUrl=async function(){return mktCall('shopee.auth_url',{},'GET');};
  window.tskShopeeStatus=async function(){return mktCall('shopee.status',{},'GET');};
  window.tskShopeeProducts=async function(){return mktCall('shopee.products',{},'GET');};
  window.tskLazadaAuthUrl=async function(){return mktCall('lazada.auth_url',{},'GET');};
  window.tskLazadaStatus=async function(){return mktCall('lazada.status',{},'GET');};
  window.tskLazadaProducts=async function(){return mktCall('lazada.products',{},'GET');};

  /* ---- สินค้า/สต็อกกลาง: จับคู่ Shopee+Lazada แล้วอัปเดตสต็อก/เปิดปิดขายทีเดียวทุกช่องทาง ---- */
  window.tskProductsList=async function(){return mktCall('products.list',{},'GET');};
  window.tskProductSave=async function(data){return mktCall('products.save',data,'POST');};
  window.tskProductSync=async function(id){return mktCall('products.sync',{id},'POST');};
  window.tskProductsSyncAll=async function(){return mktCall('products.sync_all',{},'POST');};

  /* ---- Public catalog (server-side source of truth — replaces localStorage products/categories/brands) ---- */
  const PUBLIC_CATALOG_CACHE='tsk_public_catalog_r76';
  function catalogCacheKey(params){return new URLSearchParams(Object.entries(params||{}).filter(([,value])=>value!==undefined&&value!==null&&value!=='').sort(([a],[b])=>a.localeCompare(b))).toString();}
  function readCatalogCache(params){try{const all=JSON.parse(localStorage.getItem(PUBLIC_CATALOG_CACHE)||'{}'),row=all[catalogCacheKey(params)];if(row&&Date.now()-Number(row.saved_at||0)<6*60*60*1000&&Array.isArray(row.data?.products))return {...row.data,stale:true};}catch{}return null;}
  function writeCatalogCache(params,data){if(!Array.isArray(data?.products))return;try{const all=JSON.parse(localStorage.getItem(PUBLIC_CATALOG_CACHE)||'{}'),key=catalogCacheKey(params);all[key]={saved_at:Date.now(),data};const rows=Object.entries(all).sort(([,a],[,b])=>Number(b.saved_at||0)-Number(a.saved_at||0)).slice(0,20);localStorage.setItem(PUBLIC_CATALOG_CACHE,JSON.stringify(Object.fromEntries(rows)));}catch{}}
  window.tskCatalogProductsList=async function(params={}){try{const result=await callQS('products.list',params);writeCatalogCache(params,result);return result;}catch(error){const cached=readCatalogCache(params);if(cached)return cached;throw error;}};
  window.tskCatalogProductGet=async function(idOrParams){const params=typeof idOrParams==='string'?{id:idOrParams}:(idOrParams||{});return callQS('products.get',params);};
  window.tskProductRecommendations=async function(id,limit=8){return callQS('products.recommend',{id,limit});};
  window.tskCategoriesList=async function(){return callQS('categories.list');};
  window.tskBrandsList=async function(){return callQS('brands.list');};

  /* ---- Admin: products (server-side CRUD, replaces tsk_admin_products_data in localStorage) ---- */
  window.tskAdminProductsList=async function(params={}){return callQS('admin.products.list',params);};
  window.tskAdminProductGet=async function(id){return callQS('admin.products.get',{id});};
  window.tskAdminProductCreate=async function(data){return call('admin.products.create',{...data,csrf:session.csrf});};
  window.tskAdminProductUpdate=async function(data){return call('admin.products.update',{...data,csrf:session.csrf});};
  window.tskAdminProductFeatured=async function(id,home_featured,home_featured_order){return call('admin.products.featured',{id,home_featured,home_featured_order,csrf:session.csrf});};
  window.tskAdminProductDelete=async function(id){return call('admin.products.delete',{id,csrf:session.csrf});};
  window.tskAdminProductsBulkUpdate=async function(ids,patch){return call('admin.products.bulk_update',{ids,patch,csrf:session.csrf});};
  window.tskAdminProductsBulkImport=async function(items,publish=false,checkpoint={}){return call('admin.products.bulk_import',{items,publish,...checkpoint,csrf:session.csrf});};
  window.tskAdminProductsBulkPatch=async function(items){return call('admin.products.bulk_patch',{items,csrf:session.csrf});};

  /* ---- Admin: categories ---- */
  window.tskAdminCategoriesList=async function(){return callQS('admin.categories.list');};
  window.tskAdminCategoryCreate=async function(data){return call('admin.categories.create',{...data,csrf:session.csrf});};
  window.tskAdminCategoryUpdate=async function(data){return call('admin.categories.update',{...data,csrf:session.csrf});};
  window.tskAdminCategoryDelete=async function(key){return call('admin.categories.delete',{key,csrf:session.csrf});};
  window.tskAdminCategoriesReorder=async function(order){return call('admin.categories.reorder',{order,csrf:session.csrf});};

  /* ---- Admin: brands ---- */
  window.tskAdminBrandsList=async function(){return callQS('admin.brands.list');};
  window.tskAdminBrandCreate=async function(data){return call('admin.brands.create',{...data,csrf:session.csrf});};
  window.tskAdminBrandUpdate=async function(data){return call('admin.brands.update',{...data,csrf:session.csrf});};
  window.tskAdminBrandDelete=async function(id){return call('admin.brands.delete',{id,csrf:session.csrf});};
  window.tskAdminBrandsReorder=async function(order){return call('admin.brands.reorder',{order,csrf:session.csrf});};
  window.tskAdminBrandsMigrateProducts=async function(){return call('admin.brands.migrate_products',{csrf:session.csrf});};
  window.tskMarketplaceImportPreview=async function(source,items){return call('admin.marketplace.import.preview',{source,items,csrf:session.csrf});};
  window.tskMarketplaceImportCommit=async function(source,items,publish=false){return call('admin.marketplace.import.commit',{source,items,publish,csrf:session.csrf});};

  /* ---- Admin: inventory / stock ---- */
  window.tskAdminStockAdjust=async function(id,deltaOrSet,reason){const payload=(deltaOrSet&&typeof deltaOrSet==='object')?deltaOrSet:{delta:deltaOrSet};return call('admin.stock.adjust',{id,...payload,reason,csrf:session.csrf});};
  window.tskAdminStockLogs=async function(productId){return callQS('admin.stock.logs',{product_id:productId});};
  window.tskAdminStockLow=async function(threshold){return callQS('admin.stock.low',{threshold});};
  window.tskAdminWarehousesList=async function(){return callQS('admin.warehouses.list');};
  window.tskAdminWarehouseSave=async function(data){return call('admin.warehouses.save',{...data,csrf:session.csrf});};
  window.tskAdminWarehouseDelete=async function(id){return call('admin.warehouses.delete',{id,csrf:session.csrf});};
  window.tskAdminInventoryOverview=async function(params={}){return callQS('admin.inventory.overview',params);};
  window.tskAdminInventoryMigrate=async function(){return call('admin.inventory.migrate',{csrf:session.csrf});};
  window.tskAdminVariantsSave=async function(product_id,variants){return call('admin.product.variants.save',{product_id,variants,csrf:session.csrf});};
  window.tskAdminInventoryAdjust=async function(data){return call('admin.inventory.adjust',{...data,csrf:session.csrf});};
  window.tskAdminInventoryTransfer=async function(data){return call('admin.inventory.transfer',{...data,csrf:session.csrf});};
  window.tskAdminInventoryLogs=async function(params={}){return callQS('admin.inventory.logs',params);};
  window.tskAdminSalesReport=async function(params={}){return callQS('admin.reports.sales',params);};
  window.tskProductQr=async function(id,variant_id=''){return callQS('products.qr',{id,variant_id});};

  /* =====================================================================
     PRODUCTION DATA BRIDGE
     - Public catalog: server data is the source of truth; local seed is only fallback.
     - Admin catalog: migrate legacy local data once, then all CRUD goes through API.
     ===================================================================== */
  let serverAdminProducts=[];
  let serverAdminCategories=[];
  let serverAdminBrands=[];
  let serverAdminBanners=[];
  let serverBridgeEnabled=false;
  let originalFns=null;

  function rememberOriginalFns(){
    if(originalFns) return;
    originalFns={
      getAdminProductList:window.getAdminProductList,
      getAdminProductById:window.getAdminProductById,
      upsertAdminProductItem:window.upsertAdminProductItem,
      deleteAdminProductItem:window.deleteAdminProductItem,
      getCategoryList:window.getCategoryList,
      getCategoryByKey:window.getCategoryByKey,
      upsertCategoryItem:window.upsertCategoryItem,
      deleteCategoryItem:window.deleteCategoryItem,
      moveCategoryItem:window.moveCategoryItem,
      getBrandList:window.getBrandList,
      getBrandItemById:window.getBrandItemById,
      upsertBrandItem:window.upsertBrandItem,
      deleteBrandItem:window.deleteBrandItem,
      moveBrandItem:window.moveBrandItem,
      getBannerList:window.getBannerList,
      getBannerById:window.getBannerById,
      upsertBannerItem:window.upsertBannerItem,
      deleteBannerItem:window.deleteBannerItem,
      moveBannerItem:window.moveBannerItem
    };
  }
  async function fetchInitialPublicProducts(){
    // The dedicated catalog page owns its paginated query and renders as soon
    // as that page arrives. Avoid a duplicate 24-item bootstrap request first.
    if(window.TSK_CATALOG_PAGE_OWNS_QUERY)return {ok:true,products:[],total:0,skipped:true};
    const page=document.body?.dataset?.page||'',params=new URLSearchParams(location.search);
    if(page==='product'&&params.get('id')){const result=await window.tskCatalogProductGet(params.get('id'));return {ok:true,products:result?.product?[result.product]:[],total:result?.product?1:0};}
    let ids=[];
    if(['cart','checkout'].includes(page)){try{ids=(JSON.parse(localStorage.getItem('tsk_cart')||'[]')||[]).map(item=>item.id)}catch{}}
    else if(page==='compare'){try{ids=JSON.parse(localStorage.getItem('tsk_compare')||'[]')||[]}catch{}}
    else if(page==='wishlist'){try{ids=JSON.parse(localStorage.getItem('tsk_wishlist_local')||'[]')||[]}catch{}}
    ids=[...new Set(ids.filter(Boolean))].slice(0,40);
    if(ids.length){const rows=await Promise.all(ids.map(id=>window.tskCatalogProductGet(id).catch(()=>null)));const products=rows.map(row=>row?.product).filter(Boolean);return {ok:true,products,total:products.length};}
    const perPage=page==='home'?24:(page==='products'?24:60);
    return window.tskCatalogProductsList({per_page:perPage,page:1,facets:page==='products'?1:undefined});
  }
  async function fetchAllAdminProducts(){
    let lastError;
    for(let loadAttempt=1;loadAttempt<=2;loadAttempt++){
      try{
        const first=await window.tskAdminProductsList({per_page:200,page:1});
        let items=Array.isArray(first?.products)?first.products:[];
        const total=Number(first?.total||items.length),source=String(first?.source||''),pages=Math.min(100,Math.ceil(total/200));
        // Fetch a few pages concurrently. The server still enforces the
        // 200-row page size, but the admin no longer waits on every page in
        // series (which was especially painful for 1,000+ products).
        const pageNumbers=Array.from({length:Math.max(0,pages-1)},(_,i)=>i+2);
        for(let i=0;i<pageNumbers.length;i+=4){
          const batch=pageNumbers.slice(i,i+4);
          const rows=await Promise.all(batch.map(page=>window.tskAdminProductsList({per_page:200,page})));
          for(const r of rows){
            if(Number(r?.total)!==total||String(r?.source||'')!==source)throw new Error('catalog_changed_during_load');
            items.push(...(r?.products||[]));
          }
        }
        const unique=new Map(items.filter(product=>product?.id).map(product=>[String(product.id),product]));
        if(unique.size!==total)throw new Error('catalog_incomplete');
        return {...first,products:[...unique.values()],total,complete:true};
      }catch(error){lastError=error;if(loadAttempt<2)await wait(700);}
    }
    throw lastError||new Error('catalog_incomplete');
  }
  window.tskReloadAdminProductCache=async function(){
    const fresh=await fetchAllAdminProducts();serverAdminProducts=fresh?.products||[];
    window.TSK_SERVER_CATALOG_PRODUCTS=serverAdminProducts.slice();window.TSK_SERVER_CATALOG_PRODUCTS_READY=true;
    return {products:serverAdminProducts.slice(),total:Number(fresh?.total||serverAdminProducts.length)};
  };
  async function fetchPublicCatalog(){
    try{
      // Keep site settings independent from the catalog calls. A slow or
      // temporarily failing product/category request must not discard the
      // banners that the admin already uploaded and saved.
      const siteSettingsPromise=call('site.settings',{},'GET').then(settings=>{
        const serverBanners=Array.isArray(settings?.settings?.banners)?settings.settings.banners.filter(x=>x&&x.img):[];
        // Publish banners as soon as their own request completes. The full
        // catalog can be slow on a cold edge, but media should still render.
        window.TSK_SERVER_BANNERS=serverBanners;
        window.dispatchEvent(new CustomEvent('tsk:server-banners-ready',{detail:{count:serverBanners.length}}));
        return settings;
      }).catch(()=>null);
      const [p,c,b]=await Promise.all([
        fetchInitialPublicProducts().catch(()=>null),
        window.tskCategoriesList().catch(()=>null),
        window.tskBrandsList().catch(()=>null),
      ]);
      const siteSettings=await siteSettingsPromise;
      // RELEASE 40: one catalog, one stock source of truth.
      // Never merge bundled/demo products into a live server catalog. That old merge made
      // a demo product visible in the cart even though checkout correctly rejected it.
      const serverProducts=Array.isArray(p?.products)?p.products:[];
      const bundledProducts=(typeof PRODUCTS!=='undefined'&&Array.isArray(PRODUCTS))?PRODUCTS:[];
      const liveServerAvailable=!!p && Array.isArray(p.products);
      const publicProducts=liveServerAvailable ? serverProducts : bundledProducts;
      const serverCategories=Array.isArray(c?.categories)?c.categories:[];
      const bundledCategories=(typeof DEFAULT_CATEGORIES!=='undefined'&&Array.isArray(DEFAULT_CATEGORIES))?DEFAULT_CATEGORIES:[];
      const categoryKeys=new Set(serverCategories.map(x=>x.key));
      const publicCategories=[...serverCategories,...bundledCategories.filter(x=>!categoryKeys.has(x.key))];
      const serverBrands=Array.isArray(b?.brands)?b.brands:[];
      const brandNames=new Set(serverBrands.map(x=>String(x.name||'').toLowerCase()));
      const bundledBrands=(typeof window!=='undefined'&&Array.isArray(window.TSK_BRAND_LIBRARY)?window.TSK_BRAND_LIBRARY:[]).map(x=>({...x}));
      const publicBrands=[...serverBrands,...bundledBrands.filter(x=>!brandNames.has(String(x.name||'').toLowerCase()))];
      const serverBanners=Array.isArray(siteSettings?.settings?.banners)?siteSettings.settings.banners.filter(x=>x&&x.img):[];
      if(publicProducts.length){ window.TSK_SERVER_CATALOG_PRODUCTS=publicProducts; window.TSK_SERVER_CATALOG_PRODUCTS_READY=true; }
      if(publicCategories.length){ window.TSK_SERVER_CATEGORIES=publicCategories; window.TSK_SERVER_CATEGORIES_READY=true; }
      if(publicBrands.length){ window.TSK_SERVER_BRANDS=publicBrands; window.TSK_SERVER_BRANDS_READY=true; }
      window.TSK_SERVER_BANNERS=serverBanners;
      return {products:publicProducts,categories:publicCategories,brands:publicBrands,banners:serverBanners};
    }catch(e){ window.TSK_SERVER_CATALOG_PRODUCTS_READY=false; console.warn('[TSK] server catalog unavailable; using bundled offline fallback',e); return null; }
  }
  async function migrateLegacyCatalog(){
    rememberOriginalFns();
    const legacyCategories=typeof originalFns.getCategoryList==='function'?originalFns.getCategoryList():[];
    const legacyBrands=typeof originalFns.getBrandList==='function'?originalFns.getBrandList():[];
    const legacyBanners=typeof originalFns.getBannerList==='function'?originalFns.getBannerList():[];
    const current=await fetchAllAdminProducts();
    const cc=await window.tskAdminCategoriesList();
    const cb=await window.tskAdminBrandsList();
    let products=current?.products||[], categories=cc?.categories||[], brands=cb?.brands||[];
    if(!categories.length && legacyCategories.length){
      for(const x of legacyCategories){ try{ const r=await window.tskAdminCategoryCreate(x); if(r?.category) categories.push(r.category); }catch(e){ console.warn('category migration failed',x?.key,e); } }
    }
    if(!brands.length && legacyBrands.length){
      for(const x of legacyBrands){ try{ const r=await window.tskAdminBrandCreate({name:x.name||'Brand',logo_data_url:x.logo_data_url||x.img||''}); if(r?.brand) brands.push(r.brand); }catch(e){ console.warn('brand migration failed',x?.name,e); } }
    }
    const brandLibraryFlag='tsk_brand_library_migrated_v1';
    const libraryBrands=legacyBrands.filter(x=>x&&x.source==='bundled-brand-library');
    if(libraryBrands.length && localStorage.getItem(brandLibraryFlag)!=='1'){
      const existingNames=new Set(brands.map(x=>String(x.name||'').trim().toLowerCase()).filter(Boolean));
      for(const x of libraryBrands){
        const name=String(x.name||'').trim(), key=name.toLowerCase();
        if(!name||existingNames.has(key))continue;
        try{ const r=await window.tskAdminBrandCreate({name,logo_data_url:x.logo_data_url||x.img||''}); if(r?.brand){brands.push(r.brand);existingNames.add(key);} }catch(e){ console.warn('bundled brand migration failed',name,e); }
      }
      try{localStorage.setItem(brandLibraryFlag,'1');}catch(_){ }
    }
    let banners=(await window.tskAdminBannersList()).banners||[];
    const bannerMigrationFlag='tsk_banners_server_migrated_v1';
    if(!banners.length && legacyBanners.length && localStorage.getItem(bannerMigrationFlag)!=='1'){
      try{ const saved=await window.tskAdminBannersSave(legacyBanners); banners=saved.settings?.banners||legacyBanners; localStorage.setItem(bannerMigrationFlag,'1'); }catch(e){ console.warn('banner migration failed',e); }
    }
    const fresh=await Promise.all([fetchAllAdminProducts(),window.tskAdminCategoriesList(),window.tskAdminBrandsList()]);
    serverAdminProducts=fresh[0]?.products||products; serverAdminCategories=fresh[1]?.categories||categories; serverAdminBrands=(fresh[2]?.brands||brands).map(b=>({...b,img:b.img||b.logo_data_url||''}));
    serverAdminBanners=Array.isArray(banners)?banners.filter(b=>b&&b.img):[];
    window.TSK_SERVER_CATALOG_PRODUCTS=serverAdminProducts.slice(); window.TSK_SERVER_CATALOG_PRODUCTS_READY=serverAdminProducts.length>0;
    window.TSK_SERVER_CATEGORIES=serverAdminCategories.slice(); window.TSK_SERVER_CATEGORIES_READY=serverAdminCategories.length>0;
    window.TSK_SERVER_BRANDS=serverAdminBrands.slice(); window.TSK_SERVER_BRANDS_READY=serverAdminBrands.length>0;
  }
  function installAdminBridge(){
    rememberOriginalFns(); serverBridgeEnabled=true;
    window.getAdminProductList=()=>serverAdminProducts.slice();
    window.getAdminProductById=id=>serverAdminProducts.find(x=>String(x.id)===String(id))||null;
    window.upsertAdminProductItem=async item=>{
      const r=item?.id ? await window.tskAdminProductUpdate(item) : await window.tskAdminProductCreate(item);
      if(r?.product){ const i=serverAdminProducts.findIndex(x=>x.id===r.product.id); if(i>=0) serverAdminProducts[i]=r.product; else serverAdminProducts.unshift(r.product); window.TSK_SERVER_CATALOG_PRODUCTS=serverAdminProducts.slice(); return r.product; }
      throw new Error('product_save_failed');
    };
    window.deleteAdminProductItem=id=>{ serverAdminProducts=serverAdminProducts.filter(x=>x.id!==id); window.TSK_SERVER_CATALOG_PRODUCTS=serverAdminProducts.slice(); return window.tskAdminProductDelete(id).catch(e=>{console.error(e); alert('ลบสินค้าไม่สำเร็จ: '+(e.message||'ไม่ทราบสาเหตุ'));}); };
    window.getCategoryList=()=>serverAdminCategories.slice();
    window.getCategoryByKey=key=>serverAdminCategories.find(x=>x.key===key)||null;
    window.upsertCategoryItem=async item=>{ const r=item?.key?await window.tskAdminCategoryUpdate(item):await window.tskAdminCategoryCreate(item); if(r?.category){const i=serverAdminCategories.findIndex(x=>x.key===r.category.key);if(i>=0)serverAdminCategories[i]=r.category;else serverAdminCategories.push(r.category);window.TSK_SERVER_CATEGORIES=serverAdminCategories.slice();return r.category;} throw new Error('category_save_failed'); };
    window.deleteCategoryItem=key=>{serverAdminCategories=serverAdminCategories.filter(x=>x.key!==key);window.TSK_SERVER_CATEGORIES=serverAdminCategories.slice();return window.tskAdminCategoryDelete(key).catch(e=>{console.error(e);alert('ลบหมวดหมู่ไม่สำเร็จ: '+(e.message||'ไม่ทราบสาเหตุ'));});};
    window.moveCategoryItem=(key,dir)=>{const i=serverAdminCategories.findIndex(x=>x.key===key),j=i+dir;if(i<0||j<0||j>=serverAdminCategories.length)return;[serverAdminCategories[i],serverAdminCategories[j]]=[serverAdminCategories[j],serverAdminCategories[i]];window.TSK_SERVER_CATEGORIES=serverAdminCategories.slice();return window.tskAdminCategoriesReorder(serverAdminCategories.map(x=>x.key));};
    window.getBrandList=()=>serverAdminBrands.slice();
    window.getBrandItemById=id=>serverAdminBrands.find(x=>x.id===id)||null;
    window.upsertBrandItem=async item=>{ const data={...item,logo_data_url:item.logo_data_url||item.img||''}; const r=data.id?await window.tskAdminBrandUpdate(data):await window.tskAdminBrandCreate(data); if(r?.brand){const bd={...r.brand,img:r.brand.img||r.brand.logo_data_url||''}; const i=serverAdminBrands.findIndex(x=>x.id===bd.id);if(i>=0)serverAdminBrands[i]=bd;else serverAdminBrands.push(bd);window.TSK_SERVER_BRANDS=serverAdminBrands.slice();return bd;} throw new Error('brand_save_failed'); };
    window.deleteBrandItem=id=>{serverAdminBrands=serverAdminBrands.filter(x=>x.id!==id);window.TSK_SERVER_BRANDS=serverAdminBrands.slice();return window.tskAdminBrandDelete(id).catch(e=>{console.error(e);alert('ลบแบรนด์ไม่สำเร็จ: '+(e.message||'ไม่ทราบสาเหตุ'));});};
    window.moveBrandItem=(id,dir)=>{const i=serverAdminBrands.findIndex(x=>x.id===id),j=i+dir;if(i<0||j<0||j>=serverAdminBrands.length)return;[serverAdminBrands[i],serverAdminBrands[j]]=[serverAdminBrands[j],serverAdminBrands[i]];window.TSK_SERVER_BRANDS=serverAdminBrands.slice();return window.tskAdminBrandsReorder(serverAdminBrands.map(x=>x.id));};
    window.getBannerList=()=>serverAdminBanners.slice();
    window.getBannerById=id=>serverAdminBanners.find(x=>String(x.id)===String(id))||null;
    window.upsertBannerItem=async item=>{const next={...item,id:item?.id||('bn-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)),updated_at:new Date().toISOString()};const i=serverAdminBanners.findIndex(x=>String(x.id)===String(next.id));const list=serverAdminBanners.slice();if(i>=0)list[i]={...list[i],...next};else list.push(next);const r=await window.tskAdminBannersSave(list);serverAdminBanners=Array.isArray(r.settings?.banners)?r.settings.banners:list;return serverAdminBanners.find(x=>String(x.id)===String(next.id))||next;};
    window.deleteBannerItem=async id=>{const list=serverAdminBanners.filter(x=>String(x.id)!==String(id));const r=await window.tskAdminBannersSave(list);serverAdminBanners=Array.isArray(r.settings?.banners)?r.settings.banners:list;return {ok:true};};
    window.moveBannerItem=async(id,dir)=>{const i=serverAdminBanners.findIndex(x=>String(x.id)===String(id)),j=i+dir;if(i<0||j<0||j>=serverAdminBanners.length)return;const list=serverAdminBanners.slice();[list[i],list[j]]=[list[j],list[i]];const r=await window.tskAdminBannersSave(list);serverAdminBanners=Array.isArray(r.settings?.banners)?r.settings.banners:list;return serverAdminBanners;};
  }
  window.tskEnableServerAdminData=async function(){
    if(serverBridgeEnabled) return {products:serverAdminProducts,categories:serverAdminCategories,brands:serverAdminBrands,banners:serverAdminBanners};
    await refresh();
    if(!session.admin) throw new Error('admin_session_required');
    await migrateLegacyCatalog();
    installAdminBridge();
    try{ localStorage.removeItem('tsk_admin_products_data'); localStorage.removeItem('tsk_categories_data'); localStorage.removeItem('tsk_brands_data'); }catch(_){ }
    return {products:serverAdminProducts,categories:serverAdminCategories,brands:serverAdminBrands,banners:serverAdminBanners};
  };
  window.tskEnableServerCatalog=fetchPublicCatalog;


  /* ---- Admin: customers ---- */
  window.tskAdminCustomersList=async function(q){return callQS('admin.customers.list',{q});};
  window.tskAdminCustomerOrders=async function(id){return callQS('admin.customer.orders',{id});};
  window.tskAdminCustomerNote=async function(id,note){return call('admin.customer.note',{id,note,csrf:session.csrf});};

  /* ---- Admin: shipping + audit log ---- */
  window.tskAdminOrderShipping=async function(id,carrier,tracking_number){return call('admin.order.shipping',{id,carrier,tracking_number,csrf:session.csrf});};
  window.tskAdminAuditList=async function(){return callQS('admin.audit.list');};


  /* ---- Release 12 commerce suite ---- */
  window.tskValidateCoupon=async function(code,subtotal,shipping){return callQS('coupon.validate',{code,subtotal,shipping});};
  window.tskWishlistList=async function(){return call('customer.wishlist.list',{},'GET');};
  window.tskWishlistToggle=async function(product_id){return call('customer.wishlist.toggle',{product_id,csrf:session.csrf});};
  window.tskAddressesList=async function(){return call('customer.addresses.list',{},'GET');};
  window.tskAddressSave=async function(data){return call('customer.addresses.save',{...data,csrf:session.csrf});};
  window.tskAddressDelete=async function(id){return call('customer.addresses.delete',{id,csrf:session.csrf});};
  window.tskReviewsList=async function(product_id){return callQS('reviews.list',{product_id});};
  window.tskReviewCreate=async function(data){return call('reviews.create',{...data,csrf:session.csrf});};
  window.tskOrderTrack=async function(order_no,token){return callQS('order.track',{order_no,token});};
  window.tskPartnerApply=async function(data){return call('partner.apply',data);};
  window.tskAgentLogin=async function(email,password){const r=await call('agent.login',{email,password});session.csrf=r.csrf||'';sessionStorage.setItem('tsk_server_agent','1');return r;};
  window.tskAgentLogout=async function(){const r=await call('agent.logout',{});sessionStorage.removeItem('tsk_server_agent');session.csrf='';return r;};
  window.tskAgentDashboard=async function(){return call('agent.dashboard',{},'GET');};
  window.tskAgentPassword=async function(old_password,new_password){return call('agent.password',{old_password,new_password,csrf:session.csrf});};
  window.tskAgentProfileUpdate=async function(data){return call('agent.profile.update',{...data,csrf:session.csrf});};
  window.tskAgentPayoutRequest=async function(amount){return call('agent.payout.request',{amount,csrf:session.csrf});};
  window.tskAdminPayoutsList=async function(){return call('admin.payouts.list',{},'GET');};
  window.tskAdminPayoutGet=async function(id){return callQS('admin.payout.get',{id});};
  window.tskAdminPayoutAction=async function(id,operation,extra={}){return call('admin.payout.action',{id,operation,...extra,csrf:session.csrf});};

  window.tskPartnerResolve=async function(code){return callQS('partner.resolve',{code});};
  window.tskPartnerStore=async function(code){return callQS('partner.store',{code});};
  window.tskAdminCommissionsList=async function(){return call('admin.commissions.list',{},'GET');};
  window.tskAdminAgentsList=async function(){return call('admin.agents.list',{},'GET');};
  window.tskAdminAgentAction=async function(id,operation,extra={}){return call('admin.agents.action',{id,operation,...extra,csrf:session.csrf});};
  window.tskAdminAgentSetUpline=async function(id,upline_agent_id,upline_commission_rate=1){return call('admin.agents.action',{id,operation:'set_upline',upline_agent_id,upline_commission_rate,csrf:session.csrf});};

  window.tskAdminCouponsList=async function(){return call('admin.coupons.list',{},'GET');};
  window.tskAdminCouponSave=async function(data){return call('admin.coupons.save',{...data,csrf:session.csrf});};
  window.tskAdminCouponDelete=async function(code){return call('admin.coupons.delete',{code,csrf:session.csrf});};
  window.tskAdminReviewsList=async function(){return call('admin.reviews.list',{},'GET');};
  window.tskAdminReviewModerate=async function(id,status){return call('admin.reviews.moderate',{id,status,csrf:session.csrf});};
  window.tskAdminDashboardMetrics=async function(){return call('admin.dashboard.metrics',{},'GET');};
  window.tskAdminCatalogIntegrity=async function(){return call('admin.catalog.integrity',{},'GET');};
  window.tskReturnRequest=async function(data){return call('customer.return.request',{...data,csrf:session.csrf});};
  window.tskAdminReturnsList=async function(){return call('admin.returns.list',{},'GET');};
  window.tskAdminReturnStatus=async function(id,status,admin_note=''){return call('admin.returns.status',{id,status,admin_note,csrf:session.csrf});};
  window.tskAdminNewsletterSend=async function(subject,message){return call('admin.newsletter.send',{subject,message,csrf:session.csrf});};
  window.addEventListener('DOMContentLoaded',()=>{ensureCanonical();refresh().catch(error=>console.warn('Production API unavailable',error));loadBranding();});
})();
 

