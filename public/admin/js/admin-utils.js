async function requireAdmin(){
  const res = await fetch('/api/auth/me');
  const j = await res.json();
  if(!j.loggedIn || j.user.role!=='admin'){
    alert('无权限访问管理员后台');
    location.href='/login.html';
    throw new Error('not admin');
  }
  return j.user;
}
document.addEventListener('DOMContentLoaded', ()=>{ try{ renderNav(); }catch{} });
