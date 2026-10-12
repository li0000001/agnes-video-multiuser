export async function getCurrentUser(request: Request, env: any) {
  const name = env.SESSION_NAME || 'agnes_session';
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(name + '=([^;]+)'));
  if (!m) return null;
  const sid = decodeURIComponent(m[1]);
  if (!sid) return null;

  const now = new Date().toISOString();
  const sess = await env.DB.prepare('SELECT user_id, expires_at FROM sessions WHERE id=?').bind(sid).first();
  if (!sess) return null;
  if (sess.expires_at < now) {
    await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(sid).run();
    return null;
  }

  await env.DB.prepare('UPDATE sessions SET last_seen_at=datetime("now") WHERE id=?').bind(sid).run();

  const user = await env.DB.prepare('SELECT id,email,name,role,status FROM users WHERE id=?').bind(sess.user_id).first();
  if (!user || user.status !== 'active') return null;
  return user;
}

export function requireAuth(user: any) {
  if (!user) return json({ error: '未登录或会话已过期' }, 401);
  return null;
}

export function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export function setSessionCookie(res: Response, name: string, sid: string, maxAgeSec: number) {
  res.headers.append('Set-Cookie', `${name}=${encodeURIComponent(sid)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`);
  return res;
}

export function clearSessionCookie(res: Response, name: string) {
  res.headers.append('Set-Cookie', `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return res;
}
