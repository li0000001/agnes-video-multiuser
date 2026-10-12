import type { PagesFunction } from '@cloudflare/workers-types';
import { decryptApiKey } from '../../lib/crypto';
import { IMAGE_MODEL } from '../../lib/utils';
import { agnesFetch } from '../../lib/agnes';

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const batch = Number(env.POLL_BATCH || 15);
  const zombieMin = Number(env.ZOMBIE_MINUTES || 40);

  // 1) 僵尸任务回收：processing 超过 ZOMBIE_MINUTES 未轮询 → 回到 pending 并释放密钥
  //    时间比较统一走 SQLite datetime()，避免 JS ISO 与 datetime('now') 格式不一致
  const zombies = await env.DB.prepare(`
    SELECT id,key_id,user_id FROM tasks
    WHERE status='processing' AND last_poll_at IS NOT NULL AND last_poll_at < datetime('now', ?)
  `).bind(`-${zombieMin} minutes`).all();
  for (const z of zombies.results || []) {
    await env.DB.prepare("UPDATE tasks SET status='pending', claimed_at=NULL, key_id=NULL, last_poll_at=datetime('now') WHERE id=?").bind(z.id).run();
    if (z.key_id) {
      await env.DB.prepare("UPDATE api_keys SET in_use=0, updated_at=datetime('now') WHERE id=? AND user_id=? AND in_use=1").bind(z.key_id, z.user_id).run();
    }
  }

  // 2) 认领 pending 任务
  //    - 创建时已绑定 key_id（key 已标记占用）→ 直接进入 processing
  //    - 无 key_id（僵尸回收后）→ 匹配一把空闲 key 再认领
  const pendings = await env.DB.prepare(`
    SELECT id,user_id,key_id FROM tasks WHERE status='pending' AND (mode IS NULL OR mode!='image') ORDER BY created_at ASC LIMIT ?
  `).bind(batch).all();
  for (const p of pendings.results || []) {
    if (p.key_id) {
      const upd = await env.DB.prepare(`
        UPDATE tasks SET status='processing', claimed_at=datetime('now'), last_poll_at=datetime('now')
        WHERE id=? AND user_id=? AND status='pending' AND key_id=?
      `).bind(p.id, p.user_id, p.key_id).run();
      if (upd.meta.changes > 0) {
        await env.DB.prepare("UPDATE api_keys SET in_use=1, last_used_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND user_id=? AND in_use=0").bind(p.key_id, p.user_id).run();
      }
      continue;
    }
    const k = await env.DB.prepare(`
      SELECT id,key_enc FROM api_keys
      WHERE user_id=? AND deleted_at IS NULL AND status='active' AND in_use=0
      ORDER BY last_used_at ASC LIMIT 1
    `).bind(p.user_id).first();
    if (!k) continue;
    const upd = await env.DB.prepare(`
      UPDATE tasks SET status='processing', key_id=?, claimed_at=datetime('now'), last_poll_at=datetime('now')
      WHERE id=? AND user_id=? AND status='pending' AND key_id IS NULL
    `).bind(k.id, p.id, p.user_id).run();
    if (upd.meta.changes > 0) {
      await env.DB.prepare("UPDATE api_keys SET in_use=1, last_used_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND user_id=? AND in_use=0").bind(k.id, p.user_id).run();
    }
  }

  // 3) 轮询 processing 任务（仅视频：图像任务的 video_id 是占位符，绝不能拿去查 Agnes）
  //    每个视频任务 60 秒内只查一次状态——页面高频驱动时也不会超出账号视频 RPM=1
  const procs = await env.DB.prepare(`
    SELECT id,user_id,video_id,model,key_id
    FROM tasks WHERE status='processing' AND (mode IS NULL OR mode!='image')
      AND (last_poll_at IS NULL OR last_poll_at < datetime('now','-60 seconds'))
    ORDER BY claimed_at ASC LIMIT ?
  `).bind(batch * 2).all();

  const jobs = (procs.results || []).map(async (t: any) => {
    try {
      if (!t.key_id || !t.video_id) return;
      if (String(t.video_id).startsWith('img_')) return;
      const keyRow = await env.DB.prepare('SELECT key_enc,user_id,status FROM api_keys WHERE id=?').bind(t.key_id).first();
      if (!keyRow || keyRow.user_id !== t.user_id || keyRow.status !== 'active') {
        await env.DB.prepare("UPDATE tasks SET status='pending', claimed_at=NULL, key_id=NULL WHERE id=?").bind(t.id).run();
        await env.DB.prepare("UPDATE api_keys SET in_use=0 WHERE id=?").bind(t.key_id).run();
        return;
      }
      const plain = await decryptApiKey(keyRow.key_enc, env.ENC_KEY);
      const q = new URLSearchParams({ video_id: t.video_id, model_name: t.model });
      const r = await agnesFetch(env, '/agnesapi?' + q.toString(), {
        headers: { 'Authorization': `Bearer ${plain}` }
      });
      const data = await r.json().catch(() => ({}));
      const st = String(data.status || '').toLowerCase();
      const fileUrl = data.video_url || data.url;

      if (st === 'completed' && fileUrl) {
        const v = await fetch(fileUrl);
        const now = new Date();
        const ext = (fileUrl.split('?')[0].match(/\.(webm|mov|mkv)(\?|$)/i) ? fileUrl.split('?')[0].match(/\.(webm|mov|mkv)(\?|$)/i)![1] : 'mp4').toLowerCase();
        const r2Key = `videos/user_${t.user_id}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/task_${t.id}_${Date.now()}.${ext}`;
        await env.R2.put(r2Key, v.body, { httpMetadata: { contentType: 'video/' + (ext === 'mov' ? 'quicktime' : ext) } });
        await env.DB.prepare("UPDATE tasks SET status='done', r2_key=?, finished_at=datetime('now'), last_poll_at=datetime('now') WHERE id=? AND user_id=?").bind(r2Key, t.id, t.user_id).run();
        await env.DB.prepare("UPDATE api_keys SET in_use=0, last_used_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND user_id=?").bind(t.key_id, t.user_id).run();
        return;
      }

      if (st === 'processing' || st === 'queued' || st === 'running') {
        await env.DB.prepare("UPDATE tasks SET last_poll_at=datetime('now'), poll_count=poll_count+1 WHERE id=? AND user_id=?").bind(t.id, t.user_id).run();
        return;
      }

      if (st === 'failed' || data.error) {
        const reason = data?.error?.message || data?.message || 'Agnes 返回 failed';
        await env.DB.prepare("UPDATE tasks SET status='failed', error_reason=?, last_poll_at=datetime('now') WHERE id=? AND user_id=?").bind(reason, t.id, t.user_id).run();
        await env.DB.prepare("UPDATE api_keys SET in_use=0, updated_at=datetime('now') WHERE id=? AND user_id=?").bind(t.key_id, t.user_id).run();
        return;
      }

      await env.DB.prepare("UPDATE tasks SET last_poll_at=datetime('now'), poll_count=poll_count+1 WHERE id=? AND user_id=?").bind(t.id, t.user_id).run();
    } catch (e: any) {
      try {
        await env.DB.prepare("UPDATE tasks SET last_poll_at=datetime('now') WHERE id=? AND user_id=?").bind(t.id, t.user_id).run();
      } catch { }
    }
  });

  await Promise.allSettled(jobs);

  // 4) 兜底：释放超过 30 分钟仍被占用、且没有任何 pending/processing 任务引用的密钥
  //    （覆盖图像同步生成中途异常等导致的 in_use 泄漏）
  await env.DB.prepare(`
    UPDATE api_keys SET in_use=0, updated_at=datetime('now')
    WHERE in_use=1 AND deleted_at IS NULL
      AND updated_at < datetime('now', '-30 minutes')
      AND id NOT IN (SELECT key_id FROM tasks WHERE status IN ('pending','processing') AND key_id IS NOT NULL)
  `).run();

  // 5) 图像任务队列：僵尸回收 + 每轮只处理 1 张（温和节奏，避免再次触发出口 IP 限流）
  const imgZombies = await env.DB.prepare(`
    SELECT id,key_id FROM tasks
    WHERE mode='image' AND status='processing' AND claimed_at IS NOT NULL AND claimed_at < datetime('now', '-10 minutes')
  `).all();
  for (const z of imgZombies.results || []) {
    await env.DB.prepare("UPDATE tasks SET status='pending', claimed_at=NULL, key_id=NULL, poll_count=poll_count+1 WHERE id=?").bind(z.id).run();
    if (z.key_id) {
      await env.DB.prepare("UPDATE api_keys SET in_use=0, updated_at=datetime('now') WHERE id=? AND in_use=1").bind(z.key_id).run();
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  // 全局单飞：同一时刻只允许 1 张图像生成（页面 ping 与 cron 并发时也只有一张在跑，避免突发流量触发 IP 限流）
  const imgBusy: any = await env.DB.prepare("SELECT COUNT(*) AS c FROM tasks WHERE mode='image' AND status='processing'").first();
  if (!imgBusy || Number(imgBusy.c) === 0) {
    const imgCands = await env.DB.prepare(`
      SELECT id,user_id,params_json,poll_count FROM tasks
      WHERE mode='image' AND status='pending' AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 5
    `).all();
    for (const c of imgCands.results || []) {
      let pj: any = {};
      try { pj = JSON.parse(c.params_json || '{}'); } catch { pj = {}; }
      const nra = Number(pj.nra || 0);
      if (nra && nra > nowSec) continue; // 限流退避窗口内，跳过
      const claim = await env.DB.prepare(`
        UPDATE tasks SET status='processing', claimed_at=datetime('now')
        WHERE id=? AND mode='image' AND status='pending' AND deleted_at IS NULL
      `).bind(c.id).run();
      if (!claim.meta.changes) continue;
      await runImageTask(env, { id: c.id, user_id: c.user_id, poll_count: Number(c.poll_count || 0) }, pj);
      break; // 每轮只处理 1 张
    }
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
};

/** 单张图像生成：429/5xx 退避重排，4xx 快速失败并给出可读原因，最多重试 IMG_MAX_TRY 次 */
const IMG_MAX_TRY = 24;
async function runImageTask(env: any, t: any, pj: any) {
  const fail = async (reason: string) => {
    await env.DB.prepare("UPDATE tasks SET status='failed', error_reason=?, finished_at=datetime('now'), claimed_at=NULL, key_id=NULL WHERE id=?")
      .bind(String(reason).slice(0, 500), t.id).run();
  };
  const requeue = async (waitSec: number, note: string) => {
    pj.nra = Math.floor(Date.now() / 1000) + waitSec;
    pj.last_msg = note;
    pj.attempts = Number(pj.attempts || 0) + 1;
    await env.DB.prepare(`
      UPDATE tasks SET status='pending', claimed_at=NULL, key_id=NULL, params_json=?, poll_count=poll_count+1
      WHERE id=? AND status='processing'
    `).bind(JSON.stringify(pj), t.id).run();
  };

  if (t.poll_count >= IMG_MAX_TRY) { await fail('多次自动重试仍失败：' + (pj.last_msg || '未知原因')); return; }

  const key: any = await env.DB.prepare(`
    SELECT id,key_enc FROM api_keys
    WHERE user_id=? AND deleted_at IS NULL AND status='active' AND in_use=0
    ORDER BY last_used_at ASC LIMIT 1
  `).bind(t.user_id).first();
  if (!key) { await requeue(120, '等待空闲 API Key'); return; }

  await env.DB.prepare('UPDATE api_keys SET in_use=1, last_used_at=datetime("now"), updated_at=datetime("now") WHERE id=? AND user_id=? AND in_use=0').bind(key.id, t.user_id).run();
  await env.DB.prepare('UPDATE tasks SET key_id=? WHERE id=? AND mode=?').bind(key.id, t.id, 'image').run();

  try {
    const plain = (await decryptApiKey(key.key_enc, env.ENC_KEY)).replace(/\s+/g, '');
    const payload: any = { model: IMAGE_MODEL, prompt: pj.prompt, size: pj.image_size || '1K', extra_body: { response_format: 'url' } };
    if (pj.ratio) payload.ratio = pj.ratio;

    const res = await agnesFetch(env, '/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${plain}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await res.text().catch(() => '');
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { /* 保留原文 */ }

    if (!res.ok) {
      const st = res.status;
      if (st === 429 || st >= 500) {
        const ra = Number(res.headers.get('retry-after') || 0);
        const wait = Math.min(Math.max(ra || 60, 60), 900);
        await requeue(wait, `HTTP ${st}（限流或服务异常），${wait} 秒后自动重试`);
        return;
      }
      let detail = '';
      try {
        const d = (typeof data === 'string') ? data : (data?.detail ?? data?.error?.message ?? data?.error ?? data?.message ?? data?.msg);
        detail = typeof d === 'string' ? d : d != null ? JSON.stringify(d).slice(0, 400) : '';
      } catch { /* ignore */ }
      if (!detail) detail = (text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
      if (!detail) detail = 'Agnes 返回错误但无详情';
      const hint = (st === 401 || st === 403) ? '（请到「密钥池」核对 API Key 是否有效）' : '';
      await fail(`${detail}${hint}（HTTP ${st}）`);
      return;
    }

    const remoteUrl = data?.data?.[0]?.url;
    if (!remoteUrl) { await requeue(60, 'Agnes 未返回图像地址，稍后重试'); return; }

    // 下载结果存入 R2（失败则保留 remote_url 作为回退播放地址）
    let r2Key = '';
    try {
      const imgRes = await fetch(remoteUrl);
      if (imgRes.ok && imgRes.body) {
        const ct = imgRes.headers.get('content-type') || 'image/png';
        const ext = ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('webp') ? 'webp' : 'png';
        const d = new Date();
        r2Key = `images/user_${t.user_id}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        await env.R2.put(r2Key, imgRes.body, { httpMetadata: { contentType: ct } });
      }
    } catch { /* 下载失败不阻塞任务完成 */ }

    pj.remote_url = remoteUrl;
    pj.nra = 0;
    delete pj.last_msg;
    await env.DB.prepare(`
      UPDATE tasks SET status='done', r2_key=?, params_json=?, finished_at=datetime('now'), claimed_at=NULL, error_reason=NULL
      WHERE id=? AND status='processing'
    `).bind(r2Key || null, JSON.stringify(pj), t.id).run();
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (t.poll_count + 1 >= IMG_MAX_TRY) await fail('图像生成失败：' + msg);
    else await requeue(60, '网络异常：' + msg);
  } finally {
    try {
      await env.DB.prepare("UPDATE api_keys SET in_use=0, updated_at=datetime('now') WHERE id=? AND in_use=1").bind(key.id).run();
    } catch { /* ignore */ }
  }
}
