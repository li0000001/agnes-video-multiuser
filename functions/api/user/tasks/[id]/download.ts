import type { PagesFunction } from '@cloudflare/workers-types';
import { getCurrentUser, requireAuth } from '../../../../lib/auth';

const SAFE_EXT = ['mp4', 'webm', 'mov', 'jpg', 'png', 'webp', 'gif'];

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  const user = await getCurrentUser(request, env);
  const err = requireAuth(user);
  if (err) return err;
  const id = Number(params.id);
  const t = await env.DB.prepare('SELECT user_id,status,r2_key,video_deleted_at,mode FROM tasks WHERE id=?').bind(id).first();
  if (!t || t.user_id !== user.id || t.status !== 'done' || !t.r2_key || t.video_deleted_at) {
    return new Response('Not found or not ready', { status: 404 });
  }
  const rawExt = String(t.r2_key).split('.').pop() || '';
  const ext = SAFE_EXT.includes(rawExt.toLowerCase()) ? rawExt.toLowerCase() : 'mp4';
  const kind = t.mode === 'image' ? 'image' : 'video';
  const expires = Number(env.PRESIGN_EXPIRES || 900);
  const fname = `agnes-${kind}-${id}.${ext}`;
  const url = await env.R2.getSignedUrl(t.r2_key, {
    expiresIn: expires,
    method: 'GET',
    queryParams: { 'response-content-disposition': `attachment; filename="${fname}"` }
  });
  return Response.redirect(url, 302);
};
