import type { PagesFunction } from '@cloudflare/workers-types';
import { requireAdmin } from '../../../lib/admin';
import { json } from '../../../lib/auth';

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.res;
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const role = url.searchParams.get('role');
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 100);
  const offset = Number(url.searchParams.get('offset') || 0);
  let sql = 'SELECT id,email,name,role,status,created_at,last_login_at FROM users WHERE 1=1';
  const binds: any[] = [];
  if (q) { sql += ' AND lower(email) LIKE ?'; binds.push('%' + q + '%'); }
  if (role) { sql += ' AND role=?'; binds.push(role); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  binds.push(limit, offset);
  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return json({ users: rows.results || [] });
};
