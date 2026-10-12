import type { PagesFunction } from '@cloudflare/workers-types';
import { json, clearSessionCookie } from '../../lib/auth';

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const name = env.SESSION_NAME || 'agnes_session';
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(name + '=([^;]+)'));
  if (m) {
    const sid = decodeURIComponent(m[1]);
    await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(sid).run();
  }
  const res = json({ ok: true });
  clearSessionCookie(res, name);
  return res;
};
