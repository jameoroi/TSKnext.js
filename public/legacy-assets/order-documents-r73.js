(function(){
  'use strict';

  const state = { createWrapped:false, placeWrapped:false, trackWrapped:false };

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function val(id){ return String(document.getElementById(id)?.value || '').trim(); }
  function money(value){
    const n = Number(value || 0);
    return typeof window.formatPrice === 'function' ? window.formatPrice(n) : `${n.toLocaleString('th-TH')}.-`;
  }
  function notify(message){
    if(typeof window.showToast === 'function') window.showToast(message);
    else window.alert(message);
  }
  function taxFields(){
    const requested = !!document.getElementById('taxInvoiceRequested')?.checked;
    return {
      requested,
      company_name:val('taxCompanyName'),
      tax_id:val('taxId').replace(/[^0-9]/g,''),
      branch:val('taxBranch') || 'สำนักงานใหญ่',
      address:val('taxAddress'),
      email:val('taxEmail').toLowerCase()
    };
  }
  function customerFields(){
    return {name:val('custName'),phone:val('custPhone'),address:val('custAddress'),province:val('custProvince'),zip:val('custZip')};
  }
  function normalizeItems(items){
    return (Array.isArray(items) ? items : []).map(item => {
      const p = item?.product || item || {};
      const variant = p.variant_label || item?.variant_label || '';
      return {name:String(p.name || item?.name || 'สินค้า'),variant_label:String(variant),sku:String(p.sku || item?.sku || ''),qty:Math.max(1,Number(item?.qty || 1)),price:Number(p.price ?? item?.price ?? 0)};
    });
  }
  function draftOrder(){
    const tax = taxFields();
    const items = normalizeItems(window.__orderItems || []);
    return {
      orderNo:'QUOTE-' + new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14),
      items,
      total:Number(window.__orderTotal || 0),
      subtotal:Number(window.__orderSubtotal || 0),
      shipping:Number(window.__orderShipping || 0),
      discount:Number(window.__orderDiscount || 0),
      payment:'ยังไม่ชำระเงิน',
      status:'ใบเสนอราคา',
      customer:customerFields(),
      tax_invoice_requested:tax.requested,
      tax_invoice:tax.requested ? tax : null,
      created_at:new Date().toISOString()
    };
  }
  function documentRows(order){
    return normalizeItems(order?.items).map(item => '<div style="display:grid;grid-template-columns:1fr 80px 120px;gap:12px;align-items:center;border-bottom:1px solid #e7ece9;padding:11px 0"><div><b style="font-size:13px">'+esc(item.name)+(item.variant_label?' <span style="color:#6d7d75">('+esc(item.variant_label)+')</span>':'')+'</b><div style="font-size:11px;color:#6d7d75">SKU: '+esc(item.sku || '-')+'</div></div><div style="text-align:center">x'+item.qty+'</div><div style="text-align:right;font-weight:600">'+money(item.price*item.qty)+'</div></div>').join('');
  }
  function buyerBlock(order){
    const c=order?.customer || {};
    const t=order?.tax_invoice || {};
    if(order?.tax_invoice_requested){
      return '<b>ผู้ซื้อ / บริษัท</b><div style="font-size:13px;line-height:1.7;margin-top:8px">'+esc(t.company_name||c.name)+'<br>เลขประจำตัวผู้เสียภาษี: '+esc(t.tax_id||'-')+'<br>สาขา: '+esc(t.branch||'สำนักงานใหญ่')+'<br>ที่อยู่: '+esc(t.address||c.address)+'<br>'+esc(t.email||'')+'</div>';
    }
    return '<b>ข้อมูลลูกค้า / ที่อยู่จัดส่ง</b><div style="font-size:13px;line-height:1.7;margin-top:8px">ชื่อ: '+esc(c.name)+'<br>โทร: '+esc(c.phone)+'<br>ที่อยู่: '+esc(c.address)+'<br>'+esc(c.province)+' '+esc(c.zip)+'</div>';
  }
  async function loadScript(src, test){
    if(test()) return;
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script'); s.src=src; s.onload=resolve; s.onerror=reject; document.head.appendChild(s);
    });
  }
  async function ensurePdfLibraries(){
    await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',()=>!!window.html2canvas);
    await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',()=>!!window.jspdf?.jsPDF);
  }
  async function createDocumentPdf(order, kind){
    await ensurePdfLibraries();
    const quote=kind==='quote';
    const sheet=document.createElement('div');
    sheet.style.cssText='position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#17251f;font-family:Kanit,Arial,sans-serif;padding:42px;box-sizing:border-box;z-index:-1';
    const title=quote?'ใบเสนอราคา / QUOTATION':'ใบกำกับภาษี / TAX INVOICE';
    const note=quote?'เอกสารนี้เป็นใบเสนอราคาก่อนชำระเงิน ราคาและสต็อกอาจเปลี่ยนแปลงจนกว่าจะยืนยันคำสั่งซื้อ':'เอกสารนี้สร้างจากระบบหลังยืนยันการชำระเงิน ใช้สำหรับดาวน์โหลดและตรวจสอบรายการ';
    const t=order.tax_invoice || {};
    sheet.innerHTML='<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #153e2f;padding-bottom:18px"><div><div style="font-size:27px;font-weight:800;color:#153e2f">THAISERKIT SUPPLY</div><div style="font-size:12px;color:#6d7d75">89 หมู่ 9 บ้านห้วยบง ต.น้ำแวน อ.เชียงคำ จ.พะเยา 56110<br>โทร 054-468139 | 088-2608042</div></div><div style="text-align:right"><div style="font-size:16px;font-weight:800;color:#153e2f">'+title+'</div><div style="font-size:11px;color:#6d7d75;margin-top:8px">เลขที่เอกสาร</div><div style="font-size:18px;font-weight:700">'+esc(order.orderNo||'-')+'</div><div style="font-size:11px;color:#6d7d75">'+new Date(order.created_at||Date.now()).toLocaleString('th-TH')+'</div></div></div><div style="margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:18px"><div style="border:1px solid #e2e8e4;border-radius:10px;padding:14px">'+buyerBlock(order)+'</div><div style="border:1px solid #e2e8e4;border-radius:10px;padding:14px"><b>ข้อมูลเอกสาร</b><div style="font-size:13px;line-height:1.7;margin-top:8px">สถานะ: '+esc(quote?'ยังไม่ชำระเงิน':(order.status||'ชำระเงินแล้ว'))+'<br>วิธีชำระเงิน: '+esc(order.payment || order.payment_method || '-')+'<br>'+(!quote&&order.tax_invoice_requested?'ขอใบกำกับภาษี: ใช่':'')+'</div></div></div><div style="margin-top:24px;font-weight:700;font-size:16px">รายการสินค้า</div>'+documentRows(order)+'<div style="margin-left:auto;width:320px;margin-top:18px;font-size:13px;line-height:2"><div style="display:flex;justify-content:space-between"><span>ราคาสินค้ารวม</span><span>'+money(order.subtotal)+'</span></div><div style="display:flex;justify-content:space-between"><span>ค่าจัดส่ง</span><span>'+(!Number(order.shipping)?'ฟรี':money(order.shipping))+'</span></div>'+((Number(order.discount)||0)>0?'<div style="display:flex;justify-content:space-between"><span>ส่วนลด</span><span>-'+money(order.discount)+'</span></div>':'')+'<div style="display:flex;justify-content:space-between;border-top:2px solid #153e2f;margin-top:7px;padding-top:7px;font-size:18px;font-weight:800"><span>ยอดรวม</span><span>'+money(order.total)+'</span></div></div><div style="margin-top:30px;background:#f5f8f6;border-radius:9px;padding:12px;font-size:11px;color:#66776e">'+note+'<br>'+(!quote&&!t.tax_id?'โปรดติดต่อร้านเพื่อขอเอกสารต้นฉบับที่มีข้อมูลผู้ขายครบถ้วน':'')+'</div>';
    document.body.appendChild(sheet);
    try{
      const canvas=await window.html2canvas(sheet,{scale:1.6,useCORS:true,allowTaint:false,backgroundColor:'#fff',logging:false});
      const img=canvas.toDataURL('image/jpeg',0.94); const {jsPDF}=window.jspdf; const pdf=new jsPDF({orientation:'p',unit:'mm',format:'a4'}); const pw=210,ph=297,margin=8,w=pw-margin*2,h=canvas.height*w/canvas.width; let left=h,offset=0;
      pdf.addImage(img,'JPEG',margin,margin,w,h); left-=ph-margin*2;
      while(left>0){offset-=ph-margin*2;pdf.addPage();pdf.addImage(img,'JPEG',margin,margin+offset,w,h);left-=ph-margin*2;}
      return pdf.output('blob');
    }finally{sheet.remove();}
  }
  async function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1200);}
  async function downloadQuote(){
    if(!normalizeItems(window.__orderItems||[]).length)return notify('ยังไม่มีสินค้าในตะกร้า');
    const tax=taxFields(); if(tax.requested&&(!tax.company_name||tax.tax_id.length!==13||!tax.address)){notify('กรุณากรอกชื่อบริษัท เลขผู้เสียภาษี 13 หลัก และที่อยู่ก่อนดาวน์โหลดใบเสนอราคา');return;}
    try{await downloadBlob(await createDocumentPdf(draftOrder(),'quote'),'Quotation-'+Date.now()+'.pdf');}catch(e){console.error(e);notify('สร้างใบเสนอราคาไม่สำเร็จ กรุณาลองใหม่');}
  }
  function invoiceAllowed(order){return !!order?.tax_invoice_requested&&['paid','processing','packing','shipped','completed'].includes(String(order.status));}
  async function downloadInvoice(order){
    if(!invoiceAllowed(order)){notify('ใบกำกับภาษีจะดาวน์โหลดได้หลังร้านยืนยันการชำระเงินแล้ว');return;}
    try{await downloadBlob(await createDocumentPdf(order,'invoice'),'Tax-Invoice-'+(order.order_no||Date.now())+'.pdf');}catch(e){console.error(e);notify('สร้างใบกำกับภาษีไม่สำเร็จ กรุณาลองใหม่');}
  }
  window.tskDownloadQuotePdf=downloadQuote;
  window.tskDownloadTaxInvoicePdf=downloadInvoice;

  function ensureCheckoutCard(){
    const layout=document.querySelector('#checkoutWrap .checkout-layout');
    if(!layout||document.getElementById('checkoutDocsCard'))return !!layout;
    const card=document.createElement('div'); card.className='checkout-card'; card.id='checkoutDocsCard';
    card.innerHTML='<h3>เอกสารประกอบการซื้อ</h3><label style="display:flex;align-items:flex-start;gap:9px;font-size:13px;line-height:1.55;cursor:pointer"><input id="taxInvoiceRequested" type="checkbox" style="margin-top:3px;accent-color:var(--rose-shadow)"><span>ขอใบกำกับภาษีในนามบริษัท</span></label><div id="taxInvoiceFields" style="display:none;margin-top:14px"><div class="form-grid"><div class="form-field"><label>ชื่อบริษัท</label><input id="taxCompanyName" type="text" placeholder="บริษัท ... จำกัด"></div><div class="form-field"><label>เลขประจำตัวผู้เสียภาษี 13 หลัก</label><input id="taxId" inputmode="numeric" maxlength="13" placeholder="0000000000000"></div><div class="form-field"><label>สาขา</label><input id="taxBranch" type="text" value="สำนักงานใหญ่"></div><div class="form-field"><label>อีเมลรับเอกสาร</label><input id="taxEmail" type="email" placeholder="company@example.com"></div><div class="form-field full"><label>ที่อยู่ตามใบกำกับภาษี</label><textarea id="taxAddress" rows="3" placeholder="ที่อยู่บริษัทสำหรับออกเอกสาร"></textarea></div></div></div><div style="margin-top:14px;padding-top:14px;border-top:1px solid #ece5e2"><button type="button" class="btn-line" onclick="window.tskDownloadQuotePdf()">ดาวน์โหลดใบเสนอราคา PDF ก่อนชำระเงิน</button><p style="font-size:11.5px;color:#87968e;margin:8px 0 0">ใบเสนอราคาออกจากหน้าเว็บทันที ไม่มีค่าบริการเพิ่ม</p></div>';
    const paymentCard=document.getElementById('paymentOptions')?.closest('.checkout-card');
    const host=paymentCard?.parentElement || layout.firstElementChild || layout;
    if(paymentCard)host.insertBefore(card,paymentCard); else host.appendChild(card);
    document.getElementById('taxInvoiceRequested')?.addEventListener('change',e=>{document.getElementById('taxInvoiceFields').style.display=e.target.checked?'block':'none';});
    return true;
  }
  function wrapCreateOrder(){
    if(state.createWrapped||typeof window.tskCreateOrder!=='function')return;
    state.createWrapped=true; const original=window.tskCreateOrder;
    window.tskCreateOrder=async function(payload){
      const t=taxFields();
      if(t.requested&&(!t.company_name||t.tax_id.length!==13||!t.address)){notify('กรุณากรอกข้อมูลบริษัทสำหรับใบกำกับภาษีให้ครบถ้วน');throw new Error('invalid_tax_invoice');}
      window.__tskTaxInvoiceDraft=t;
      const next={...payload,tax_invoice_requested:t.requested,tax_company_name:t.company_name,tax_id:t.tax_id,tax_branch:t.branch,tax_address:t.address,tax_email:t.email};
      const result=await original(next); window.__tskLastOrderResponse=result; return result;
    };
  }
  function wrapPlaceOrder(){
    if(state.placeWrapped||typeof window.placeOrder!=='function')return;
    state.placeWrapped=true; const original=window.placeOrder;
    window.placeOrder=async function(e){const result=await original(e); if(window.__lastLineOrder&&window.__tskTaxInvoiceDraft){window.__lastLineOrder.tax_invoice_requested=window.__tskTaxInvoiceDraft.requested;window.__lastLineOrder.tax_invoice=window.__tskTaxInvoiceDraft;} return result;};
  }
  function renderTrackedOrder(order){
    if(!invoiceAllowed(order))return;
    const panel=document.querySelector('#trackResult .tsk-panel'); if(!panel||panel.querySelector('[data-tax-invoice-action]'))return;
    const box=document.createElement('div'); box.setAttribute('data-tax-invoice-action','1'); box.style.cssText='margin-top:16px;padding:14px;border:1px solid #d8efdf;border-radius:12px;background:#f6fff8';
    box.innerHTML='<b style="color:#087f4e">เอกสารภาษี</b><p style="font-size:12.5px;color:#567064;margin:6px 0 10px">ร้านยืนยันการชำระเงินแล้ว สามารถดาวน์โหลดใบกำกับภาษีได้</p><button type="button" class="btn-solid">ดาวน์โหลดใบกำกับภาษี PDF</button>';
    box.querySelector('button').addEventListener('click',()=>downloadInvoice(order)); panel.appendChild(box);
  }
  function wrapTrack(){
    if(state.trackWrapped||typeof window.tskOrderTrack!=='function')return;
    state.trackWrapped=true; const original=window.tskOrderTrack;
    window.tskOrderTrack=async function(...args){const result=await original(...args);window.__lastTrackedOrder=result?.order||null;setTimeout(()=>renderTrackedOrder(window.__lastTrackedOrder),50);return result;};
  }
  let ticks=0; const timer=setInterval(()=>{ticks++; if(location.pathname.includes('checkout')){ensureCheckoutCard();wrapCreateOrder();wrapPlaceOrder();} if(location.pathname.includes('track-order'))wrapTrack(); if(ticks>80)clearInterval(timer);},500);
})();

