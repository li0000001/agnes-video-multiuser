import type { PagesFunction } from '@cloudflare/workers-types';
import { requireAdmin } from '../../../../lib/admin';
import { json } from '../../../../lib/auth';

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.res;
  const id = Number(params.id);
  const rows = await env.DB.prepare(`
    SELECT id,name,key_mask,status,in_use,max_concurrent,fail_count,last_used_at,created_at,deleted_at
    FROM api_keys WHERE user_id=? ORDER BY created_at DESC
  `).bind(id).all();
  return json({ keys: rows.results || [] });
};
