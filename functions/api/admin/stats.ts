import type { PagesFunction } from '@cloudflare/workers-types';
import { requireAdmin } from '../../lib/admin';
import { json } from '../../lib/auth';

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.res;
  const [users, tasksTotal, tasksDone, tasksPending, tasksProc, tasksFail, videosActive] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as c FROM users WHERE status="active"').first(),
    env.DB.prepare('SELECT COUNT(*) as c FROM tasks WHERE deleted_at IS NULL').first(),
    env.DB.prepare('SELECT COUNT(*) as c FROM tasks WHERE status="done" AND deleted_at IS NULL AND video_deleted_at IS NULL').first(),
    env.DB.prepare('SELECT COUNT(*) as c FROM tasks WHERE status="pending" AND deleted_at IS NULL').first(),
    env.DB.prepare('SELECT COUNT(*) as c FROM tasks WHERE status="processing" AND deleted_at IS NULL').first(),
    env.DB.prepare('SELECT COUNT(*) as c FROM tasks WHERE status="failed" AND deleted_at IS NULL').first(),
    env.DB.prepare('SELECT COUNT(*) as c FROM tasks WHERE status="done" AND r2_key IS NOT NULL AND video_deleted_at IS NULL AND deleted_at IS NULL').first()
  ]);
  return json({
    users: users?.c || 0,
    tasksTotal: tasksTotal?.c || 0,
    tasksDone: tasksDone?.c || 0,
    tasksPending: tasksPending?.c || 0,
    tasksProc: tasksProc?.c || 0,
    tasksFail: tasksFail?.c || 0,
    videosActive: videosActive?.c || 0
  });
};
