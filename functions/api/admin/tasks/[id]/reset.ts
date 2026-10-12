import type { PagesFunction } from '@cloudflare/workers-types';
import { requireAdmin } from '../../../../lib/admin';
import { json } from '../../../../lib/auth';

export const onRequestPost: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.res;
  const id = Number(params.id);
  const t = await env.DB.prepare('SELECT id,key_id FROM tasks WHERE id=? AND deleted_at IS NULL').bind(id).first();
  if (!t) return json({ error: '任务不存在或已删除' }, 404);
  if (t.key_id) {
    await env.DB.prepare("UPDATE api_keys SET in_use=0, updated_at=datetime('now') WHERE id=? AND in_use=1").bind(t.key_id).run();
  }
  await env.DB.prepare(`
    UPDATE tasks SET status='pending', key_id=NULL, claimed_at=NULL, last_poll_at=NULL, poll_count=0, error_reason=NULL, finished_at=NULL
    WHERE id=?
  `).bind(id).run();
  return json({ ok: true });
};
