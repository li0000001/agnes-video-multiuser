import type { PagesFunction } from '@cloudflare/workers-types';
import { requireAdmin } from '../../../lib/admin';
import { json } from '../../../lib/auth';

export const onRequestPatch: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.res;
  const admin = auth.user;
  const id = Number(params.id);
  if (id === admin.id) return json({ error: '不能对自己进行此操作' }, 400);
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const user = await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(id).first();
  if (!user) return json({ error: '用户不存在' }, 404);
  if (action === 'disable') {
    await env.DB.prepare("UPDATE users SET status='disabled', updated_at=datetime('now') WHERE id=?").bind(id).run();
    return json({ ok: true });
  }
  if (action === 'enable') {
    await env.DB.prepare("UPDATE users SET status='active', updated_at=datetime('now') WHERE id=?").bind(id).run();
    return json({ ok: true });
  }
  if (action === 'set_admin') {
    await env.DB.prepare("UPDATE users SET role='admin', updated_at=datetime('now') WHERE id=?").bind(id).run();
    return json({ ok: true });
  }
  if (action === 'unset_admin') {
    await env.DB.prepare("UPDATE users SET role='user', updated_at=datetime('now') WHERE id=?").bind(id).run();
    return json({ ok: true });
  }
  return json({ error: '未知操作' }, 400);
};
