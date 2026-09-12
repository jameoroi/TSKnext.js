/* Replace the legacy generic Owner error with a safe configuration diagnosis. */
(function(){
  window.handleAdminLogin=async function(e){e.preventDefault();const errEl=document.getElementById('adminLoginError');try{await window.tskAdminLogin(document.getElementById('adminUser').value,document.getElementById('adminPass').value);window.location.href='admin.html';}catch(err){const reason=err?.message||'';errEl.textContent=reason==='admin_not_configured'?'ยังไม่พบ ADMIN_USERNAME และ ADMIN_PASSWORD ใน Cloudflare':reason==='admin_password_too_weak'?'รหัสผ่าน Super Admin ต้องมีอย่างน้อย 14 ตัวอักษร':reason==='rate_limited'?'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่':'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';errEl.style.display='block';}return false;};
})();
