import type { PagesFunction } from '@cloudflare/workers-types';
import { getCurrentUser, requireAuth, json } from '../../../lib/auth';
import { encryptApiKey } from '../../../lib/crypto';

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const user = await getCurrentUser(request, env);
  const err = requireAuth(user);
  if (err) return err;
  const rows = await env.DB.prepare(`
    SELECT id,name,key_mask,status,in_use,max_concurrent,fail_count,last_used_at,created_at
    FROM api_keys WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at DESC
  `).bind(user.id).all();
  return json({ keys: rows.results || [] });
};

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const user = await getCurrentUser(request, env);
  const err = requireAuth(user);
  if (err) return err;
  const body = await request.json().catch(() => ({}));
  const apiKey = String(body.apiKey || '').trim();
  const name = String(body.name || '').trim() || null;
  if (!apiKey) return json({ error: '请输入 Agnes API Key' }, 400);
  if (!env.ENC_KEY) return json({ error: '未配置 ENC_KEY' }, 500);
  const enc = await encryptApiKey(apiKey, env.ENC_KEY);
  await env.DB.prepare(`
    INSERT INTO api_keys(user_id,name,key_enc,key_mask,status,in_use,max_concurrent,concurrent_count,fail_count,created_at,updated_at)
    VALUES(?,?,?,?, 'active', 0, 1, 0, 0, datetime('now'), datetime('now'))
  `).bind(user.id, name, enc.key_enc, enc.key_mask).run();
  return json({ ok: true });
};
