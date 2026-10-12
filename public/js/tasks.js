document.addEventListener('DOMContentLoaded', async ()=>{
  await ensureLogin();
  await renderNav();
  const list = document.getElementById('list');
  const res = await fetch('/api/user/tasks');
  const j = await res.json();
  if(!res.ok){ list.innerHTML='<tr><td colspan="7">加载失败</td></tr>'; return; }
  if(!j.tasks.length){ list.innerHTML='<tr><td colspan="7">暂无任务</td></tr>'; return; }
  list.innerHTML = j.tasks.map(t=>{
    let op = '';
    if(t.status==='done' && !t.video_deleted_at) op = `<a href="/task-detail.html?id=${t.id}">播放</a>`;
    return `<tr><td>${t.id}</td><td>${t.model||''}</td><td>${t.mode||''}</td><td>${t.status}</td><td>${t.created_at||''}</td><td>${t.finished_at||''}</td><td>${op}</td></tr>`;
  }).join('');
});
