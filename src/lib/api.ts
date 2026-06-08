// Custom API client — drop-in replacement for @supabase/supabase-js
// All page files keep their existing supabase.from(...) / supabase.auth.* calls unchanged.

const TOKEN_KEY = 'sm_access_token';

export interface User {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
}

export interface Session {
  access_token: string;
  user: User;
}

type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED';
type AuthCallback = (event: AuthEvent, session: Session | null) => void;

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// Global listener set for auth state changes
const authListeners = new Set<AuthCallback>();
function notifyAuth(event: AuthEvent, session: Session | null) {
  authListeners.forEach(cb => cb(event, session));
}

// ── Query Builder ────────────────────────────────────────────
type Op = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

class QueryBuilder {
  private _table: string;
  private _op: Op = 'select';
  private _cols = '*';
  private _filters: Array<[string, string]> = [];   // [col, "op.value"]
  private _orderCol: string | null = null;
  private _orderDir: 'asc' | 'desc' = 'asc';
  private _limitN: number | null = null;
  private _single = false;
  private _maybeSingle = false;
  private _payload: unknown = null;
  private _onConflict: string | null = null;

  constructor(table: string) {
    this._table = table;
  }

  select(cols = '*') { this._cols = cols; return this; }

  eq(col: string, val: unknown)  { this._filters.push([col, `eq.${val}`]);  return this; }
  neq(col: string, val: unknown) { this._filters.push([col, `neq.${val}`]); return this; }
  gte(col: string, val: unknown) { this._filters.push([col, `gte.${val}`]); return this; }
  lte(col: string, val: unknown) { this._filters.push([col, `lte.${val}`]); return this; }
  gt(col: string, val: unknown)  { this._filters.push([col, `gt.${val}`]);  return this; }
  lt(col: string, val: unknown)  { this._filters.push([col, `lt.${val}`]);  return this; }

  order(col: string, opts?: { ascending?: boolean }) {
    this._orderCol = col;
    this._orderDir = opts?.ascending === false ? 'desc' : 'asc';
    return this;
  }

  limit(n: number) { this._limitN = n; return this; }
  single()       { this._single = true;      return this; }
  maybeSingle()  { this._maybeSingle = true; return this; }

  insert(payload: unknown) { this._op = 'insert'; this._payload = payload; return this; }

  update(payload: unknown) { this._op = 'update'; this._payload = payload; return this; }

  upsert(payload: unknown, opts?: { onConflict?: string }) {
    this._op = 'upsert';
    this._payload = payload;
    if (opts?.onConflict) this._onConflict = opts.onConflict;
    return this;
  }

  delete() { this._op = 'delete'; return this; }

