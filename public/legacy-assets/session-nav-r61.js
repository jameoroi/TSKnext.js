/* One header state for customer, Agent and every company role. */
(function(){
  const esc=v=>String(v||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  function state(){if(sessionStorage.getItem('tsk_server_agent')==='1')return {kind:'agent',href:'agent-center.html',label:'Agent Center',utility:'หน้าร้านตัวแทน'};return null;}
  function apply(){const s=state();if(!s)return;document.querySelectorAll('.market-account').forEach(el=>{if(el.dataset.r61)return;el.dataset.r61='1';const phone=el.querySelector('.market-phone');el.innerHTML=(phone?phone.outerHTML:'')+`<a href="${s.href}" class="r61-session-link">${esc(s.utility)}</a><span class="market-sep">|</span><a href="${s.href}" class="r61-session-link">${esc(s.label)}</a>`;});document.querySelectorAll('.top-actions').forEach(el=>{if(el.dataset.r61)return;el.dataset.r61='1';const keep=[...el.querySelectorAll('a[href="wishlist.html"],a[href="cart.html"]')].map(a=>a.outerHTML).join('');el.innerHTML=`<a class="action r61-session-link" href="${s.href}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg><span>${esc(s.label)}</span></a>${keep}`;});}
  apply(); new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
})();
 
