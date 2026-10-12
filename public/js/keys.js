document.addEventListener('DOMContentLoaded', async ()=>{
  await ensureLogin();
  await renderNav();
  const list = document.getElementById('list');
  const form = document.getElementById('addKeyForm');
  async function load(){
    const res = await fetch('/api/user/keys');
    const j = await res.json();
    if(!res.ok){ list.innerHTML='<tr><td colspan="8">加载失败</td></tr>'; return; }
    if(!j.keys.length){ list.innerHTML='<tr><td colspan="8">暂无密钥</td></tr>'; return; }
    list.innerHTML = j.keys.map(k=>{
      let ops = '';
      if(k.status==='active') ops += `<button onclick="opKey(${k.id},'disable')">禁用</button>`;
      if(k.status==='disabled') ops += `<button onclick="opKey(${k.id},'enable')">启用</button>`;
      if(k.in_use!==1) ops += ` <button onclick="delKey(${k.id})">删除</button>`;
      return `<tr><td>${k.name||''}</td><td>${k.key_mask}</td><td>${k.status}</td><td>${k.in_use}</td><td>${k.fail_count}</td><td>${k.last_used_at||''}</td><td>${k.created_at||''}</td><td>${ops}</td></tr>`;
    }).join('');
  }
  window.opKey = async (id,act)=>{
    await fetch('/api/user/keys/'+id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:act})});
    load();
  };
  window.delKey = async (id)=>{
    if(!confirm('确定删除该密钥？')) return;
    await fetch('/api/user/keys/'+id,{method:'DELETE'});
    load();
  };
  form.onsubmit = async e=>{
    e.preventDefault();
    const fd = new FormData(form);
    await fetch('/api/user/keys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:fd.get('name'),apiKey:fd.get('apiKey')})});
    form.reset(); load();
  };
  load();
});
