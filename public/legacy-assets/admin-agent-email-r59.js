(function(){
  let timer=null,attempts=0;
  const MAX_ATTEMPTS=40; // ~32s at 800ms; agentList should be populated well before this
  async function showAgentEmails(){
    const list=document.getElementById('agentList');
    if(!list||typeof tskAdminAgentsList!=='function')return;
    if(!list.children.length){attempts++;if(attempts>=MAX_ATTEMPTS&&timer){clearInterval(timer);timer=null;}return;}
    try{
      const agents=(await tskAdminAgentsList()).agents||[];
      const rows=[...list.querySelectorAll('.admin-list-item')];
      rows.forEach((row,i)=>{
        const a=agents[i],meta=row.querySelector('.li-meta');
        if(!a?.email||!meta)return;
        if(meta.querySelector('.agent-login-email'))return;
        const email=document.createElement('div');email.className='agent-login-email';email.innerHTML='<b>อีเมลเข้าสู่ระบบ:</b> <a></a>';
        const link=email.querySelector('a');link.href='mailto:'+encodeURIComponent(a.email);link.textContent=a.email;meta.prepend(email);
      });
      // Stop polling once every currently-rendered row already has its email shown.
      if(rows.length&&rows.every(row=>row.querySelector('.li-meta .agent-login-email'))&&timer){clearInterval(timer);timer=null;}
    }catch(_){ }
  }
  document.addEventListener('DOMContentLoaded',()=>{showAgentEmails();if(!timer)timer=setInterval(showAgentEmails,800);});
})();
