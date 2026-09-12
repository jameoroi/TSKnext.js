/* =========================================================================
   THAISERKIT SUPPLY — Release 22 — bug fixes + modern interaction pass
   Loads last, after commerce-plus.js. Safe to no-op if a helper it expects
   (tskToggleWishlist, getProducts, ...) isn't present on a given page.
   ========================================================================= */
(function(){

  /* ---------------------------------------------------------------------
     A) ONE Facebook chat bubble, not two.
     partials.js mounts `.fb-chat-bubble` on every page load (from the
     static assets/config.js page name, if any). production-client.js later
     learns the *real* page name from the server-side admin settings and
     used to build a second, separately-styled floating button on top of it.
     This function is the single place that updates the bubble once we know
     the real page — creating it if partials.js hasn't run yet, otherwise
     just re-pointing the existing one.
     --------------------------------------------------------------------- */
  window.tskSyncMessengerBubble = function(page){
    if(!page) return;
    const href = 'https://m.me/' + encodeURIComponent(page);
    let btn = document.querySelector('.fb-chat-bubble');
    if(btn){
      btn.href = href;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.onclick = null;
      btn.classList.add('has-page');
      return;
    }
    // partials.js hasn't mounted the bubble yet (unlikely given script order,
    // but fall back to the same markup/class so it gets the same styling).
    if(typeof initFbChatBubble === 'function'){
      if(typeof API_CONFIG !== 'undefined') API_CONFIG.facebook = Object.assign({}, API_CONFIG.facebook, {pageUsernameOrId: page});
      initFbChatBubble();
    }
  };

  /* ---------------------------------------------------------------------
     B) Wishlist heart state stays in sync across the whole site, and
     un-favoriting a card on the wishlist page removes it immediately
     instead of leaving a "favorited" item sitting in your favorites list
     until the next reload.
     --------------------------------------------------------------------- */
  function currentWishlistIds(){
    try{
      if(window.TSK_API && window.TSK_API.session && window.TSK_API.session.customer && window.__tskWishlistServerIds){
        return window.__tskWishlistServerIds;
      }
      return JSON.parse(localStorage.getItem('tsk_wishlist_local') || '[]');
    }catch(_){ return []; }
  }

  function syncWishlistHearts(scope){
    const ids = currentWishlistIds();
    if(!ids || !ids.length) return;
    const root = scope || document;
    root.querySelectorAll('.tsk-round-action[title="รายการโปรด"]').forEach(btn=>{
      const link = btn.closest('.prod-card')?.querySelector('a[href*="product.html?id="]');
      if(!link) return;
      const m = link.getAttribute('href').match(/id=([^&]+)/);
      const id = m ? decodeURIComponent(m[1]) : null;
      if(id && ids.includes(id)) btn.classList.add('active');
    });
  }

  // keep the local cache of server wishlist ids fresh for syncWishlistHearts()
  if(typeof window.tskWishlistList === 'function'){
    const originalList = window.tskWishlistList;
    window.tskWishlistList = async function(){
      const r = await originalList();
      window.__tskWishlistServerIds = r && r.ids ? r.ids : [];
      return r;
    };
  }

  // give every heart click a little pop, and on the wishlist page specifically,
  // drop the card straight out of the grid the moment it's un-favorited.
  if(typeof window.tskToggleWishlist === 'function'){
    const originalToggle = window.tskToggleWishlist;
    window.tskToggleWishlist = async function(id, btn){
      const result = await originalToggle(id, btn);
      if(btn){
        btn.classList.remove('pop');
        void btn.offsetWidth; // restart animation
        btn.classList.add('pop');
      }
      // Every product shown on the wishlist page is, by definition, currently
      // favorited — so any heart click there is always a removal.
      if(document.body.dataset.page === 'wishlist' && btn){
        const card = btn.closest('.prod-card');
        if(card){
          card.style.transition = 'opacity .25s ease, transform .25s ease';
          card.style.opacity = '0';
          card.style.transform = 'scale(.92)';
          setTimeout(()=>{
            card.remove();
            const grid = document.getElementById('wishGrid');
            const empty = document.getElementById('wishEmpty');
            if(grid && empty && !grid.children.length) empty.style.display = 'block';
          }, 240);
        }
      }
      return result;
    };
  }

  // Re-check hearts whenever a product grid gets (re)populated anywhere on
  // the site, so a product already in your favorites shows a filled heart
  // right away instead of only after you've clicked it once this session.
  const gridIds = ['featuredGrid','wishGrid','listingGrid','compareGrid'];
  const observer = new MutationObserver(muts=>{
    for(const m of muts){
      if(m.addedNodes && m.addedNodes.length){ syncWishlistHearts(m.target); break; }
    }
  });
  document.addEventListener('DOMContentLoaded', ()=>{
    gridIds.forEach(id=>{
      const el = document.getElementById(id);
      if(el) observer.observe(el, {childList:true});
    });
    document.querySelectorAll('.prod-grid,.listing-grid').forEach(el=>observer.observe(el,{childList:true}));
    setTimeout(()=>syncWishlistHearts(), 400);
  });

  /* ---------------------------------------------------------------------
     C) Hero banner — swipe support on touch devices, and pause the
     autoplay while a finger is on the slide.
     --------------------------------------------------------------------- */
  function initHeroSwipe(){
    const slide = document.querySelector('.hero-slide');
    if(!slide || typeof window.changeSlide !== 'function') return;
    let startX = 0, startY = 0, tracking = false;
    slide.addEventListener('touchstart', e=>{
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY; tracking = true;
    }, {passive:true});
    slide.addEventListener('touchend', e=>{
      if(!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX, dy = t.clientY - startY;
      if(Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5){
        window.changeSlide(dx < 0 ? 1 : -1);
      }
    }, {passive:true});
  }
  document.addEventListener('DOMContentLoaded', ()=>setTimeout(initHeroSwipe, 300));

})();
