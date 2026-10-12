import type { PagesFunction } from '@cloudflare/workers-types';
import { getCurrentUser, requireAuth } from '../../../../lib/auth';

const IMG_CT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif'
};

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  let step = 'start';
  try {
    step = 'auth';
    const user = await getCurrentUser(request, env);
    step = 'requireAuth';
    const err = requireAuth(user);
    if (err) return err;
    step = 'db';
    const id = Number(params.id);
    const t = await env.DB.prepare('SELECT user_id,status,r2_key,video_deleted_at FROM tasks WHERE id=?').bind(id).first();
    step = 'guard';
    if (!t || t.user_id !== user.id || t.status !== 'done' || !t.r2_key || t.video_deleted_at) {
      return new Response('Not found or not ready', { status: 404 });
    }
    step = 'ext';
    const ext = (String(t.r2_key).split('.').pop() || '').toLowerCase();
    if (IMG_CT[ext]) {
      step = 'r2.get';
      const obj = await env.R2.get(t.r2_key);
      if (!obj) return new Response('Not found', { status: 404 });
      step = 'image-headers';
      const raw = obj.httpMetadata?.contentType || '';
      const ct = /^image\//i.test(raw) ? raw : IMG_CT[ext];
      return new Response(obj.body, {
        headers: {
          'content-type': ct,
          'content-disposition': `inline; filename="image.${ext}"`,
          'cache-control': 'private, max-age=3600',
          'x-content-type-options': 'nosniff'
        }
      });
    }
    step = 'presign';
    const expires = Number(env.PRESIGN_EXPIRES || 900);
    const url = await env.R2.getSignedUrl(t.r2_key, { expiresIn: expires, method: 'GET' });
    step = 'redirect';
    return Response.redirect(url, 302);
  } catch (e) {
    return new Response(JSON.stringify({ diag: true, step, err: String((e && (e as Error).stack) || e) }), {
      status: 500, headers: { 'content-type': 'application/json' }
    });
  }
};
