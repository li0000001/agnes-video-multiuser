/**
 * Agnes API 调用助手
 * - 未设置 RELAY_URL：直连 apihub（出口 = Cloudflare 共享 IP，可能撞 1015 限流）
 * - 设置 RELAY_URL：经自建中继转发（如 Render），出口变为中继的 IP，绕开 CF 共享 IP 限流
 * - 中继不可用时自动回落直连（可用性优先）
 * 返回标准 Response，调用方无需感知中继存在；retry-after / cf-ray 等关键响应头会透传。
 */
const ORIGIN = 'https://apihub.agnes-ai.com';

export async function agnesFetch(env: any, path: string, init: RequestInit = {}): Promise<Response> {
  const url = ORIGIN + path;
  const relay = String(env.RELAY_URL || '').replace(/\/+$/, '');
  if (!relay) return fetch(url, init);

  try {
    const r = await fetch(relay + '/fwd', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-relay-secret': String(env.RELAY_SECRET || '') },
      body: JSON.stringify({
        url,
        method: init.method || 'GET',
        headers: (init.headers as any) || {},
        body: init.body ? String(init.body) : null
      }),
      // 图像同步生成最长约 6 分钟，中继往返给足 450 秒
      signal: AbortSignal.timeout(450_000)
    });
    if (!r.ok) return r; // 中继自身故障（403 密钥不符 / 502 上游异常等）→ 原样透传，由上层错误处理展示
    const j: any = await r.json().catch(() => null);
    if (typeof j?.status !== 'number') {
      return new Response(
        JSON.stringify({ detail: '中继响应异常: ' + JSON.stringify(j || {}).slice(0, 200) }),
        { status: 502, headers: { 'content-type': 'application/json' } }
      );
    }
    const h: Record<string, string> = { 'content-type': String(j.headers?.['content-type'] || 'application/json') };
    for (const k of ['retry-after', 'cf-ray', 'x-request-id']) {
      if (j.headers?.[k]) h[k] = String(j.headers[k]);
    }
    return new Response(String(j.body ?? ''), { status: j.status, headers: h });
  } catch {
    // 中继超时/不可达 → 回落直连（保留 1015 风险，但保证任务不因中继故障卡死）
    return fetch(url, init);
  }
}
