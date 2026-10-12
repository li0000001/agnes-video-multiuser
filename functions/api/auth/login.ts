import type { PagesFunction } from '@cloudflare/workers-types';
import { json, setSessionCookie } from '../../lib/auth';

async function verifyPwd(hashB64: string, pwd: string) {
  try {
    const bin = atob(hashB64);
    const comb = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) comb[i] = bin.charCodeAt(i);
    const salt = comb.slice(0, 16);
    const h = comb.slice(16);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(pwd), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
    const hv = new Uint8Array(bits);
    if (hv.length !== h.length) return false;
    let ok = 1;
    for (let i = 0; i < h.length; i++) if (hv[i] !== h[i]) ok = 0;
    return ok === 1;
  } catch (e) {
    return false;
  }
}

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return json({ error: '邮箱和密码不能为空' }, 400);

  const user = await env.DB.prepare('SELECT id,password_hash,status FROM users WHERE email=?').bind(email).first();
  if (!user || user.status !== 'active') return json({ error: '邮箱或密码错误' }, 401);

  const ok = await verifyPwd(user.password_hash, password);
  if (!ok) return json({ error: '邮箱或密码错误' }, 401);

  const sid = crypto.randomUUID();
  const exp = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,datetime("now"))').bind(sid, user.id, exp).run();
  await env.DB.prepare('UPDATE users SET last_login_at=datetime("now"), updated_at=datetime("now") WHERE id=?').bind(user.id).run();

  const res = json({ ok: true });
  setSessionCookie(res, env.SESSION_NAME || 'agnes_session', sid, 30 * 24 * 3600);
  return res;
};
