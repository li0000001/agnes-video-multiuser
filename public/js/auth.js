async function renderNav(){
  const nav = document.getElementById('nav');
  if(!nav) return;
  const me = await fetch('/api/auth/me').then(r=>r.json());
  let html = '<a href="/">首页</a> <a href="/tasks.html">我的任务</a> <a href="/keys.html">密钥池</a>';
  if(me.loggedIn){
    if(me.user.role==='admin') html += ' <a href="/admin/index.html">管理员后台</a>';
    html += ' <a href="javascript:;" id="logoutBtn">退出</a>';
  }else{
    html += ' <a href="/login.html">登录</a> <a href="/register.html">注册</a>';
  }
  nav.innerHTML = html;
  const lb = document.getElementById('logoutBtn');
  if(lb) lb.onclick = async ()=>{
    await fetch('/api/auth/logout',{method:'POST'});
    location.href='/login.html';
  };
}

async function ensureLogin(){
  const me = await fetch('/api/auth/me').then(r=>r.json());
  if(!me.loggedIn){ location.href='/login.html'; return null; }
  return me.user;
}

function bindLogin(){
  renderNav();
  const f = document.getElementById('loginForm');
  const m = document.getElementById('msg');
  f.onsubmit = async e=>{
    e.preventDefault();
    const fd = new FormData(f);
    const res = await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:fd.get('email'),password:fd.get('password')})});
    const j = await res.json();
    if(!res.ok){ m.textContent=j.error; return; }
    location.href='/';
  };
}

function bindRegister(){
  renderNav();
  const f = document.getElementById('regForm');
  const m = document.getElementById('msg');
  f.onsubmit = async e=>{
    e.preventDefault();
    const fd = new FormData(f);
    const res = await fetch('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:fd.get('email'),password:fd.get('password')})});
    const j = await res.json();
    if(!res.ok){ m.textContent=j.error; return; }
    m.textContent='注册成功，去登录';
    setTimeout(()=>location.href='/login.html',800);
  };
}

document.addEventListener('DOMContentLoaded', renderNav);
