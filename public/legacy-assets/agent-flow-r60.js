(function(){
  function addPartnerPassword(){
    var form=document.getElementById('partnerForm');
    if(!form||document.getElementById('agentSelfPassword'))return;
    var card=document.createElement('div');card.className='partner-card agent-password-card';
    card.innerHTML='<h2>ตั้งค่าการเข้าสู่ระบบตัวแทน</h2><p class="partner-note">กำหนดรหัสผ่านของ Agent Center ด้วยตัวเองตั้งแต่ตอนสมัคร บริษัทจะไม่เห็นรหัสผ่านนี้</p><div class="partner-grid"><label class="span2">รหัสผ่านสำหรับ Agent Center<input id="agentSelfPassword" name="password" type="password" minlength="10" autocomplete="new-password" required placeholder="อย่างน้อย 10 ตัวอักษร"></label></div>';
    var consent=form.querySelector('.partner-consent'); if(consent)form.insertBefore(card,consent);
  }
  function addSponsorCode(){
    var form=document.getElementById('partnerForm');if(!form||document.getElementById('agentSponsorCode'))return;
    var storeName=form.querySelector('[name="store_name"]');if(!storeName)return;var label=document.createElement('label');label.className='span2';label.innerHTML='รหัสผู้แนะนำ (ถ้ามี)<input id="agentSponsorCode" name="sponsor_code" placeholder="เช่น AGENT1234"><small>ใช้ผูกตัวแทนระดับบนและค่าคอมหลายระดับ</small>';storeName.closest('label')?.after(label);
  }
  function addStoreControls(){
    var dash=document.getElementById('agentDash');if(!dash||dash.hidden||document.getElementById('agentStoreControls'))return;
    var copy=document.getElementById('copyStore'); if(!copy)return;
    var panel=document.createElement('section');panel.id='agentStoreControls';panel.className='ac-card agent-store-controls';
    var meta=document.getElementById('acMeta')||{textContent:''};var match=String(meta.textContent||'').match(/Referral\s+([^·\s]+)/i);if(!match)return;
    var url=location.origin+'/agent-store.html?ref='+encodeURIComponent(match[1]);
    panel.innerHTML='<div><h2>หน้าร้านของฉัน</h2><p class="ac-muted">ส่งลิงก์นี้ให้ลูกค้า ระบบจะบันทึกยอดให้ตัวแทนคนนี้</p></div><div class="agent-store-url"><input aria-label="ลิงก์หน้าร้านของฉัน" readonly value="'+url+'"><button class="btn-line" type="button" data-copy>คัดลอกลิงก์</button><a class="btn-solid" target="_blank" rel="noopener">ดูหน้าร้านของฉัน</a></div>';
    panel.querySelector('a').href=url;panel.querySelector('[data-copy]').onclick=async function(){try{await navigator.clipboard.writeText(url);this.textContent='คัดลอกแล้ว';setTimeout(()=>this.textContent='คัดลอกลิงก์',1500);}catch(_){var input=panel.querySelector('input');input.focus();input.select();document.execCommand('copy');this.textContent='คัดลอกแล้ว';}};
    dash.querySelector('.ac-head')?.after(panel);
  }
  function forcePrimaryCovers(){
    if(!/agent-store\.html$/i.test(location.pathname)||typeof getProducts!=='function')return;
    var products=getProducts().filter(function(p){return p&&p.active!==false;}),cards=[].slice.call(document.querySelectorAll('#agentProducts .agent-product-card'));
    cards.forEach(function(card,index){var product=products[index],image=card.querySelector('img');if(!product||!image)return;var cover=product.img||product.image||(product.images&&product.images[0]);if(cover&&image.dataset.r60Cover!==cover){image.dataset.r60Cover=cover;image.src=typeof safeAssetUrl==='function'?safeAssetUrl(cover):cover;}});
  }
  function init(){addPartnerPassword();addSponsorCode();addStoreControls();forcePrimaryCovers();}
  document.addEventListener('DOMContentLoaded',init);setInterval(init,500);
})();
