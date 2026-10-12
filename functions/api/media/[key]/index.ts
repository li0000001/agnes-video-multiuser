import type { PagesFunction } from '@cloudflare/workers-types';
import { fromB64url } from '../../../lib/utils';

/**
 * 公开素材分发端点（无需登录）：
 * 供 Agnes 生成服务抓取用户上传的首帧/尾帧/参考图。
 * key 为不可猜的 base64url 编码，302 跳转到短时效签名 URL。
 */
export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  let step = 'start';
  try {
    step = 'b64';
    let key = '';
    try {
      key = fromB64url(String(params.key || ''));
    } catch (e) {
      return new Response('Not found', { status: 404 });
    }
    step = 'prefix';
    if (!key.startsWith('media/')) return new Response('Not found', { status: 404 });
    step = 'head';
    const head = await env.R2.head(key);
    if (!head) return new Response('Not found', { status: 404 });
    step = 'presign';
    const expires = Number(env.PRESIGN_EXPIRES || 900);
    const url = await env.R2.getSignedUrl(key, { expiresIn: expires, method: 'GET' });
    step = 'redirect';
    return Response.redirect(url, 302);
  } catch (e) {
    return new Response(JSON.stringify({ diag: true, step, err: String((e && (e as Error).stack) || e) }), {
      status: 500, headers: { 'content-type': 'application/json' }
    });
  }
};
