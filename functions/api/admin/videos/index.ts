import type { PagesFunction } from '@cloudflare/workers-types';
import { requireAdmin } from '../../../lib/admin';
import { json } from '../../../lib/auth';

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.res;
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const userId = url.searchParams.get('user_id');
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 100);
  const offset = Number(url.searchParams.get('offset') || 0);
  let sql = `SELECT t.id,t.user_id,u.email,t.video_id,t.model,t.mode,t.r2_key,t.created_at,t.finished_at
             FROM tasks t LEFT JOIN users u ON u.id=t.user_id
             WHERE t.status='done' AND t.video_deleted_at IS NULL AND t.deleted_at IS NULL AND t.r2_key IS NOT NULL`;
  const binds: any[] = [];
  if (userId) { sql += ' AND t.user_id=?'; binds.push(Number(userId)); }
  if (q) {
    sql += ' AND (lower(u.email) LIKE ? OR t.video_id LIKE ?)';
    binds.push('%' + q.toLowerCase() + '%', '%' + q + '%');
  }
  sql += ' ORDER BY t.finished_at DESC LIMIT ? OFFSET ?';
  binds.push(limit, offset);
  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return json({ videos: rows.results || [] });
};
