import type { PagesFunction } from '@cloudflare/workers-types';
import { agnesFetch } from '../../../lib/agnes';

/** 临时诊断端点：p=img|chat 直连测试 CF 出口限流；p=relay 走中继链路。固定目标/固定假 Key，不可参数化 */
export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const u = new URL(request.url);
  if (u.searchParams.get('k') !== 'diag-1015') return new Response('not found', { status: 404 });

  // ---- 中继链路测试：平台 → RELAY_URL → apihub ----
  if (u.searchParams.get('p') === 'relay') {
    const t0 = Date.now();
    try {
      const res = await agnesFetch(env, '/v1/models', { headers: {} });
      const text = await res.text();
      return Response.json({
        via: 'relay',
        relayUrlSet: !!env.RELAY_URL,
        secretSetOnPages: !!env.RELAY_SECRET,
        status: res.status,
        ms: Date.now() - t0,
        retryAfter: res.headers.get('retry-after'),
        body: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
      });
    } catch (e: any) {
      return Response.json({ via: 'relay', error: String(e?.message || e), ms: Date.now() - t0 }, { status: 502 });
    }
  }

  const p = u.searchParams.get('p') === 'chat' ? 'chat' : 'img';
  const t0 = Date.now();
  try {
    const res = await fetch(p === 'chat' ? 'https://apihub.agnes-ai.com/v1/chat/completions' : 'https://apihub.agnes-ai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer sk-probe-diag-000000', 'Content-Type': 'application/json' },
      body: JSON.stringify(p === 'chat'
        ? { model: 'agnes-2.5-flash', messages: [{ role: 'user', content: 'hi' }] }
        : { model: 'agnes-image-2.5-flash', prompt: 'probe', size: '1K' })
    });
    const text = await res.text();
    return Response.json({
      status: res.status,
      ms: Date.now() - t0,
      cfRay: res.headers.get('cf-ray'),
      server: res.headers.get('server'),
      retryAfter: res.headers.get('retry-after'),
      body: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
    });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e), ms: Date.now() - t0 }, { status: 502 });
  }
};
