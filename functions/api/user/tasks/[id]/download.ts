import type { PagesFunction } from '@cloudflare/workers-types';
import { getCurrentUser, requireAuth } from '../../../../lib/auth';

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  const user = await getCurrentUser(request, env);
  const err = requireAuth(user);
  if (err) return err.res || new Response('Unauthorized', { status: 401 });
  const id = Number(params.id);
  const t = await env.DB.prepare('SELECT user_id,status,r2_key,video_deleted_at FROM tasks WHERE id=?').bind(id).first();
  if (!t || t.user_id !== user.id || t.status !== 'done' || !t.r2_key || t.video_deleted_at) {
    return new Response('Not found or not ready', { status: 404 });
  }
  const expires = Number(env.PRESIGN_EXPIRES || 900);
  const fname = `agnes-video-${id}.mp4`;
  const url = await env.R2.getSignedUrl(t.r2_key, {
    expiresIn: expires,
    method: 'GET',
    queryParams: { 'response-content-disposition': `attachment; filename="${fname}"` }
  });
  return Response.redirect(url, 302);
};
