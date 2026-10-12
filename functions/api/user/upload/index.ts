import type { PagesFunction } from '@cloudflare/workers-types';
import { getCurrentUser, requireAuth, json } from '../../../lib/auth';
import { b64url } from '../../../lib/utils';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_BYTES = 10 * 1024 * 1024;

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const user = await getCurrentUser(request, env);
  const err = requireAuth(user);
  if (err) return err;

  const body = await request.json().catch(() => ({}));
  const dataUrl = String(body.data || '');
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m || !ALLOWED.includes(m[1])) return json({ error: '仅支持 PNG / JPG / WebP / GIF 图片' }, 400);

  const mime = m[1];
  const b64 = m[2].replace(/\s+/g, '');
  if (Math.ceil(b64.length * 0.75) > MAX_BYTES) return json({ error: '图片不能超过 10MB' }, 400);

  let bin: Uint8Array;
  try {
    const raw = atob(b64);
    bin = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
  } catch (e) {
    return json({ error: '图片数据解码失败' }, 400);
  }

  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
  const d = new Date();
  const key = `media/user_${user.id}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await env.R2.put(key, bin, { httpMetadata: { contentType: mime } });

  // url 为公开可访问的分发地址（302 到临时签名 URL），供 Agnes 服务端抓取
  return json({ ok: true, key, url: '/api/media/' + b64url(key), mime, size: bin.length });
};
