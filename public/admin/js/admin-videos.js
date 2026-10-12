document.addEventListener('DOMContentLoaded', async ()=>{
  try{ await requireAdmin(); await renderNav(); }catch(e){ return; }
  const list = document.getElementById('list');
  async function load(){
    const res = await fetch('/api/admin/videos');
    const j = await res.json();
    if(!res.ok){ list.innerHTML='<tr><td colspan="6">加载失败</td></tr>'; return; }
    list.innerHTML = (j.videos||[]).map(v=>{
      return `<tr><td>${v.id}</td><td>${v.email||v.user_id}</td><td>${v.model||''}</td><td>${v.mode||''}</td><td>${v.finished_at||''}</td><td><a href="/api/admin/tasks/${v.id}/play" target="_blank">在线播放</a> <button onclick="delV(${v.id})">删除视频文件</button></td></tr>`;
    }).join('');
  }
  window.delV = async (id)=>{
    if(!confirm('确定删除该视频文件？')) return;
    await fetch('/api/admin/tasks/'+id+'/delete-video',{method:'POST'});
    load();
  };
  load();
});
