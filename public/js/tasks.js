/* 任务列表：卡片网格 / 筛选 / 活动任务自动刷新 */

let allTasks = [];
let filter = 'all';
let timer = null;

function passFilter(t){
  if(filter === 'all') return true;
  if(filter === 'image') return isImageTask(t);
  if(filter === 'video') return !isImageTask(t);
  if(filter === 'active') return t.status === 'pending' || t.status === 'processing';
  return true;
}

function render(){
  const area = document.getElementById('listArea');
  const tasks = allTasks.filter(passFilter);
  const active = allTasks.some(t => t.status === 'pending' || t.status === 'processing');
  document.getElementById('autoHint').textContent = active ? '· 有任务生成中，自动刷新' : '';

  if(!tasks.length){
    area.innerHTML = `<div class="empty">
      <div class="ic">◇</div>
      <p>${allTasks.length ? '该筛选下暂无任务' : '还没有任何任务，去创作台生成第一个作品吧'}</p>
      <a class="btn btn-primary" href="/">✦ 开始创作</a>
    </div>`;
    return;
  }

  area.innerHTML = `<div class="task-grid">` + tasks.map(t => {
    const img = isImageTask(t);
    const icon = img ? '✦' : t.mode === 'keyframe' ? '⧉' : t.mode === 'reference' ? '⌘' : '▶';
    const modelShort = t.model?.includes('image') ? 'Image 2.5 Flash'
      : t.model?.endsWith('flash') ? 'Video 2.5 Flash' : 'Video 2.5';
    return `<div class="card task-card" onclick="location.href='/task-detail.html?id=${t.id}'">
      <div class="task-thumb ${img ? 'm-image' : ''}">
        <span class="th-pill">${statusPill(t.status)}</span>
        <span style="filter:drop-shadow(0 4px 14px rgba(0,0,0,.6))">${icon}</span>
        ${t.r2_key && t.status === 'done' ? `<span class="th-seed">✓ 已存储</span>` : ''}
      </div>
      <div class="task-body">
        <div class="task-title"><span>${modeLabel(t.mode)}</span><span class="tid">#${t.id}</span></div>
        <div class="task-meta">
          <span class="badge badge-grad">${modelShort}</span>
          ${t.status === 'failed' ? '<span class="badge badge-err">点击查看原因</span>' : ''}
        </div>
        <div class="task-time">创建于 ${fmtTime(t.created_at)}</div>
      </div>
    </div>`;
  }).join('') + `</div>`;
}

let lastCronPing = 0;
async function load(){
  try{
    const res = await fetch('/api/user/tasks');
    const j = await res.json();
    if(!res.ok){
      document.getElementById('listArea').innerHTML = `<div class="empty"><div class="ic">⚠</div><p>${esc(j.error || '加载失败')}</p></div>`;
      return;
    }
    allTasks = j.tasks || [];
    render();
    // 有活动任务则 5 秒自动刷新；顺带触发轮询（cron 未配置时页面开着也能自驱动队列，10 秒节流）
    const active = allTasks.some(t => t.status === 'pending' || t.status === 'processing');
    if(active && !timer) timer = setInterval(load, 5000);
    if(!active && timer){ clearInterval(timer); timer = null; }
    if(active && Date.now() - lastCronPing > 10000){
      lastCronPing = Date.now();
      fetch('/api/cron/poll').catch(() => {});
    }
  }catch(e){
    document.getElementById('listArea').innerHTML = `<div class="empty"><div class="ic">⚠</div><p>网络错误，请刷新重试</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const u = await ensureLogin();
  if(!u) return;
  await renderNav();
  document.getElementById('filters').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if(!b) return;
    document.querySelectorAll('#filters .chip').forEach(c => c.classList.remove('active'));
    b.classList.add('active');
    filter = b.dataset.f;
    render();
  });
  load();
});
