import type { PagesFunction } from '@cloudflare/workers-types';
import { decryptApiKey } from '../../lib/crypto';

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const batch = Number(env.POLL_BATCH || 15);
  const zombieMin = Number(env.ZOMBIE_MINUTES || 40);

  const zombieCut = new Date(Date.now() - zombieMin * 60 * 1000).toISOString();
  const zombies = await env.DB.prepare(`
    SELECT id,key_id,user_id FROM tasks
    WHERE status='processing' AND last_poll_at IS NOT NULL AND last_poll_at < ?
  `).bind(zombieCut).all();
  for (const z of zombies.results || []) {
    await env.DB.prepare("UPDATE tasks SET status='pending', claimed_at=NULL, key_id=NULL, last_poll_at=datetime('now') WHERE id=?").bind(z.id).run();
    if (z.key_id) {
      await env.DB.prepare("UPDATE api_keys SET in_use=0, updated_at=datetime('now') WHERE id=? AND user_id=? AND in_use=1").bind(z.key_id, z.user_id).run();
    }
  }

  const pendings = await env.DB.prepare(`
    SELECT id,user_id,video_id,model
    FROM tasks WHERE status='pending' ORDER BY created_at ASC LIMIT ?
  `).bind(batch).all();
  for (const p of pendings.results || []) {
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

  const procs = await env.DB.prepare(`
    SELECT id,user_id,video_id,model,key_id
    FROM tasks WHERE status='processing' ORDER BY claimed_at ASC LIMIT ?
  `).bind(batch * 2).all();

  const jobs = (procs.results || []).map(async (t: any) => {
    try {
      if (!t.key_id) return;
      const keyRow = await env.DB.prepare('SELECT key_enc,user_id,status FROM api_keys WHERE id=?').bind(t.key_id).first();
      if (!keyRow || keyRow.user_id !== t.user_id || keyRow.status !== 'active') {
        await env.DB.prepare("UPDATE tasks SET status='pending', claimed_at=NULL, key_id=NULL WHERE id=?").bind(t.id).run();
        await env.DB.prepare("UPDATE api_keys SET in_use=0 WHERE id=?").bind(t.key_id).run();
        return;
      }
      const plain = await decryptApiKey(keyRow.key_enc, env.ENC_KEY);
      const q = new URLSearchParams({ video_id: t.video_id, model_name: t.model });
      const r = await fetch('https://apihub.agnes-ai.com/agnesapi?' + q.toString(), {
        headers: { 'Authorization': `Bearer ${plain}` }
      });
      const data = await r.json().catch(() => ({}));
      const st = String(data.status || '').toLowerCase();

      if (st === 'completed' && data.video_url) {
        const v = await fetch(data.video_url);
        const now = new Date();
        const r2Key = `videos/user_${t.user_id}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/task_${t.id}_${Date.now()}.mp4`;
        await env.R2.put(r2Key, v.body, { httpMetadata: { contentType: 'video/mp4' } });
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
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
};
