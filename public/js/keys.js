/* 密钥池：卡片列表 / 筛选 / 增删禁用 */

let allKeys = [];
let filter = 'all';

function passFilter(k){
  if(filter === 'all') return true;
  if(filter === 'busy') return k.in_use === 1;
  return k.status === filter;
}

function render(){
  const area = document.getElementById('listArea');
  const keys = allKeys.filter(passFilter);
  if(!keys.length){
    area.innerHTML = `<div class="empty">
      <div class="ic">⚿</div>
      <p>${allKeys.length ? '该筛选下暂无密钥' : '密钥池为空，先在右侧添加一把 Agnes API Key'}</p>
    </div>`;
    return;
  }
  area.innerHTML = `<div class="key-grid">` + keys.map(k => {
    const active = k.status === 'active';
    return `<div class="card key-card">
      <div class="key-top">
        <span class="key-name">${esc(k.name || '未命名密钥')}</span>
        <span>${active
          ? '<span class="pill pill-done"><span class="dot"></span>启用</span>'
          : '<span class="pill pill-failed"><span class="dot"></span>禁用</span>'}</span>
      </div>
      <div class="key-mask" title="${esc(k.key_mask)}">${esc(k.key_mask)}</div>
      <div class="key-meta">
        ${k.in_use === 1 ? '<span class="badge badge-grad">● 占用中</span>' : '<span class="badge">空闲</span>'}
        ${k.fail_count ? `<span class="badge badge-err">失败 ${k.fail_count}</span>` : ''}
        <span>最近使用 ${fmtTime(k.last_used_at)}</span>
        <span>创建 ${fmtTime(k.created_at)}</span>
      </div>
      <div class="key-actions">
        ${active ? `<button class="btn btn-sm btn-ghost" onclick="opKey(${k.id},'disable')">禁用</button>`
                 : `<button class="btn btn-sm btn-ghost" onclick="opKey(${k.id},'enable')">启用</button>`}
        ${k.in_use !== 1 ? `<button class="btn btn-sm btn-danger" onclick="delKey(${k.id})">删除</button>` : ''}
      </div>
    </div>`;
  }).join('') + `</div>`;
}

async function load(){
  try{
    const res = await fetch('/api/user/keys');
    const j = await res.json();
    if(!res.ok){
      document.getElementById('listArea').innerHTML = `<div class="empty"><div class="ic">⚠</div><p>${esc(j.error || '加载失败')}</p></div>`;
      return;
    }
    allKeys = j.keys || [];
    render();
  }catch(e){
    document.getElementById('listArea').innerHTML = `<div class="empty"><div class="ic">⚠</div><p>网络错误</p></div>`;
  }
}

window.opKey = async (id, act) => {
  const res = await fetch('/api/user/keys/' + id, { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ action: act }) });
  const j = await res.json().catch(()=>({}));
  if(!res.ok){ toast(j.error || '操作失败', 'err'); return; }
  toast(act === 'enable' ? '已启用' : '已禁用', 'ok');
  load();
};
window.delKey = async (id) => {
  if(!confirm('确定删除该密钥？')) return;
  const res = await fetch('/api/user/keys/' + id, { method:'DELETE' });
  const j = await res.json().catch(()=>({}));
  if(!res.ok){ toast(j.error || '删除失败', 'err'); return; }
  toast('已删除', 'ok');
  load();
};

document.addEventListener('DOMContentLoaded', async () => {
  const u = await ensureLogin();
  if(!u) return;
  await renderNav();

  document.querySelector('.filter-row').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if(!b) return;
    document.querySelectorAll('.filter-row .chip').forEach(c => c.classList.remove('active'));
    b.classList.add('active');
    filter = b.dataset.f;
    render();
  });

  const form = document.getElementById('addKeyForm');
  const msg = document.getElementById('msg');
  form.onsubmit = async e => {
    e.preventDefault();
    msg.textContent = '';
    const btn = document.getElementById('addBtn');
    setLoading(btn, true, '添加中…');
    const fd = new FormData(form);
    try{
      const res = await fetch('/api/user/keys', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ name: fd.get('name'), apiKey: fd.get('apiKey') })
      });
      const j = await res.json();
      if(!res.ok){ msg.textContent = j.error || '添加失败'; return; }
      toast('密钥已加入池中', 'ok');
      form.reset();
      load();
    }catch(err){ msg.textContent = '网络错误'; }
    finally{ setLoading(btn, false); }
  };

  load();
  setInterval(() => { if(!document.hidden) load(); }, 8000);
});
