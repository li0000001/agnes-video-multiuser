import type { PagesFunction } from '@cloudflare/workers-types';

/**
 * R2 对象流式输出助手。
 *
 * 说明：Workers R2 API 不提供 getSignedUrl（预签名已移除/不可用），
 * 因此统一通过 get() 把对象流直接回源给客户端，支持 HTTP Range（视频拖动进度条）。
 *
 * opt.disposition  — Content-Disposition，如 `attachment; filename="x.mp4"`
 * opt.fallbackCt   — 存储元数据缺少/非法 content-type 时的兜底类型
 */
export async function serveR2(
  env: { R2: any },
  key: string,
  request: Request,
  opt: { disposition?: string; fallbackCt?: string } = {}
): Promise<Response> {
  const rangeHdr = request.headers.get('range');
  const obj = rangeHdr
    ? await env.R2.get(key, { range: new Headers({ range: rangeHdr }) })
    : await env.R2.get(key);
  if (!obj || obj.body === undefined || obj.body === null) {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers();
  try { obj.writeHttpMetadata(headers); } catch (e) { /* 忽略元数据写入失败 */ }

  const rawCt = headers.get('content-type') || '';
  if (!/^(image|video|audio|font)\//i.test(rawCt) && !/^application\//i.test(rawCt)) {
    headers.set('content-type', opt.fallbackCt || 'application/octet-stream');
  } else if (opt.fallbackCt && !/^(image|video|audio)\//i.test(rawCt)) {
    // 存的是 octet-stream 之类的模糊类型时，按用途强制为明确类型，保证 <img>/<video> 渲染
    headers.set('content-type', opt.fallbackCt);
  }
  headers.set('x-content-type-options', 'nosniff');
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'private, max-age=3600');
  if (opt.disposition) headers.set('content-disposition', opt.disposition);

  const fullSize = Number(obj.size || 0);
  let status = 200;
  const r = obj.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (r && rangeHdr) {
    let start = 0;
    let len = 0;
    if (typeof r.suffix === 'number') {
      len = r.suffix;
      start = Math.max(0, fullSize - len);
    } else {
      start = Number(r.offset || 0);
      len = Number(r.length || 0);
    }
    if (len > 0) {
      status = 206;
      const end = start + len - 1;
      headers.set('content-range', `bytes ${start}-${end}/${fullSize}`);
      headers.set('content-length', String(len));
    }
  } else if (fullSize) {
    headers.set('content-length', String(fullSize));
  }

  return new Response(obj.body as ReadableStream, { status, headers });
}

/** 各扩展名的兜底 content-type */
export const CT_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', avif: 'image/avif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime'
};
