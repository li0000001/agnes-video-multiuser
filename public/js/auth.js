/* 共享：导航 / 登录态 / Toast / 工具函数 */

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

const MODE_LABEL = { text:'文生视频', keyframe:'首尾帧', reference:'参考图', image:'文生图' };
function modeLabel(m){ return MODE_LABEL[m] || m || '-'; }
function isImageTask(t){ return t?.mode === 'image' || String(t?.model||'').includes('image'); }

function statusPill(s){
  const map = {
    pending:['pill-pending','排队中'],
    processing:['pill-processing','生成中'],
    done:['pill-done','已完成'],
    failed:['pill-failed','失败']
  };
  const [cls,label] = map[s] || ['pill-pending', esc(s||'')];
  return `<span class="pill ${cls}"><span class="dot"></span>${label}</span>`;
}

function fmtTime(s){
  if(!s) return '-';
  // SQLite datetime('now') 为 UTC，转本地
  const iso = String(s).includes('T') ? String(s) : String(s).replace(' ','T')+'Z';
  const d = new Date(iso);
  if(isNaN(d)) return esc(s);
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toast(msg, type){
  let stack = document.querySelector('.toast-stack');
  if(!stack){ stack = document.createElement('div'); stack.className='toast-stack'; document.body.appendChild(stack); }
  const el = document.createElement('div');
  el.className = 'toast toast-' + (type||'ok');
  el.innerHTML = esc(msg);
  stack.appendChild(el);
  setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(), 260); }, 3600);
}

async function renderNav(){
  const nav = document.getElementById('nav');
  if(!nav) return null;
  nav.className = 'nav';
  let me = { loggedIn:false };
  try { me = await fetch('/api/auth/me').then(r=>r.json()); } catch(e){}

  const path = location.pathname;
  const active = href => (href === '/' ? (path === '/') : path.startsWith(href)) ? ' class="active"' : '';

  let links = `<a href="/"${active('/')}>创作台</a><a href="/tasks.html"${active('/tasks')}>我的任务</a>`;
  if(me.loggedIn) links += `<a href="/keys.html"${active('/keys')}>密钥池</a>`;

  let right = '';
  if(me.loggedIn){
    const u = me.user || {};
    const initial = esc((u.email||u.name||'?').slice(0,1).toUpperCase());
    if(u.role === 'admin') right += `<a class="btn btn-ghost btn-sm" href="/admin/index.html">管理后台</a>`;
    right += `<span class="user-chip"><span class="avatar">${initial}</span><span class="uname">${esc(u.name || u.email || '')}</span></span>`;
    right += `<button class="btn btn-ghost btn-sm" id="logoutBtn" type="button">退出</button>`;
  }else{
    right = `<a class="btn btn-ghost btn-sm" href="/login.html">登录</a><a class="btn btn-primary btn-sm" href="/register.html">注册</a>`;
  }

  nav.innerHTML = `
    <div class="nav-inner">
      <a class="logo" href="/">
        <span class="logo-mark">A</span>
        <span>Agnes Studio<div class="brand-sub">Video · Image</div></span>
      </a>
      <div class="nav-links">${links}</div>
      <div class="nav-right">${right}</div>
    </div>`;

  const lb = document.getElementById('logoutBtn');
  if(lb) lb.onclick = async ()=>{
    await fetch('/api/auth/logout',{method:'POST'});
    location.href = '/login.html';
  };
  return me;
}

async function ensureLogin(){
  const me = await fetch('/api/auth/me').then(r=>r.json()).catch(()=>({loggedIn:false}));
  if(!me.loggedIn){ location.href='/login.html'; return null; }
  return me.user;
}

function setLoading(btn, on, text){
  if(on){
    btn.dataset.old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${text || '处理中…'}`;
  }else{
    btn.disabled = false;
    if(btn.dataset.old) btn.innerHTML = btn.dataset.old;
  }
}

function bindLogin(){
  renderNav();
  const f = document.getElementById('loginForm');
  const m = document.getElementById('msg');
  f.onsubmit = async e=>{
    e.preventDefault();
    const btn = f.querySelector('button[type=submit]');
    setLoading(btn, true, '登录中…');
    const fd = new FormData(f);
    try{
      const res = await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:fd.get('email'),password:fd.get('password')})});
      const j = await res.json();
      if(!res.ok){ m.textContent = j.error || '登录失败'; return; }
      location.href = '/';
    }catch(err){ m.textContent = '网络错误，请重试'; }
    finally{ setLoading(btn, false); }
  };
}

function bindRegister(){
  renderNav();
  const f = document.getElementById('regForm');
  const m = document.getElementById('msg');
  f.onsubmit = async e=>{
    e.preventDefault();
    const btn = f.querySelector('button[type=submit]');
    setLoading(btn, true, '注册中…');
    const fd = new FormData(f);
    try{
      const res = await fetch('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:fd.get('email'),password:fd.get('password')})});
      const j = await res.json();
      if(!res.ok){ m.textContent = j.error || '注册失败'; return; }
      if(j.bootstrapAdmin) toast('注册成功！你是本平台第一位用户，已自动成为管理员', 'ok');
      else toast('注册成功，正在登录…', 'ok');
      // 注册成功后自动登录
      const lr = await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:fd.get('email'),password:fd.get('password')})});
      if(lr.ok){ location.href = '/'; return; }
      m.textContent = '注册成功，请登录';
      setTimeout(()=>location.href='/login.html', 900);
    }catch(err){ m.textContent = '网络错误，请重试'; }
    finally{ setLoading(btn, false); }
  };
}

document.addEventListener('DOMContentLoaded', renderNav);
