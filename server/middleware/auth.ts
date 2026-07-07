import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabaseForToken } from '../lib/supabaseEnv';

export const JWT_SECRET = process.env.JWT_SECRET || 'stockmanagement-local-secret-2026';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string };
}

// Real user sessions are issued by Supabase Auth (see src/contexts/AuthContext.tsx),
// not the local JWT_SECRET above — that one is only used by the unused src/lib/api.ts
// client. Verify Supabase-issued tokens here so Express routes work for real logins.
async function verifySupabaseToken(token: string): Promise<{ id: string; email: string; role: string } | null> {
  const client = supabaseForToken(token);
  if (!client) return null;

  const { data: userData, error: userErr } = await client.auth.getUser(token);
  if (userErr || !userData?.user) return null;

  const { data: profile } = await client.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
  const role = (profile?.role as string) || (userData.user.user_metadata?.role as string) || 'viewer';

  return { id: userData.user.id, email: userData.user.email || '', role };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ data: null, error: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
    return next();
  } catch { /* not a local token — try Supabase below */ }

  const supabaseUser = await verifySupabaseToken(token);
  if (supabaseUser) {
    req.user = supabaseUser;
    return next();
  }

  res.status(401).json({ data: null, error: 'Invalid or expired token' });
}

export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
    } catch {
      const supabaseUser = await verifySupabaseToken(token);
      if (supabaseUser) req.user = supabaseUser;
    }
  }
  next();
}
