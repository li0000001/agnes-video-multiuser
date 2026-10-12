document.addEventListener('DOMContentLoaded', async ()=>{
  try{ await requireAdmin(); await renderNav(); }catch(e){ return; }
  const id = new URLSearchParams(location.search).get('id');
  if(!id){ return; }
  async function load(){
    const res = await fetch('/api/admin/tasks/'+id);
    const j = await res.json();
    if(!res.ok){ document.getElementById('info').textContent=j.error; return; }
    const t = j.task;
    document.getElementById('info').innerHTML = `<pre>${JSON.stringify(t,null,2)}</pre>`;
    const ops = document.getElementById('ops');
    ops.innerHTML='';
    ops.innerHTML += `<button onclick="resetTask()">重置为 pending</button>`;
    if(t.status==='done' && t.r2_key && !t.video_deleted_at){
      ops.innerHTML += `<button onclick="delVideo()">仅删除视频文件</button>`;
      document.getElementById('player').innerHTML = `<video controls src="/api/admin/tasks/${t.id}/play" style="max-width:100%"></video>`;
    }
    ops.innerHTML += `<button onclick="delTask(false)">删除任务记录</button>`;
    ops.innerHTML += `<button onclick="delTask(true)">删除任务+视频</button>`;
  }
  window.resetTask = async ()=>{
    if(!confirm('重置为 pending？')) return;
    await fetch('/api/admin/tasks/'+id+'/reset',{method:'POST'});
    load();
  };
  window.delVideo = async ()=>{
    if(!confirm('确定删除该视频文件？此操作不可恢复')) return;
    await fetch('/api/admin/tasks/'+id+'/delete-video',{method:'POST'});
    load();
  };
  window.delTask = async (also)=>{
    if(!confirm('确定删除任务记录？'+(also?'将同时删除视频文件':'')+'此操作不可恢复')) return;
    await fetch('/api/admin/tasks/'+id+'/delete-task',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({alsoDeleteFile:also})});
    location.href='/admin/tasks.html';
  };
  load();
});
