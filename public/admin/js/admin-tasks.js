document.addEventListener('DOMContentLoaded', async ()=>{
  try{ await requireAdmin(); await renderNav(); }catch(e){ return; }
  const list = document.getElementById('list');
  const res = await fetch('/api/admin/tasks');
  const j = await res.json();
  if(!res.ok){ list.innerHTML='<tr><td colspan="8">加载失败</td></tr>'; return; }
  list.innerHTML = (j.tasks||[]).map(t=>{
    return `<tr><td>${t.id}</td><td>${t.email||t.user_id}</td><td>${t.model||''}</td><td>${t.mode||''}</td><td>${t.status}</td><td>${t.created_at||''}</td><td>${t.finished_at||''}</td><td><a href="/admin/task-detail.html?id=${t.id}">详情</a></td></tr>`;
  }).join('');
});
