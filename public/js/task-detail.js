/* 任务详情：媒体面板 + 信息面板 + 处理中自动刷新 */

let autoTimer = null;

function shortModel(m){
  if(!m) return '-';
  if(m.includes('image')) return 'agnes-image-2.5-flash';
  if(m.endsWith('flash')) return 'agnes-video-2.5-flash (免费)';
  return 'agnes-video-2.5 (完整版)';
}

function paramsOf(t){
  try{ return JSON.parse(t.params_json || '{}'); }catch(e){ return {}; }
}

function renderTask(t){
  const root = document.getElementById('root');
  const img = isImageTask(t);
  const p = paramsOf(t);

  /* ---- 媒体面板 ---- */
  const isDone = t.status === 'done' && !t.video_deleted_at;
  const src = t.r2_key ? `/api/user/tasks/${t.id}/play` : (p.remote_url || '');
  let media = '';
  if(isDone && src){
    if(img){
      media = `<div class="media-panel">
        <img src="${esc(src)}" alt="生成结果">
        <div class="form-foot mt">
          <span class="muted" style="font-size:13.5px">${t.r2_key ? '图像已永久存储于 R2' : '临时存储，建议立即下载'}</span>
          <a class="btn btn-primary" href="${esc(src)}" download>⬇ 下载原图</a>
        </div>
      </div>`;
    }else{
      media = `<div class="media-panel">
        <video controls playsinline src="${esc(src)}"></video>
        <div class="form-foot mt">
          <span class="muted" style="font-size:13.5px">视频已永久存储于 R2</span>
          <a class="btn btn-primary" href="/api/user/tasks/${t.id}/download" download>⬇ 下载视频</a>
        </div>
      </div>`;
    }
  }else if(isDone){
    media = `<div class="media-panel"><div class="media-wait"><span style="font-size:40px">🗑</span><span>文件已不可用</span></div></div>`;
  }else if(t.status === 'failed'){
    media = `<div class="media-panel"><div class="media-wait"><span style="font-size:40px">⚠</span><span>任务失败</span></div></div>`;
  }else{
    media = `<div class="media-panel"><div class="media-wait">
      <span class="spinner spinner-lg"></span>
      <span>${t.status === 'pending' ? '排队等待认领…' : '正在生成，每 2 分钟自动轮询'}</span>
      <span class="dim" style="font-size:12.5px">本页将自动刷新</span>
    </div></div>`;
  }

  /* ---- 参数面板 ---- */
  const chips = [];
  if(p.seconds) chips.push(`${p.seconds}s`);
  if(p.size || p.image_size) chips.push(p.size || p.image_size);
  if(p.aspect_ratio || p.ratio) chips.push(p.aspect_ratio || p.ratio);
  if(p.seed !== undefined && p.seed !== null) chips.push(`seed ${p.seed}`);

  const kv = [];
  kv.push(['任务 ID', `#${t.id}`]);
  kv.push(['状态', statusPill(t.status)]);
  kv.push(['模式', modeLabel(t.mode)]);
  kv.push(['模型', `<span class="kv-v" style="font-family:Consolas,monospace;font-size:13px">${esc(shortModel(t.model))}</span>`]);
  if(chips.length) kv.push(['参数', chips.map(c => `<span class="badge">${esc(String(c))}</span>`).join(' ')]);
  kv.push(['创建时间', fmtTime(t.created_at)]);
  if(t.finished_at) kv.push(['完成时间', fmtTime(t.finished_at)]);
  if(t.status === 'processing' || t.status === 'pending') kv.push(['轮询次数', t.poll_count ?? 0]);
  if((t.status === 'processing' || t.status === 'pending') && p.last_msg) kv.push(['当前状态', esc(String(p.last_msg))]);
  if(t.status === 'pending' && p.nra) kv.push(['预计重试', new Date(Number(p.nra) * 1000).toLocaleString('zh-CN', { hour12: false })]);

  root.innerHTML = `
    <div class="page-head" style="margin-bottom:20px">
      <div>
        <h1>任务 #${t.id} <span class="muted" style="font-size:16px;font-weight:600">${modeLabel(t.mode)}</span></h1>
        <p class="sub">${statusPill(t.status)}　${esc(shortModel(t.model))}</p>
      </div>
    </div>
    <div class="detail-grid">
      <div>${media}</div>
      <aside class="side">
        <div class="card side-card">
          <h3><span class="ic">✎</span>提示词</h3>
          <div class="prompt-box">${esc(p.prompt || '（未记录）')}</div>
        </div>
        <div class="card side-card">
          <h3><span class="ic">◈</span>生成参数</h3>
          <div class="kv">
            ${kv.map(([k, v]) => `<div class="kv-row"><span class="kv-k">${k}</span><span class="kv-v">${v}</span></div>`).join('')}
          </div>
        </div>
        ${t.status === 'failed' && t.error_reason ? `<div class="err-box">失败原因：${esc(t.error_reason)}</div>` : ''}
        <details class="adv" style="margin-top:2px">
          <summary>完整参数 JSON</summary>
          <div class="adv-body"><pre>${esc(JSON.stringify(p, null, 2))}</pre></div>
        </details>
      </aside>
    </div>`;

  // 处理中自动刷新
  if(t.status === 'pending' || t.status === 'processing'){
    if(!autoTimer) autoTimer = setInterval(load, 5000);
  }else if(autoTimer){
    clearInterval(autoTimer); autoTimer = null;
  }
}

async function load(){
  const id = new URLSearchParams(location.search).get('id');
  if(!id){ location.href = '/tasks.html'; return; }
  try{
    const res = await fetch('/api/user/tasks/' + encodeURIComponent(id));
    const j = await res.json();
    const root = document.getElementById('root');
    if(!res.ok){
      root.innerHTML = `<div class="empty"><div class="ic">⚠</div><p>${esc(j.error || '加载失败')}</p><a class="btn" href="/tasks.html">返回列表</a></div>`;
      if(autoTimer){ clearInterval(autoTimer); autoTimer = null; }
      return;
    }
    renderTask(j.task);
  }catch(e){
    document.getElementById('root').innerHTML = `<div class="empty"><div class="ic">⚠</div><p>网络错误</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const u = await ensureLogin();
  if(!u) return;
  await renderNav();
  load();
});
