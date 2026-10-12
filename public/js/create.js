/* 创作台：模式切换 / 素材上传 / 参数组装 / 提交 */

const PLACEHOLDER = {
  image: '描述你想生成的画面，例如：赛博朋克风格的雨夜街道，霓虹倒影在积水中，电影感构图，8K 细节',
  text: '描述一段视频：镜头运动、场景、光影、风格，例如：镜头缓缓推过晨雾中的森林，阳光穿透树冠，电影级画质',
  keyframe: '描述从首帧到尾帧的变化过程，例如：镜头缓慢拉远，女孩缓缓转头看向窗外，画面逐渐变亮',
  reference: '描述如何使用参考图，例如：保持 <Picture 1> 中人物的外貌，让她走进 <Picture 2> 的街道场景'
};
const HINT = {
  image: '同步生成，通常 5~30 秒返回',
  text: '视频任务异步生成，提交后到「我的任务」查看进度',
  keyframe: '提示词聚焦「变化与运动」效果最佳',
  reference: '在提示词中用 <span class="code">&lt;Picture N&gt;</span> 引用第 N 张图'
};
const TIPS = {
  image: ['Image 2.5 Flash 模型，同步返回成图', '支持 1K / 2K / 3K / 4K 尺寸与 8 种画幅', '当前官方定价 $0（免费）'],
  text: ['Video 2.5 Flash 文生视频', '720P 走 Flash 免费模型', '1080P / 1K / 2K 自动切换 agnes-video-2.5 付费版', '时长 4~12 秒，支持 6 种画幅'],
  keyframe: ['上传首帧和/或尾帧（至少一张），模型补全中间运动', '提示词描述两个画面之间的变化', '素材会以随机地址公开分发给 Agnes 抓取'],
  reference: ['最多 5 张参考图，用 &lt;Picture N&gt; 引用第 N 张', '可保持角色 / 场景 / 风格一致性', '素材会以随机地址公开分发给 Agnes 抓取']
};

let mode = 'image';
const slots = { first_frame: null, last_frame: null }; // {file, dataUrl, url?}
const refImages = []; // {file, dataUrl, url?}

const $ = s => document.querySelector(s);
const msgEl = $('#msg');

function showMsg(t){ msgEl.textContent = t || ''; }
function chipVal(sel){ const el = document.querySelector(sel + ' .chip.active'); return el ? el.dataset.v : null; }

function renderMode(){
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  const isImage = mode === 'image';
  $('#videoOpts').hidden = isImage;
  $('#imageOpts').hidden = !isImage;
  $('#keyframeBox').classList.toggle('hidden', mode !== 'keyframe');
  $('#refBox').classList.toggle('hidden', mode !== 'reference');

  const box = $('#promptBox');
  box.placeholder = PLACEHOLDER[mode];
  $('#promptHint').innerHTML = HINT[mode];
  $('#tipTitle').textContent = modeLabel(mode) + ' · 说明';
  $('#modeTip').innerHTML = TIPS[mode].map(t => `<li>${t}</li>`).join('');
  box.value = '';
  showMsg('');
  updateEstimate();
}

function updateEstimate(){
  const size = $('#estimate');
  if(mode === 'image'){
    size.innerHTML = `模型 <b>agnes-image-2.5-flash</b> · 尺寸 <b>${chipVal('#imgSizeChips')}</b> · 当前官方定价 <b>$0</b>`;
  }else{
    const s = chipVal('#secChips') || '5';
    const sz = chipVal('#sizeChips') || '720P';
    const paid = sz !== '720P';
    size.innerHTML = `模型 <b>${paid ? 'agnes-video-2.5' : 'agnes-video-2.5-flash'}</b> · ${s}s · <b>${sz}</b>` +
      (paid ? ' <span style="color:#fbbf24">（付费）</span>' : ' <span style="color:#6ee7b7">（免费）</span>');
  }
}

/* ---------- chips 单选 ---------- */
document.addEventListener('click', e => {
  const chip = e.target.closest('.chips .chip');
  if(!chip) return;
  chip.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  updateEstimate();
});

/* ---------- 模式切换 ---------- */
document.querySelectorAll('.seg-btn').forEach(b => {
  b.onclick = () => { mode = b.dataset.mode; renderMode(); };
});

/* ---------- 文件读取 ---------- */
function readFile(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function validFile(file){
  if(!file) return false;
  if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)){ toast('仅支持 PNG / JPG / WebP / GIF', 'err'); return false; }
  if(file.size > 10*1024*1024){ toast('图片不能超过 10MB', 'err'); return false; }
  return true;
}

/* ---------- 首尾帧上传 ---------- */
document.querySelectorAll('.upload[data-slot]').forEach(up => {
  const slot = up.dataset.slot;
  const input = up.querySelector('input[type=file]');
  up.addEventListener('click', e => {
    if(e.target.closest('.up-x')) return;
    if(slots[slot]) return;
    input.click();
  });
  input.addEventListener('change', async () => {
    const f = input.files[0];
    if(!validFile(f)) return;
    const dataUrl = await readFile(f);
    slots[slot] = { file: f, dataUrl };
    up.classList.add('filled');
    const prev = up.querySelector('.up-prev');
    prev.src = dataUrl; prev.hidden = false;
    up.querySelector('.up-empty').style.display = 'none';
    input.value = '';
  });
  up.querySelector('.up-x').addEventListener('click', e => {
    e.stopPropagation();
    slots[slot] = null;
    up.classList.remove('filled');
    up.querySelector('.up-prev').hidden = true;
    up.querySelector('.up-empty').style.display = '';
  });
});

