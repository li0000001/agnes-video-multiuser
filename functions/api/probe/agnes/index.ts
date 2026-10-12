import type { PagesFunction } from '@cloudflare/workers-types';

/** 临时诊断端点：验证 CF 出口 IP 访问 apihub 是否被限流。固定目标/固定假 Key，不可参数化，诊断完成后移除 */
export const onRequestGet: PagesFunction = async ({ request }) => {
  const u = new URL(request.url);
  if (u.searchParams.get('k') !== 'diag-1015') return new Response('not found', { status: 404 });
  const t0 = Date.now();
  try {
    const res = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer sk-probe-diag-000000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'agnes-image-2.5-flash', prompt: 'probe', size: '1K' })
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
