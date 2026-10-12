import type { PagesFunction } from '@cloudflare/workers-types';
import { getCurrentUser, requireAuth } from '../../../../lib/auth';

const IMG_CT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif'
};

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  const user = await getCurrentUser(request, env);
  const err = requireAuth(user);
  if (err) return err;
  const id = Number(params.id);
  const t = await env.DB.prepare('SELECT user_id,status,r2_key,video_deleted_at FROM tasks WHERE id=?').bind(id).first();
  if (!t || t.user_id !== user.id || t.status !== 'done' || !t.r2_key || t.video_deleted_at) {
    return new Response('Not found or not ready', { status: 404 });
  }

  const ext = (String(t.r2_key).split('.').pop() || '').toLowerCase();
  // 图像：直接以明确的 image/* Content-Type 内联输出（不 302 跳转，保证 <img> 预览稳定）
  if (IMG_CT[ext]) {
    const obj = await env.R2.get(t.r2_key);
    if (!obj) return new Response('Not found', { status: 404 });
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

  // 视频等大文件：302 跳预签名地址（避免大流量过 Workers）
  const expires = Number(env.PRESIGN_EXPIRES || 900);
  const url = await env.R2.getSignedUrl(t.r2_key, { expiresIn: expires, method: 'GET' });
  return Response.redirect(url, 302);
};
