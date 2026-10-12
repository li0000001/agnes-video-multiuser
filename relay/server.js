/**
 * Agnes API 出口中继（Render 免费层部署用）
 * 职责：把 Cloudflare Pages 的调用转发到 apihub.agnes-ai.com，
 *      让出口 IP 变成 Render（AWS），绕开 Cloudflare 共享 IP 的 1015 限流。
 * 设计：无状态、零依赖（仅 Node 内置模块）、不落任何密钥（Key 由调用方随请求传入）。
 *
 * 端点：
 *   GET  /health        健康检查（可被 cron-job.org 每 10 分钟 ping，防止实例休眠）
 *   POST /fwd           转发调用，需请求头 x-relay-secret = 环境变量 RELAY_SECRET
 *                       body: { url, method, headers, body }
 *                       返回: { status, headers, body }
 *
 * 环境变量：
 *   PORT          监听端口（Render 自动注入）
 *   RELAY_SECRET  共享密钥（与 Cloudflare Pages 环境变量一致，必填否则拒绝一切转发）
 *
 * 安全约束：仅允许转发到 https://apihub.agnes-ai.com/*，防止被当作开放代理滥用。
 */
'use strict';
const http = require('http');
const https = require('https');

const PORT = Number(process.env.PORT || 8080);
const SECRET = String(process.env.RELAY_SECRET || '');
const ALLOWED_ORIGIN = 'https://apihub.agnes-ai.com';
const MAX_REQ_BODY = 2 * 1024 * 1024;   // 转发请求体上限 2MB
const MAX_RES_BODY = 8 * 1024 * 1024;   // 转发响应体上限 8MB

function json(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

function collect(req, limit, cb) {
  let raw = '';
  let size = 0;
  let aborted = false;
  req.on('data', (c) => {
    if (aborted) return;
    size += c.length;
    if (size > limit) { aborted = true; cb(new Error('body too large'), null); return; }
    raw += c;
  });
  req.on('end', () => { if (!aborted) cb(null, raw); });
  req.on('error', (e) => { if (!aborted) cb(e, null); });
}

function forward(target, method, headers, bodyStr, cb) {
  let u;
  try { u = new URL(target); } catch (e) { cb(e, null); return; }
  if (u.origin !== ALLOWED_ORIGIN) { cb(new Error('origin not allowed')); return; }

  const outHeaders = {};
  // 大小写不敏感地归一化请求头（调用方可能传 Authorization / AUTHORIZATION / authorization）
  const inH = {};
  for (const k of Object.keys(headers || {})) inH[String(k).toLowerCase()] = headers[k];
  // 只透传必要请求头，避免注入
  for (const k of ['authorization', 'content-type', 'accept']) {
    if (inH[k]) outHeaders[k] = String(inH[k]).slice(0, 4096);
  }
  if (bodyStr) outHeaders['content-length'] = Buffer.byteLength(bodyStr);

  const req2 = https.request(u, { method, headers: outHeaders }, (resp) => {
    const chunks = [];
    let size = 0;
    resp.on('data', (c) => {
      size += c.length;
      if (size <= MAX_RES_BODY) chunks.push(c);
    });
    resp.on('end', () => {
      const keep = {};
      for (const k of ['content-type', 'retry-after', 'cf-ray', 'x-request-id']) {
        if (resp.headers[k]) keep[k] = String(resp.headers[k]);
      }
      cb(null, { status: resp.statusCode || 502, headers: keep, body: Buffer.concat(chunks).toString('utf8').slice(0, MAX_RES_BODY) });
    });
  });
  req2.on('error', (e) => cb(e, null));
  if (bodyStr) req2.write(bodyStr);
  req2.end();
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    json(res, 200, { ok: true, service: 'agnes-relay', ts: Date.now() });
    return;
  }

  if (req.method === 'POST' && req.url === '/fwd') {
    if (!SECRET) { json(res, 500, { error: 'RELAY_SECRET 未配置' }); return; }
    if (String(req.headers['x-relay-secret'] || '') !== SECRET) { json(res, 403, { error: 'forbidden' }); return; }
    collect(req, MAX_REQ_BODY, (err, raw) => {
      if (err) { json(res, 413, { error: err.message }); return; }
      let j;
      try { j = JSON.parse(raw || '{}'); } catch (e) { json(res, 400, { error: 'invalid json' }); return; }
      const target = String(j.url || '');
      if (!target.startsWith(ALLOWED_ORIGIN + '/')) { json(res, 400, { error: 'url not allowed' }); return; }
      const method = String(j.method || 'GET').toUpperCase();
      if (!['GET', 'POST', 'PUT', 'DELETE', 'HEAD'].includes(method)) { json(res, 400, { error: 'method not allowed' }); return; }
      const bodyStr = j.body ? String(j.body) : null;
      forward(target, method, j.headers || {}, bodyStr, (e, out) => {
        if (e) { json(res, 502, { error: 'upstream: ' + e.message }); return; }
        json(res, 200, out);
      });
    });
    return;
  }

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log('agnes-relay listening on :' + PORT + (SECRET ? '' : ' [警告] RELAY_SECRET 未设置，将拒绝一切转发'));
});