  // ── private helpers ──────────────────────────────────────
  private headers(): Record<string, string> {
    const token = getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private filterParams(): URLSearchParams {
    const p = new URLSearchParams();
    this._filters.forEach(([col, val]) => p.set(col, val));
    return p;
  }

  private selectParams(): URLSearchParams {
    const p = new URLSearchParams();
    p.set('select', this._cols);
    this._filters.forEach(([col, val]) => p.set(col, val));
    if (this._orderCol) p.set('order', `${this._orderCol}.${this._orderDir}`);
    if (this._limitN !== null) p.set('limit', String(this._limitN));
    if (this._single) p.set('single', 'true');
    if (this._maybeSingle) p.set('maybeSingle', 'true');
    return p;
  }

  private execute(): Promise<{ data: any; error: any }> {
    const h = this.headers();

    switch (this._op) {
      case 'select':
        return fetch(`/api/${this._table}?${this.selectParams()}`, { headers: h }).then(r => r.json());

      case 'insert': {
        return fetch(`/api/${this._table}`, {
          method: 'POST', headers: h, body: JSON.stringify(this._payload),
        }).then(r => r.json());
      }

      case 'upsert': {
        const p = new URLSearchParams();
        if (this._onConflict) p.set('onConflict', this._onConflict);
        return fetch(`/api/${this._table}?${p}`, {
          method: 'POST', headers: h, body: JSON.stringify(this._payload),
        }).then(r => r.json());
      }

      case 'update':
        return fetch(`/api/${this._table}?${this.filterParams()}`, {
          method: 'PATCH', headers: h, body: JSON.stringify(this._payload),
        }).then(r => r.json());

      case 'delete':
        return fetch(`/api/${this._table}?${this.filterParams()}`, {
          method: 'DELETE', headers: h,
        }).then(r => r.json());
    }
  }

  or(filter: string) {
    // Parse "col1.op.val,col2.op.val" — treat as individual filters OR'd together (simplified: just pass as-is to ilike/eq)
    // For the search pattern used in the app, we store raw and handle server-side via existing filters
    this._filters.push(['__or__', filter]);
    return this;
  }

  // Makes the builder await-able  (await supabase.from('x').select('*'))
  then<R1, R2 = never>(
    onFulfilled?: ((v: { data: any; error: any }) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.execute().then(onFulfilled as any, onRejected as any);
  }
}

// ── Auth module ──────────────────────────────────────────────
const auth = {
  async getSession(): Promise<{ data: { session: Session | null } }> {
    const token = getToken();
    if (!token) return { data: { session: null } };
    try {
      const r = await fetch('/auth/session', { headers: { Authorization: `Bearer ${token}` } });
      return r.json();
    } catch {
      return { data: { session: null } };
    }
  },

  onAuthStateChange(callback: AuthCallback) {
    authListeners.add(callback);
    // Fire immediately with current state
    auth.getSession().then(({ data: { session } }) => {
      callback(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
    });
    return {
      data: {
        subscription: { unsubscribe: () => { authListeners.delete(callback); } },
      },
    };
  },

  async signInWithPassword(creds: { email: string; password: string }) {
    const r = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    });
    const result: { data: { session: Session; user: User } | null; error: string | null } = await r.json();
    if (result.data?.session) {
      setToken(result.data.session.access_token);
      notifyAuth('SIGNED_IN', result.data.session);
    }
    return { error: result.error ? new Error(result.error) : null };
  },

  async signUp(params: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
    const { email, password, options } = params;
    const r = await fetch('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, ...options?.data }),
    });
    const result: { data: { session: Session; user: User } | null; error: string | null } = await r.json();
    if (result.data?.session) {
      setToken(result.data.session.access_token);
      notifyAuth('SIGNED_IN', result.data.session);
    }
    return {
      data: result.data ?? { user: null, session: null },
      error: result.error ? new Error(result.error) : null,
    };
  },

  async signOut() {
    setToken(null);
    notifyAuth('SIGNED_OUT', null);
    return { error: null };
  },

  async getUser(): Promise<{ data: { user: User | null } }> {
    const token = getToken();
    if (!token) return { data: { user: null } };
    try {
      const r = await fetch('/auth/user', { headers: { Authorization: `Bearer ${token}` } });
      return r.json();
    } catch {
      return { data: { user: null } };
    }
  },
};

// ── Functions module (edge-function replacement) ─────────────
const functions = {
  async invoke(name: string, options?: { body?: unknown }) {
    const token = getToken();
    const r = await fetch(`/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(options?.body ?? {}),
    });
    const data = await r.json();
    return { data, error: null };
  },
};

// ── RPC stub (returns empty data — pages should handle gracefully) ────
async function rpc(_fn: string, _params?: unknown) {
  return { data: null, error: null };
}

// ── Realtime stubs (no-op — keeps NotificationContext from crashing) ─
function channel(_name: string) {
  const sub = {
    on(_event: string, _filter: unknown, _cb: unknown) { return sub; },
    subscribe() { return sub; },
  };
  return sub;
}

// ── Public API object ────────────────────────────────────────
export const api = {
  from: (table: string) => new QueryBuilder(table),
  auth,
  functions,
  rpc,
  channel,
  removeChannel(_ch: unknown) { /* no-op */ },
};
