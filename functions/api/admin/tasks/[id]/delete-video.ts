import type { PagesFunction } from '@cloudflare/workers-types';
import { requireAdmin } from '../../../../lib/admin';
import { json } from '../../../../lib/auth';

export const onRequestPost: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.res;
  const admin = auth.user;
  const id = Number(params.id);
  const t = await env.DB.prepare('SELECT id,status,r2_key,video_deleted_at FROM tasks WHERE id=?').bind(id).first();
  if (!t) return json({ error: '任务不存在' }, 404);
  if (t.status !== 'done') return json({ error: '仅能删除已完成状态的视频' }, 400);
  if (!t.r2_key) return json({ error: '该任务暂无 R2 视频文件' }, 400);
  if (t.video_deleted_at) return json({ error: '视频文件已被删除' }, 400);
  try { await env.R2.delete(t.r2_key); } catch (e) { }
  await env.DB.prepare("UPDATE tasks SET video_deleted_at=datetime('now'), deleted_by=? WHERE id=?").bind(admin.id, id).run();
  return json({ ok: true });
};
