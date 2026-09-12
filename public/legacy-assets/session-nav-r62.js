(function(){
  const clean=v=>String(v||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  function state(){if(sessionStorage.getItem('tsk_server_agent')==='1')return {key:'agent',href:'agent-center.html',label:'Agent Center',utility:'หน้าร้านตัวแทน'};return null;}
  function render(){const s=state();if(!s)return;document.querySelectorAll('.market-account').forEach(el=>{if(el.dataset.r62===s.key)return;el.dataset.r62=s.key;const phone=el.querySelector('.market-phone')?.outerHTML||'';el.innerHTML=`${phone}<a class="r62-session-link" href="${s.href}">${clean(s.utility)}</a><span class="market-sep">|</span><a class="r62-session-link" href="${s.href}">${clean(s.label)}</a>`;});document.querySelectorAll('.top-actions').forEach(el=>{if(el.dataset.r62===s.key)return;el.dataset.r62=s.key;const keep=[...el.querySelectorAll('a[href="wishlist.html"],a[href="cart.html"]')].map(a=>a.outerHTML).join('');el.innerHTML=`<a class="action r62-session-link" href="${s.href}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg><span>${clean(s.label)}</span></a>${keep}`;});}
  render();new MutationObserver(render).observe(document.documentElement,{childList:true,subtree:true});
})();
 
