import type { PagesFunction } from '@cloudflare/workers-types';
import { requireAdmin } from '../../../lib/admin';
import { json } from '../../../lib/auth';

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.res;
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const userId = url.searchParams.get('user_id');
  const model = url.searchParams.get('model');
  const q = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 100);
  const offset = Number(url.searchParams.get('offset') || 0);
  let sql = `SELECT t.id,t.user_id,u.email,t.video_id,t.model,t.mode,t.status,t.key_id,t.r2_key,t.poll_count,t.created_at,t.finished_at,t.last_poll_at,t.video_deleted_at,t.deleted_at
             FROM tasks t LEFT JOIN users u ON u.id=t.user_id WHERE 1=1`;
  const binds: any[] = [];
  if (status) { sql += ' AND t.status=?'; binds.push(status); }
  if (userId) { sql += ' AND t.user_id=?'; binds.push(Number(userId)); }
  if (model) { sql += ' AND t.model=?'; binds.push(model); }
  if (q) {
    sql += ' AND (t.video_id LIKE ? OR lower(u.email) LIKE ?)';
    binds.push('%' + q + '%', '%' + q.toLowerCase() + '%');
  }
  sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
  binds.push(limit, offset);
  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return json({ tasks: rows.results || [] });
};
