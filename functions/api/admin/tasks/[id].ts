import type { PagesFunction } from '@cloudflare/workers-types';
import { requireAdmin } from '../../../lib/admin';
import { json } from '../../../lib/auth';

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.res;
  const id = Number(params.id);
  const t = await env.DB.prepare(`
    SELECT t.*, u.email FROM tasks t LEFT JOIN users u ON u.id=t.user_id WHERE t.id=?
  `).bind(id).first();
  if (!t) return json({ error: '任务不存在' }, 404);
  return json({ task: t });
};
