document.addEventListener('DOMContentLoaded', async ()=>{
  await ensureLogin();
  await renderNav();
  const id = new URLSearchParams(location.search).get('id');
  if(!id){ location.href='/tasks.html'; return; }
  const res = await fetch('/api/user/tasks/'+id);
  const j = await res.json();
  if(!res.ok){ document.getElementById('info').textContent=j.error||'加载失败'; return; }
  const t = j.task;
  document.getElementById('info').innerHTML = `<pre>${JSON.stringify(t,null,2)}</pre>`;
  const player = document.getElementById('player');
  if(t.status==='done' && !t.video_deleted_at){
    player.innerHTML = `<video controls src="/api/user/tasks/${t.id}/play" style="max-width:100%"></video><p><a href="/api/user/tasks/${t.id}/download">下载</a></p>`;
  }
});
