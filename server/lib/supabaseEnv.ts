import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.VITE_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Builds a Supabase client scoped to the calling user's own access token, so RLS
// policies apply exactly as they would from the browser (no service-role bypass).
export function supabaseForToken(token: string | undefined): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
}

// Service-role client — bypasses RLS entirely. Only ever use this for operations
// that genuinely require admin privilege (e.g. creating another user's auth
// account via supabase.auth.admin.*). Never send this client or its key to the
// browser; it must stay server-side only.
export function supabaseAdmin(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Replaces `.eq('role', 'admin')` — any role can now be marked "full access"
// from the Roles page, so finding who should be treated as an admin (e.g. for
// admin-only notifications) is a two-step lookup: which roles have the flag,
// then which profiles hold one of those roles.
export async function getFullAccessProfileIds(supabase: SupabaseClient): Promise<string[]> {
  const { data: roles } = await supabase.from('roles').select('id').eq('is_full_access', true);
  const roleIds = (roles ?? []).map((r) => r.id as string);
  if (roleIds.length === 0) return [];

  const { data: profiles } = await supabase.from('profiles').select('id').in('role', roleIds);
  return (profiles ?? []).map((p) => p.id as string);
}
