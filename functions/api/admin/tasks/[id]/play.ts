import type { PagesFunction } from '@cloudflare/workers-types';
import { requireAdmin } from '../../../../lib/admin';

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.res.res || new Response('Unauthorized', { status: 401 });
  const id = Number(params.id);
  const t = await env.DB.prepare('SELECT status,r2_key,video_deleted_at FROM tasks WHERE id=?').bind(id).first();
  if (!t || t.status !== 'done' || !t.r2_key || t.video_deleted_at) return new Response('Not found', { status: 404 });
  const expires = Number(env.PRESIGN_EXPIRES || 900);
  const url = await env.R2.getSignedUrl(t.r2_key, { expiresIn: expires, method: 'GET' });
  return Response.redirect(url, 302);
};