/* ---------- 参考图上传（最多5张） ---------- */
const refGrid = $('#refGrid');
const refAdd = $('#refAdd');
const refInput = $('#refInput');

refAdd.onclick = () => refInput.click();
refInput.addEventListener('change', async () => {
  const files = Array.from(refInput.files || []);
  for(const f of files){
    if(refImages.length >= 5){ toast('最多 5 张参考图', 'warn'); break; }
    if(!validFile(f)) continue;
    refImages.push({ file: f, dataUrl: await readFile(f) });
  }
  refInput.value = '';
  renderRefs();
});
function renderRefs(){
  refGrid.querySelectorAll('.up-item').forEach(el => el.remove());
  refImages.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'upload filled up-item';
    div.innerHTML = `<span class="up-tag">${i === 0 ? 'Picture 1' : 'Picture ' + (i+1)}</span>
      <img class="up-prev" src="${item.dataUrl}" alt="参考图${i+1}">
      <button type="button" class="up-x" title="移除">×</button>`;
    div.querySelector('.up-x').onclick = () => { refImages.splice(i, 1); renderRefs(); };
    refGrid.insertBefore(div, refAdd);
  });
  $('#refCount').textContent = `${refImages.length} / 5`;
  refAdd.style.display = refImages.length >= 5 ? 'none' : '';
}

/* ---------- 上传到服务器 ---------- */
async function uploadOne(item){
  if(item.url) return item.url;
  const res = await fetch('/api/user/upload', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: item.dataUrl })
  });
  const j = await res.json();
  if(!res.ok) throw new Error(j.error || '素材上传失败');
  item.url = j.url;
  return item.url;
}

/* ---------- 提交 ---------- */
$('#createForm').onsubmit = async e => {
  e.preventDefault();
  showMsg('');
  const prompt = $('#promptBox').value.trim();
  if(!prompt){ showMsg('请输入提示词'); return; }

  let body;
  if(mode === 'image'){
    body = { type: 'image', prompt, image_size: chipVal('#imgSizeChips'), ratio: chipVal('#ratioChips') };
  }else{
    body = { mode, prompt };
    if(mode !== 'image'){
      body.seconds = chipVal('#secChips') || '5';
      body.size = chipVal('#sizeChips');
      body.aspect_ratio = chipVal('#arChips');
    }
    if(mode === 'keyframe'){
      if(!slots.first_frame && !slots.last_frame){ showMsg('请至少上传首帧或尾帧图片'); return; }
    }
    if(mode === 'reference'){
      if(!refImages.length){ showMsg('请至少上传 1 张参考图片'); return; }
    }
  }

  // 高级 JSON 合并（优先生效）
  const advRaw = $('#advJson').value.trim();
  if(advRaw){
    let adv;
    try{ adv = JSON.parse(advRaw); }catch(err){ showMsg('高级 JSON 解析失败：' + err.message); return; }
    if(typeof adv !== 'object' || Array.isArray(adv)){ showMsg('高级 JSON 需为对象'); return; }
    body = { ...body, ...adv };
    if(adv.mode) body.mode = adv.mode;
    if(adv.type) body.type = adv.type;
  }

  const btn = $('#submitBtn');
  setLoading(btn, true, '提交中…');
  try{
    // 1) 上传素材（仅本模式需要）
    if(mode === 'keyframe'){
      const [f, l] = await Promise.all([
        slots.first_frame ? uploadOne(slots.first_frame) : Promise.resolve(null),
        slots.last_frame ? uploadOne(slots.last_frame) : Promise.resolve(null)
      ]);
      if(f) body.first_frame = f;
      if(l) body.last_frame = l;
    }
    if(mode === 'reference'){
      body.images = await Promise.all(refImages.map(uploadOne));
    }

    // 2) 创建任务
    const res = await fetch('/api/user/tasks', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await res.json();
    if(!res.ok){
      const t = j.error || '创建任务失败';
      showMsg(t);
      toast(t, 'err');
      return;
    }
    toast(mode === 'image' ? '图像已生成！' : '任务已提交，正在生成…', 'ok');
    setTimeout(() => location.href = '/tasks.html', mode === 'image' ? 600 : 400);
  }catch(err){
    showMsg(err.message || '网络错误');
    toast(err.message || '网络错误', 'err');
  }finally{
    setLoading(btn, false);
  }
};

/* ---------- 最近任务 ---------- */
async function loadRecent(){
  const box = $('#recent');
  try{
    const j = await fetch('/api/user/tasks').then(r => r.json());
    const tasks = (j.tasks || []).slice(0, 4);
    if(!tasks.length){ box.innerHTML = '<div class="dim" style="font-size:13.5px">还没有任务，创建第一个吧 ✦</div>'; return; }
    box.innerHTML = tasks.map(t => `
      <a class="recent-item" href="/task-detail.html?id=${t.id}">
        <span><span class="rid">#${t.id}</span> · ${esc(modeLabel(t.mode))}</span>
        ${statusPill(t.status)}
      </a>`).join('');
  }catch(e){ box.innerHTML = '<div class="dim" style="font-size:13.5px">加载失败</div>'; }
}

document.addEventListener('DOMContentLoaded', async () => {
  const u = await ensureLogin();
  if(!u) return;
  await renderNav();
  renderMode();
  const five = document.querySelector('#secChips .chip[data-v="5"]');
  if(five) five.classList.add('active');
  updateEstimate();
  loadRecent();
});
