import type { PagesFunction } from '@cloudflare/workers-types';
import { getCurrentUser, requireAuth, json } from '../../../lib/auth';

export const onRequestPatch: PagesFunction = async ({ request, env, params }) => {
  const user = await getCurrentUser(request, env);
  const err = requireAuth(user);
  if (err) return err;
  const id = Number(params.id);
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const row = await env.DB.prepare('SELECT id,in_use,status FROM api_keys WHERE id=? AND user_id=? AND deleted_at IS NULL').bind(id, user.id).first();
  if (!row) return json({ error: '密钥不存在或无权限' }, 404);
  if (action === 'disable') {
    if (row.in_use === 1) return json({ error: '该 Key 当前正被进行中的任务占用，建议等任务完成后再禁用' }, 400);
    await env.DB.prepare("UPDATE api_keys SET status='disabled', updated_at=datetime('now') WHERE id=? AND user_id=?").bind(id, user.id).run();
    return json({ ok: true });
  }
  if (action === 'enable') {
    await env.DB.prepare("UPDATE api_keys SET status='active', updated_at=datetime('now') WHERE id=? AND user_id=?").bind(id, user.id).run();
    return json({ ok: true });
  }
  return json({ error: '未知操作' }, 400);
};

export const onRequestDelete: PagesFunction = async ({ request, env, params }) => {
  const user = await getCurrentUser(request, env);
  const err = requireAuth(user);
  if (err) return err;
  const id = Number(params.id);
  const row = await env.DB.prepare('SELECT id,in_use FROM api_keys WHERE id=? AND user_id=? AND deleted_at IS NULL').bind(id, user.id).first();
  if (!row) return json({ error: '密钥不存在或无权限' }, 404);
  if (row.in_use === 1) return json({ error: '该 Key 当前正被进行中的任务占用，暂时无法删除' }, 400);
  await env.DB.prepare("UPDATE api_keys SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND user_id=?").bind(id, user.id).run();
  return json({ ok: true });
};
