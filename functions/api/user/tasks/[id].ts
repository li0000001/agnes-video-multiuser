import type { PagesFunction } from '@cloudflare/workers-types';
import { getCurrentUser, requireAuth, json } from '../../../lib/auth';

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  const user = await getCurrentUser(request, env);
  const err = requireAuth(user);
  if (err) return err;
  const id = Number(params.id);
  const t = await env.DB.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').bind(id, user.id).first();
  if (!t) return json({ error: '任务不存在' }, 404);
  return json({ task: t });
};
