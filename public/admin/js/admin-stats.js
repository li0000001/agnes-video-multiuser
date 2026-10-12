document.addEventListener('DOMContentLoaded', async ()=>{
  try{ await requireAdmin(); await renderNav(); }catch(e){ return; }
  const res = await fetch('/api/admin/stats');
  const j = await res.json();
  if(!res.ok){ alert(j.error); return; }
  const box = document.getElementById('statsBox');
  box.innerHTML = `
    <div class="card"><h3>活跃用户</h3><div class="num">${j.users}</div></div>
    <div class="card"><h3>总任务（未删除）</h3><div class="num">${j.tasksTotal}</div></div>
    <div class="card"><h3>排队中</h3><div class="num">${j.tasksPending}</div></div>
    <div class="card"><h3>生成中</h3><div class="num">${j.tasksProc}</div></div>
    <div class="card"><h3>已完成</h3><div class="num">${j.tasksDone}</div></div>
    <div class="card"><h3>失败</h3><div class="num">${j.tasksFail}</div></div>
    <div class="card"><h3>当前可播放视频</h3><div class="num">${j.videosActive}</div></div>
  `;
});
