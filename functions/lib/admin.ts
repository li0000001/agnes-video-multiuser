import { getCurrentUser, json } from './auth';

export async function requireAdmin(request: Request, env: any) {
  const user = await getCurrentUser(request, env);
  if (!user) return { ok: false, res: json({ error: '未登录' }, 401) };
  if (user.role !== 'admin') return { ok: false, res: json({ error: '无权限，仅管理员可访问' }, 403) };
  return { ok: true, user };
}
