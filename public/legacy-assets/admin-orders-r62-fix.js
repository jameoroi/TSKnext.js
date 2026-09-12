(function(){
  window.adminOrderSaveShipping=async function(id){
    const carrier=document.getElementById(`carrier-${id}`)?.value.trim()||'';
    const tracking=document.getElementById(`tracking-${id}`)?.value.trim()||'';
    if(!carrier||!tracking){alert('กรุณากรอกบริษัทขนส่งและเลข Tracking ให้ครบ');return;}
    try{await window.tskAdminOrderShipping(id,carrier,tracking);await window.tskAdminOrderStatus(id,'shipped');if(typeof window.showToast==='function')window.showToast('บันทึก Tracking และเปลี่ยนสถานะเป็นจัดส่งแล้ว');await window.adminOrdersRefresh();}
    catch(error){alert(`บันทึกการจัดส่งไม่สำเร็จ: ${error?.message||'unknown_error'}`);}
  };
})();
