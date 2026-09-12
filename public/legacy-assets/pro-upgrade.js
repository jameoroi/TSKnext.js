(function(){
  'use strict';
  if(!document.querySelector('.skip-link')){const a=document.createElement('a');a.className='skip-link';a.href='#main-content';a.textContent='ข้ามไปยังเนื้อหาหลัก';document.body.prepend(a);}
  const main=document.querySelector('main, section.section, section.hero'); if(main&&!document.getElementById('main-content')) main.id='main-content';
  document.querySelectorAll('img:not([loading])').forEach((img,i)=>{if(i>1)img.loading='lazy';img.decoding='async';});
  document.querySelectorAll('a[target="_blank"]').forEach(a=>{if(!/\bnoopener\b/.test(a.rel))a.rel=(a.rel+' noopener noreferrer').trim();});
  const year=new Date().getFullYear();document.querySelectorAll('.foot-bottom span').forEach(el=>{if(/©\s*20\d{2}/.test(el.textContent))el.textContent=el.textContent.replace(/©\s*20\d{2}/,'© '+year);});
  function bindNewsletter(){document.querySelectorAll('.news-input').forEach(box=>{if(box.dataset.bound)return;box.dataset.bound='1';const input=box.querySelector('input[type=email]'),btn=box.querySelector('button');if(!input||!btn)return;btn.addEventListener('click',async e=>{e.preventDefault();const email=input.value.trim();if(!email)return showToast('กรุณากรอกอีเมล');btn.disabled=true;try{const r=await tskSubscribeNewsletter(email);showToast(r.status==='active'?'อีเมลนี้ติดตามข่าวสารอยู่แล้ว':'ส่งอีเมลยืนยันแล้ว กรุณาเปิดอีเมลเพื่อยืนยัน');input.value='';}catch(err){showToast('สมัครรับข่าวสารไม่สำเร็จ กรุณาตรวจอีเมล');}finally{btn.disabled=false;}});});}
  bindNewsletter();
  window.addEventListener('load',bindNewsletter);
})();
