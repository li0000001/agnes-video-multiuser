import type { PagesFunction } from '@cloudflare/workers-types';
import { requireAdmin } from '../../../../lib/admin';
import { json } from '../../../../lib/auth';

export const onRequestPost: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.res;
  const admin = auth.user;
  const id = Number(params.id);
  const body = await request.json().catch(() => ({ alsoDeleteFile: false }));
  const also = !!body.alsoDeleteFile;
  const t = await env.DB.prepare('SELECT id,r2_key,video_deleted_at,deleted_at FROM tasks WHERE id=?').bind(id).first();
  if (!t) return json({ error: '任务不存在' }, 404);
  if (t.deleted_at) return json({ error: '任务已被删除' }, 400);
  if (also && t.r2_key && !t.video_deleted_at) {
    try { await env.R2.delete(t.r2_key); } catch { }
    await env.DB.prepare("UPDATE tasks SET video_deleted_at=datetime('now') WHERE id=?").bind(id).run();
  }
  await env.DB.prepare("UPDATE tasks SET deleted_at=datetime('now'), deleted_by=? WHERE id=?").bind(admin.id, id).run();
  return json({ ok: true });
};
