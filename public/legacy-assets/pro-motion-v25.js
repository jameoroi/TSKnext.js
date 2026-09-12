(function(){
  'use strict';
  const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function heroPointer(){
    if(reduced||window.innerWidth<900)return;
    const hero=document.querySelector('body[data-page="home"] .hero-slide'); if(!hero)return;
    hero.addEventListener('pointermove',e=>{const r=hero.getBoundingClientRect();hero.style.setProperty('--v25-x',`${((e.clientX-r.left)/r.width*100).toFixed(1)}%`);hero.style.setProperty('--v25-y',`${((e.clientY-r.top)/r.height*100).toFixed(1)}%`);});
    hero.addEventListener('pointerleave',()=>{hero.style.setProperty('--v25-x','50%');hero.style.setProperty('--v25-y','50%');});
  }
  function staggerFeatured(){
    const grid=document.getElementById('featuredGrid'); if(!grid)return;
    const apply=()=>grid.querySelectorAll('.prod-card').forEach((c,i)=>{c.style.setProperty('--v25-delay',`${Math.min(i*70,350)}ms`);c.animate?.([{opacity:.15,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:520,delay:Math.min(i*70,350),easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});});
    const mo=new MutationObserver(()=>{if(grid.querySelector('.prod-card')){apply();mo.disconnect();}});mo.observe(grid,{childList:true}); if(grid.querySelector('.prod-card'))apply();
  }
  document.addEventListener('DOMContentLoaded',()=>{heroPointer();staggerFeatured();});
})();
