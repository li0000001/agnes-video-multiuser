import type { PagesFunction } from '@cloudflare/workers-types';
import { getCurrentUser, requireAuth, json } from '../../../lib/auth';
import { chooseModel } from '../../../lib/utils';

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const user = await getCurrentUser(request, env);
  const err = requireAuth(user);
  if (err) return err;
  const rows = await env.DB.prepare(`
    SELECT id,video_id,model,mode,status,poll_count,created_at,finished_at,r2_key,video_deleted_at
    FROM tasks WHERE user_id=? ORDER BY created_at DESC LIMIT 50
  `).bind(user.id).all();
  return json({ tasks: rows.results || [] });
};

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const user = await getCurrentUser(request, env);
  const err = requireAuth(user);
  if (err) return err;
  const body = await request.json().catch(() => ({}));
  const model = chooseModel(body);

  const key = await env.DB.prepare(`
    SELECT id,key_enc FROM api_keys
    WHERE user_id=? AND deleted_at IS NULL AND status='active' AND in_use=0
    ORDER BY last_used_at ASC LIMIT 1
  `).bind(user.id).first();
  if (!key) return json({ error: '当前没有可用的空闲 API Key' }, 400);
  if (!env.ENC_KEY) return json({ error: '未配置 ENC_KEY' }, 500);

  const { decryptApiKey } = await import('../../../lib/crypto');
  const plain = await decryptApiKey(key.key_enc, env.ENC_KEY);

  const agnesBody = { ...body, model };
  const agRes = await fetch('https://apihub.agnes-ai.com/v1/videos', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${plain}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(agnesBody)
  });
  const agData = await agRes.json().catch(() => ({}));
  if (!agRes.ok) {
    return json({ error: agData?.error?.message || agData?.message || 'Agnes 创建任务失败' }, agRes.status);
  }
  const videoId = agData.video_id || agData.id || agData.task_id;
  if (!videoId) return json({ error: 'Agnes 返回缺少 video_id' }, 500);

  const ins = await env.DB.prepare(`
    INSERT INTO tasks(user_id,video_id,model,mode,status,params_json,key_id,poll_count,created_at)
    VALUES(?,?,?,?, 'pending', ?, ?, 0, datetime('now'))
  `).bind(user.id, videoId, model, body.mode || 'text', JSON.stringify(body), key.id).run();

  await env.DB.prepare('UPDATE api_keys SET in_use=1, last_used_at=datetime("now"), updated_at=datetime("now") WHERE id=? AND user_id=?').bind(key.id, user.id).run();
  return json({ ok: true, taskId: ins.meta.last_row_id, videoId, model });
};
