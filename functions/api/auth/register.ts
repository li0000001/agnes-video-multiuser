import type { PagesFunction } from '@cloudflare/workers-types';
import { json } from '../../lib/auth';

async function hashPwd(pwd: string) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pwd), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const h = new Uint8Array(bits);
  const comb = new Uint8Array(salt.length + h.length);
  comb.set(salt, 0); comb.set(h, salt.length);
  let s = '';
  for (let i = 0; i < comb.length; i++) s += String.fromCharCode(comb[i]);
  return btoa(s);
}

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password || password.length < 6) return json({ error: '邮箱或密码格式不正确（密码至少6位）' }, 400);

  const exists = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
  if (exists) return json({ error: '该邮箱已注册' }, 400);

  const hash = await hashPwd(password);
  // 首个注册用户自动成为管理员（引导逻辑，便于 D1 控制台不可用时初始化）
  const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first() as { c: number } | null;
  const role = total && Number(total.c) === 0 ? 'admin' : 'user';
  const res = await env.DB.prepare('INSERT INTO users(email,password_hash,name,role,status,created_at,updated_at) VALUES(?,?,?,?,\'active\',datetime("now"),datetime("now"))').bind(email, hash, email.split('@')[0], role).run();
  return json({ ok: true, userId: res.meta.last_row_id, bootstrapAdmin: role === 'admin' });
};
