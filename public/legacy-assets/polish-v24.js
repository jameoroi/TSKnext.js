/* =========================================================================
   THAISERKIT SUPPLY — Release 24 — Punch-list polish (JS)
   Loads after motion-polish-v23.js. Purely additive.
   ========================================================================= */
(function(){
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia && window.matchMedia('(hover:none) and (pointer:coarse)').matches;

  function onReady(fn){
    if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', fn); }
    else { fn(); }
  }

  /* ---------------------------------------------------------------------
     E5 — Dark mode: apply saved theme immediately (avoid flash), wire the
     toggle button once the header partial has been mounted.
  --------------------------------------------------------------------- */
  var THEME_KEY = 'tsk_theme';
  function updateThemeToggle(t){
    var btn = document.querySelector('.theme-toggle-btn');
    if(!btn) return;
    var dark = t === 'dark';
    btn.setAttribute('aria-pressed', String(dark));
    var label = btn.querySelector('.tt-label');
    if(label) label.textContent = dark ? 'โหมดสว่าง' : 'โหมดมืด';
  }
  function applyTheme(t){
    document.documentElement.setAttribute('data-theme', t);
    try{ localStorage.setItem(THEME_KEY, t); }catch(e){}
    updateThemeToggle(t);
  }
  (function initThemeEarly(){
    var saved = null;
    try{ saved = localStorage.getItem(THEME_KEY); }catch(e){}
    if(saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  })();

  function mountThemeToggle(){
    var actions = document.querySelector('.top-actions');
    if(!actions || document.querySelector('.theme-toggle-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle-btn';
    btn.setAttribute('aria-label', 'สลับโหมดมืด/สว่าง');
    btn.innerHTML =
      '<svg class="tt-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke-linecap="round"/></svg>' +
      '<svg class="tt-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke-linejoin="round"/></svg>' +
      '<span class="tt-label">โหมดมืด</span>';
    btn.addEventListener('click', function(){
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      applyTheme(isDark ? 'light' : 'dark');
    });
    actions.insertBefore(btn, actions.firstChild);
    updateThemeToggle(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  }

  /* ---------------------------------------------------------------------
     B1 — Sidebar category glow (desktop hover)
  --------------------------------------------------------------------- */
  function initSidebarGlow(){
    var sidebar = document.getElementById('homeCatList') || document.querySelector('.home-cat-sidebar');
    if(!sidebar || reduceMotion) return;
    sidebar.addEventListener('mousemove', function(e){
      var link = e.target.closest ? e.target.closest('.home-cat-link') : null;
      if(!link) return;
      var r = link.getBoundingClientRect();
      link.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      link.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
    }, { passive:true });
  }

  /* ---------------------------------------------------------------------
     B2 — Mobile fallbacks for hover-only effects
  --------------------------------------------------------------------- */
  function initTouchFallbacks(){
    if(!isTouch) return;
    // brief glow pulse on tap for cards/sidebar links, then clear
    document.body.addEventListener('touchstart', function(e){
      var el = e.target.closest ? e.target.closest('.cat-card,.home-cat-link') : null;
      if(!el) return;
      document.querySelectorAll('.mv-touch-glow').forEach(function(x){ if(x!==el) x.classList.remove('mv-touch-glow'); });
      el.classList.add('mv-touch-glow');
      setTimeout(function(){ el.classList.remove('mv-touch-glow'); }, 900);
    }, { passive:true });

    // header gets a shrink/shadow state driven by scroll position, since
    // touch devices have no hover to trigger it
    var ticking = false;
    function onScroll(){
      if(ticking) return;
      ticking = true;
      requestAnimationFrame(function(){
        document.body.classList.toggle('mv-scrolled', window.scrollY > 24);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive:true });
    onScroll();
  }

  /* ---------------------------------------------------------------------
     C1 — Quick view: adds a third round-action button to every product
     card, opens a modal built from getProductById() without navigating.
  --------------------------------------------------------------------- */
  function ensureQvModal(){
    if(document.getElementById('qvBackdrop')) return document.getElementById('qvBackdrop');
    var backdrop = document.createElement('div');
    backdrop.className = 'qv-backdrop';
    backdrop.id = 'qvBackdrop';
    backdrop.innerHTML = '<div class="qv-modal" role="dialog" aria-modal="true"><button class="qv-close" type="button" aria-label="ปิด">✕</button><div class="qv-img"><img alt="" id="qvImg"></div><div class="qv-body" id="qvBody"></div></div>';
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', function(e){ if(e.target === backdrop) closeQv(); });
    backdrop.querySelector('.qv-close').addEventListener('click', closeQv);
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeQv(); });
    return backdrop;
  }
  function closeQv(){
    var b = document.getElementById('qvBackdrop');
    if(b) b.classList.remove('show');
  }
  window.tskQuickView = function(pid){
    if(typeof getProductById !== 'function') return;
    var p = getProductById(decodeURIComponent(pid));
    if(!p) return;
    var backdrop = ensureQvModal();
    var outOfStock = (p.stock !== undefined && p.stock !== null && p.stock <= 0);
    document.getElementById('qvImg').src = (typeof safeAssetUrl === 'function') ? safeAssetUrl(p.img) : p.img;
    document.getElementById('qvImg').alt = p.name || '';
    document.getElementById('qvBody').innerHTML =
      '<div class="qv-brand">' + (p.brand||'') + '</div>' +
      '<div class="qv-name">' + (p.name||'') + '</div>' +
      '<div class="qv-price-wrap">' + (p.oldPrice ? '<span class="qv-price-old">'+formatPrice(p.oldPrice)+'</span>' : '') + '<span class="qv-price">'+formatPrice(p.price)+'</span></div>' +
      '<div class="qv-actions">' +
        '<button class="btn-solid" type="button" ' + (outOfStock?'disabled':'') + ' onclick="addToCart(\'' + String(p.id).replace(/'/g,"\\'") + '\',1);closeQvFromWindow();">' + (outOfStock?'สินค้าหมด':'เพิ่มลงตะกร้า') + '</button>' +
        '<button class="btn-line" type="button" onclick="tskToggleWishlist(\'' + String(p.id).replace(/'/g,"\\'") + '\',this)">♡ ถูกใจ</button>' +
      '</div>' +
      '<div class="qv-link"><a href="product.html?id=' + encodeURIComponent(p.id) + '">ดูรายละเอียดสินค้าแบบเต็ม →</a></div>';
    backdrop.classList.add('show');
  };
  window.closeQvFromWindow = closeQv;

  function injectQuickViewButtons(root){
    (root || document).querySelectorAll('.prod-card .tsk-card-actions').forEach(function(actions){
      // R72 renders one escaped, keyboard-safe Quick View trigger in productCardHtml.
      // Keep this legacy injector only as a fallback for older cards.
      if(actions.querySelector('.qv-trigger,.tsk-quick-button')) return;
      var link = actions.parentElement.querySelector('a[href^="product.html?id="]');
      if(!link) return;
      var pid = (link.getAttribute('href').split('id=')[1] || '').split('&')[0];
      var btn = document.createElement('button');
      btn.className = 'tsk-round-action qv-trigger';
      btn.type = 'button';
      btn.title = 'ดูตัวอย่างด่วน';
      btn.setAttribute('aria-label', 'ดูตัวอย่างด่วน');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
      btn.addEventListener('click', function(e){ e.preventDefault(); window.tskQuickView(pid); });
      actions.appendChild(btn);
    });
  }
  function watchProductGrids(){
    var root = document.body;
    if(!('MutationObserver' in window)) return;
    var mo = new MutationObserver(function(){ injectQuickViewButtons(document); });
    mo.observe(root, { childList:true, subtree:true });
    setTimeout(function(){ mo.disconnect(); }, 9000);
  }

  /* ---------------------------------------------------------------------
     C2 — Checkout stepper + trust badges
  --------------------------------------------------------------------- */
  function enhanceCheckout(){
    if(document.body.getAttribute('data-page') !== 'checkout') return;
    var wrap = document.getElementById('checkoutWrap');
    if(!wrap) return;
    var tries = 0;
    var timer = setInterval(function(){
      tries++;
      var layout = wrap.querySelector('.checkout-layout');
      if(layout && !wrap.querySelector('.checkout-stepper')){
        var payChecked = document.querySelector('input[name="pay"]:checked');
        var stepper = document.createElement('ul');
        stepper.className = 'checkout-stepper';
        stepper.innerHTML =
          '<li class="done"><b>✓</b>ตะกร้าสินค้า</li><span class="stepper-sep"></span>' +
          '<li class="current"><b>2</b>ที่อยู่ &amp; ชำระเงิน</li><span class="stepper-sep"></span>' +
          '<li><b>3</b>ยืนยันคำสั่งซื้อ</li>';
        layout.parentElement.insertBefore(stepper, layout);
        clearInterval(timer);
      }
      var summary = wrap.querySelector('.summary-box');
      if(summary && !summary.querySelector('.trust-badges')){
        var badges = document.createElement('div');
        badges.className = 'trust-badges';
        badges.innerHTML =
          '<span class="trust-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 11 4.6-2.3 8-6 8-11V5l-8-3Z"/></svg>ชำระเงินปลอดภัย</span>' +
          '<span class="trust-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/></svg>จัดส่งทั่วประเทศ</span>' +
          '<span class="trust-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m5 13 4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>คืนสินค้าได้</span>';
        summary.appendChild(badges);
      }
      if(tries > 20) clearInterval(timer);
    }, 250);
  }

  /* ---------------------------------------------------------------------
     E3 — Empty state: add a "reset filters" button when missing on the
     products listing empty state.
  --------------------------------------------------------------------- */
  function enhanceEmptyState(){
    var es = document.getElementById('emptyState');
    if(!es || es.querySelector('.btn-line')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-line';
    btn.textContent = 'ล้างตัวกรองทั้งหมด';
    btn.addEventListener('click', function(){
      window.location.href = 'products.html';
    });
    es.appendChild(btn);
  }

  /* ---------------------------------------------------------------------
     E4 — Toast progress bar: patch showToast (once defined) to include
     a countdown bar element inside the existing toast markup.
  --------------------------------------------------------------------- */
  function patchToast(){
    if(typeof window.showToast !== 'function' || window.showToast.__mvPatched) return;
    var original = window.showToast;
    var patched = function(msg){
      original(msg);
      var t = document.querySelector('.toast');
      if(t && !t.querySelector('.toast-bar')){
        var bar = document.createElement('div');
        bar.className = 'toast-bar';
        t.appendChild(bar);
      } else if(t){
        var bar2 = t.querySelector('.toast-bar');
        // restart animation
        bar2.style.animation = 'none';
        void bar2.offsetWidth;
        bar2.style.animation = '';
      }
    };
    patched.__mvPatched = true;
    window.showToast = patched;
  }

  onReady(function(){
    mountThemeToggle();
    initSidebarGlow();
    initTouchFallbacks();
    injectQuickViewButtons(document);
    watchProductGrids();
    enhanceCheckout();
    enhanceEmptyState();
    patchToast();

    setTimeout(function(){
      mountThemeToggle();
      injectQuickViewButtons(document);
      enhanceEmptyState();
      patchToast();
    }, 700);
  });
})();
