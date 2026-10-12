document.addEventListener('DOMContentLoaded', async ()=>{
  try{ await requireAdmin(); await renderNav(); }catch(e){ return; }
  const list = document.getElementById('list');
  async function load(){
    const res = await fetch('/api/admin/users');
    const j = await res.json();
    if(!res.ok){ list.innerHTML='<tr><td colspan="8">加载失败</td></tr>'; return; }
    list.innerHTML = (j.users||[]).map(u=>{
      let ops='';
      if(u.status==='active') ops+=`<button onclick="adminOp(${u.id},'disable')">禁用</button>`;
      if(u.status==='disabled') ops+=`<button onclick="adminOp(${u.id},'enable')">启用</button>`;
      if(u.role==='user') ops+=` <button onclick="adminOp(${u.id},'set_admin')">设为管理员</button>`;
      if(u.role==='admin') ops+=` <button onclick="adminOp(${u.id},'unset_admin')">取消管理员</button>`;
      ops+=` <a href="/admin/user-keys.html?uid=${u.id}">查看Key池</a>`;
      return `<tr><td>${u.id}</td><td>${u.email}</td><td>${u.name||''}</td><td>${u.role}</td><td>${u.status}</td><td>${u.created_at||''}</td><td>${u.last_login_at||''}</td><td>${ops}</td></tr>`;
    }).join('');
  }
  window.adminOp = async (id,act)=>{
    await fetch('/api/admin/users/'+id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:act})});
    load();
  };
  load();
});
