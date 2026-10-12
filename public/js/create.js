document.addEventListener('DOMContentLoaded', async ()=>{
  await ensureLogin();
  await renderNav();
  const f = document.getElementById('createForm');
  const m = document.getElementById('msg');
  f.onsubmit = async e=>{
    e.preventDefault();
    let body = {};
    const adv = document.getElementById('advJson').value.trim();
    if(adv){
      try{ body = JSON.parse(adv); }catch{ m.textContent='高级 JSON 格式错误'; return; }
    }else{
      const fd = new FormData(f);
      body.prompt = fd.get('prompt');
      if(fd.get('seconds')) body.seconds = fd.get('seconds');
      if(fd.get('aspect_ratio')) body.aspect_ratio = fd.get('aspect_ratio');
      if(fd.get('size')) body.size = fd.get('size');
      body.mode = 'text';
    }
    const res = await fetch('/api/user/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const j = await res.json();
    if(!res.ok){ m.textContent=j.error||'创建失败'; return; }
    location.href='/tasks.html';
  };
});
