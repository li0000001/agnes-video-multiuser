document.addEventListener('DOMContentLoaded', async ()=>{
  try{ await requireAdmin(); await renderNav(); }catch(e){ return; }
  const uid = new URLSearchParams(location.search).get('uid');
  const list = document.getElementById('list');
  const info = document.getElementById('info');
  if(!uid){ info.textContent='缺少 uid'; return; }
  const res = await fetch('/api/admin/users/'+uid+'/keys');
  const j = await res.json();
  if(!res.ok){ list.innerHTML='<tr><td colspan="7">加载失败</td></tr>'; return; }
  list.innerHTML = (j.keys||[]).map(k=>{
    return `<tr><td>${k.name||''}</td><td>${k.key_mask}</td><td>${k.status}</td><td>${k.in_use}</td><td>${k.fail_count}</td><td>${k.last_used_at||''}</td><td>${k.created_at||''}</td></tr>`;
  }).join('');
});
