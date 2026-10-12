import type { PagesFunction } from '@cloudflare/workers-types';
import { getCurrentUser, requireAuth } from '../../../../lib/auth';
import { serveR2, CT_BY_EXT } from '../../../../lib/r2serve';

const SAFE_EXT = ['mp4', 'webm', 'mov', 'jpg', 'png', 'webp', 'gif'];

export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  let step = 'start';
  try {
    step = 'auth';
    const user = await getCurrentUser(request, env);
    step = 'requireAuth';
    const err = requireAuth(user);
    if (err) return err;
    step = 'db';
    const id = Number(params.id);
    const t = await env.DB.prepare('SELECT user_id,status,r2_key,video_deleted_at,mode FROM tasks WHERE id=?').bind(id).first();
    step = 'guard';
    if (!t || t.user_id !== user.id || t.status !== 'done' || !t.r2_key || t.video_deleted_at) {
      return new Response('Not found or not ready', { status: 404 });
    }
    step = 'serve';
    const rawExt = String(t.r2_key).split('.').pop() || '';
    const ext = SAFE_EXT.includes(rawExt.toLowerCase()) ? rawExt.toLowerCase() : 'mp4';
    const kind = t.mode === 'image' ? 'image' : 'video';
    const fname = `agnes-${kind}-${id}.${ext}`;
    return await serveR2(env, t.r2_key, request, {
      disposition: `attachment; filename="${fname}"`,
      fallbackCt: CT_BY_EXT[ext]
    });
  } catch (e) {
    return new Response(JSON.stringify({ diag: true, step, err: String(e && (e as Error).message) || String(e) }), {
      status: 500, headers: { 'content-type': 'application/json' }
    });
  }
};
