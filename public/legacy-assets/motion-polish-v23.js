/* =========================================================================
   THAISERKIT SUPPLY — Release 23 — Motion & Micro-interaction Polish (JS)
   Loads after site-refresh-v22.js. Purely additive: reads the DOM that the
   earlier scripts already built and layers small, self-contained behaviors
   on top. Nothing here removes or replaces existing functionality.
   ========================================================================= */
(function(){
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function onReady(fn){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', fn);
    } else { fn(); }
  }

  /* ---- generic scroll-reveal helper: add class `mv-in` once visible ---- */
  function revealOnView(el, opts){
    if(!el || el.classList.contains('mv-in')) return;
    if(reduceMotion || !('IntersectionObserver' in window)){
      el.classList.add('mv-in');
      return;
    }
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('mv-in');
          io.unobserve(entry.target);
        }
      });
    }, opts || { threshold:.2, rootMargin:'0px 0px -10% 0px' });
    io.observe(el);
  }

  /* ---- 1) hero feature strip (4 badges under the banner) — staggered ---- */
  function initHeroFeaturesReveal(){
    document.querySelectorAll('.hero-features').forEach(function(el){
      revealOnView(el, { threshold:.3 });
    });
  }

  /* ---- 2) section title reveal: fade + translate(12px) + line draw ---- */
  function initSectionTitleReveal(){
    document.querySelectorAll('.sec-head').forEach(function(el){
      revealOnView(el, { threshold:.25, rootMargin:'0px 0px -8% 0px' });
    });
  }

  /* Some sections (products, news, categories) render their grids after an
     async data load, so watch for late-inserted .sec-head/.hero-features
     too — cheap, one-off MutationObserver scoped to the home content area. */
  function watchForLateSections(){
    var root = document.querySelector('.home-commerce, .home-main-column') || document.body;
    if(!('MutationObserver' in window)) return;
    var mo = new MutationObserver(function(){
      initHeroFeaturesReveal();
      initSectionTitleReveal();
    });
    mo.observe(root, { childList:true, subtree:true });
    // stop watching after the page has settled — avoids indefinite overhead
    setTimeout(function(){ mo.disconnect(); }, 8000);
  }

  /* ---- 3) category grid: mouse-follow radial glow ---- */
  function initCategoryGlow(){
    var grid = document.getElementById('catGrid');
    if(!grid || reduceMotion) return;
    grid.addEventListener('mousemove', function(e){
      var card = e.target.closest ? e.target.closest('.cat-card') : null;
      if(!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
    }, { passive:true });
  }

  /* ---- 4) member card: gentle ambient particle field ---- */
  function initMemberParticles(){
    var card = document.querySelector('.home-member-card');
    if(!card || reduceMotion || card.querySelector('.mv-particle-field')) return;
    var field = document.createElement('div');
    field.className = 'mv-particle-field';
    field.setAttribute('aria-hidden', 'true');
    var html = '';
    var count = 14;
    for(var i = 0; i < count; i++){
      var left = (Math.random() * 96 + 2).toFixed(1);
      var size = (2 + Math.random() * 3).toFixed(1);
      var dur = (7 + Math.random() * 6).toFixed(1);
      var delay = (Math.random() * 8).toFixed(1);
      html += '<span style="left:' + left + '%;width:' + size + 'px;height:' + size + 'px;' +
              'animation-duration:' + dur + 's;animation-delay:' + delay + 's;"></span>';
    }
    field.innerHTML = html;
    card.insertBefore(field, card.firstChild);
  }

  /* ---- 5) back-to-top: single-ring scroll progress (no extra small circle) ---- */
  function initBackToTopRing(){
    var btn = document.querySelector('.back-to-top');
    if(!btn) return;

    /* Remove the old SVG progress ring if a cached/older build mounted it.
       Progress is now painted directly on the main button border. */
    var oldRing = btn.querySelector('.btt-ring');
    if(oldRing) oldRing.remove();

    var ticking = false;
    function update(){
      var doc = document.documentElement;
      var scrollTop = doc.scrollTop || document.body.scrollTop || 0;
      var height = (doc.scrollHeight - doc.clientHeight) || 1;
      var pct = Math.min(1, Math.max(0, scrollTop / height));
      btn.style.setProperty('--btt-progress', (pct * 360).toFixed(1) + 'deg');
      ticking = false;
    }
    window.addEventListener('scroll', function(){
      if(!ticking){ requestAnimationFrame(update); ticking = true; }
    }, { passive:true });
    update();
  }

  onReady(function(){
    initHeroFeaturesReveal();
    initSectionTitleReveal();
    initCategoryGlow();
    initMemberParticles();
    initBackToTopRing();
    watchForLateSections();

    // re-run the light-weight one-offs shortly after load too, in case
    // product/news/category grids finished rendering just after DOMContentLoaded
    setTimeout(function(){
      initHeroFeaturesReveal();
      initSectionTitleReveal();
      initMemberParticles();
      initBackToTopRing();
    }, 600);
  });
})();
