import type { PagesFunction } from '@cloudflare/workers-types';
import { fromB64url } from '../../../lib/utils';
import { serveR2, CT_BY_EXT } from '../../../lib/r2serve';

/**
 * 公开素材分发端点（无需登录）：
 * 供 Agnes 生成服务抓取用户上传的首帧/尾帧/参考图。
 * key 为不可猜的 base64url 编码，直接流式输出 R2 对象。
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
    step = 'serve';
    const ext = (key.split('.').pop() || '').toLowerCase();
    return await serveR2(env, key, request, { fallbackCt: CT_BY_EXT[ext] });
  } catch (e) {
    return new Response(JSON.stringify({ diag: true, step, err: String(e && (e as Error).message) || String(e) }), {
      status: 500, headers: { 'content-type': 'application/json' }
    });
  }
};
