import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/auditLog';

type UserRole = 'admin' | 'staff' | 'viewer';

// Slim local types — no @supabase/supabase-js dependency
export interface AppUser {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
}

export interface AppSession {
  access_token: string;
  user: AppUser;
}

export type { UserRole };

export interface PagePermission {
  view: boolean;
  edit: boolean;
  delete: boolean;
  /** Can approve/reject pending requests — only meaningful on pages that support it (e.g. Requests). */
  approve: boolean;
}

export type Permissions = Record<string, boolean | Partial<PagePermission>>;

export const normalizePerm = (value: boolean | Partial<PagePermission> | undefined): PagePermission => {
  if (typeof value === 'boolean') return { view: value, edit: value, delete: value, approve: value };
  return { view: value?.view ?? false, edit: value?.edit ?? false, delete: value?.delete ?? false, approve: value?.approve ?? false };
};

interface AuthContextType {
  user: AppUser | null;
  session: AppSession | null;
  profile: { full_name: string; email: string; role: UserRole; phone: string | null; warehouses: string[] } | null;
  permissions: Permissions | null;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isViewer: boolean;
  /** Assigned warehouse names to scope data to, or null when the user should see all warehouses. */
  warehouseScope: string[] | null;
  canAccess: (key: string) => boolean;
  canEdit: (key: string) => boolean;
  canDelete: (key: string) => boolean;
  canApprove: (key: string) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, role?: UserRole, phone?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [profile, setProfile] = useState<{ full_name: string; email: string; role: UserRole; phone: string | null; warehouses: string[] } | null>(null);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (authUser: AppUser) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, email, role, phone, warehouses, deleted_at')
      .eq('id', authUser.id)
      .maybeSingle();

    if (!error && data) {
      // A removed team member's row is kept for audit history but their access
      // is revoked immediately — this catches both fresh logins and sessions
      // that were already active when an admin removed them.
      if ((data as { deleted_at: string | null }).deleted_at) {
        await supabase.auth.signOut();
        setProfile(null);
        setPermissions(null);
        return;
      }
      const raw = data as { full_name: string; email: string; role: UserRole; phone: string | null; warehouses: string[] | null };
      const p = { ...raw, warehouses: raw.warehouses ?? [] };
      setProfile(p);
      await loadPermissions(p.role);
      return;
    }

    // No profile row — use user_metadata as display fallback (signUp creates the real row)
    const meta = authUser.user_metadata ?? {};
    const role = ((meta.role as UserRole) || 'viewer') as UserRole;
    setProfile({
      full_name: (meta.full_name as string) || authUser.email || 'User',
      email: authUser.email,
      role,
      phone: (meta.phone as string | null) || null,
      warehouses: [],
    });
    await loadPermissions(role);
  };

  const loadPermissions = async (roleId: string) => {
    try {
      const token = localStorage.getItem('sm_access_token');
      const res = await fetch(`/api/roles/${roleId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const { data } = await res.json();
      setPermissions(data?.permissions ?? null);
    } catch {
      setPermissions(null);
    }
  };

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION immediately on mount, so getSession() is redundant
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      const appSession = s as AppSession | null;
      setSession(appSession);
      setUser(appSession?.user ?? null);
      // Keep the Express API's auth token in sync with the Supabase session —
      // server/middleware/auth.ts verifies this token against Supabase.
      if (appSession?.access_token) {
        localStorage.setItem('sm_access_token', appSession.access_token);
      } else {
        localStorage.removeItem('sm_access_token');
      }
      if (appSession?.user) {
        // Re-enter loading while the profile fetch is in flight (e.g. right after
        // sign-in) so ProtectedRoute shows a spinner instead of bouncing to /login
        // because profile is still null. Skip it for silent token refreshes.
        if (event !== 'TOKEN_REFRESHED') setLoading(true);
        fetchProfile(appSession.user as AppUser).finally(() => setLoading(false));
      } else {
        setProfile(null);
        setPermissions(null);
        setLoading(false);
      }
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { error };

    const { data: profileRow } = await supabase.from('profiles').select('deleted_at').eq('id', data.user.id).maybeSingle();
    if (profileRow?.deleted_at) {
      await supabase.auth.signOut();
      return { error: new Error('This account has been removed. Contact an administrator.') };
    }

    // Logged here, tied directly to the login form submission — not to the ambient
    // onAuthStateChange 'SIGNED_IN' event, which can refire spuriously (e.g. on tab
    // focus) and would otherwise create duplicate rows for a single real login.
    logAudit({ action: 'login', module: 'auth', description: 'Signed in' });
    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string, role: UserRole = 'staff', phone?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role, phone: phone || null } },
    });

    if (!error && data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        role,
        phone: phone || null,
      }, { onConflict: 'id', ignoreDuplicates: true });
      logAudit({ action: 'create', module: 'auth', description: `Signed up as ${role}`, referenceId: data.user.id });
    }

    return { error };
  };

  const signOut = async () => {
    // Logged before signOut() clears the session — logAudit reads the current
    // session to attribute the entry, so it must run while it's still there.
    logAudit({ action: 'logout', module: 'auth', description: 'Signed out' });
    await supabase.auth.signOut();
    setProfile(null);
    setPermissions(null);
    setUser(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user);
  };

  const isAdmin = profile?.role === 'admin';
  const isStaff = profile?.role === 'admin' || profile?.role === 'staff';
  const isViewer = profile?.role === 'viewer';
  const canAccess = (key: string) => permissions === null || normalizePerm(permissions[key]).view;
  const canEdit = (key: string) => permissions === null || normalizePerm(permissions[key]).edit;
  const canDelete = (key: string) => permissions === null || normalizePerm(permissions[key]).delete;
  const canApprove = (key: string) => permissions === null || normalizePerm(permissions[key]).approve;
  // Non-admins assigned to one or more warehouses only see data tied to those
  // warehouses; admins always see everything regardless of their own assignment.
  const warehouseScope = !isAdmin && profile?.warehouses && profile.warehouses.length > 0 ? profile.warehouses : null;

  return (
    <AuthContext.Provider
      value={{ user, session, profile, permissions, loading, isAdmin, isStaff, isViewer, canAccess, canEdit, canDelete, canApprove, warehouseScope, signIn, signUp, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
