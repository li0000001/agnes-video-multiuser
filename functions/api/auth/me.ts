import type { PagesFunction } from '@cloudflare/workers-types';
import { getCurrentUser, json } from '../../lib/auth';

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ loggedIn: false }, 200);
  return json({ loggedIn: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
};
