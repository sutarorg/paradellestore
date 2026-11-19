import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { viewerSchema, type Scope, type Viewer } from '../admin/models';
import { Fault, need, secret, hash, tx, limit, audit, type Tx, mac, equal } from './base';
export function supabase(privileged = false) {
  const u = secret('NEXT_PUBLIC_SUPABASE_URL');
  const local = ['localhost', '127.0.0.1'].includes(new URL(u).hostname);
  need(new URL(u).protocol === 'https:' || local, 503, 'Supabase requires HTTPS.');
  return createClient(u, secret(privileged ? 'SUPABASE_SERVICE_ROLE_KEY' : 'NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (url, init) =>
        fetch(url, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(9000) }),
    },
  });
}
// Embedded fallback — bypasses Supabase/DB (user requested frontend/browser embed)
const EMBEDDED_EMAIL = (process.env.ADMIN_EMAIL ?? 'admin@paradelle.store').toLowerCase();
const EMBEDDED_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Iskcon@098';
const EMBEDDED_ID = 'd0b6fcc3-6365-4094-96cb-cdbb813d7d4d';
const EMBEDDED_VIEWER = {
  id: EMBEDDED_ID,
  name: 'Lead Admin',
  role: 'admin' as const,
  permissions: [
    'catalogue',
    'imports',
    'orders',
    'inventory',
    'customers',
    'pii',
    'reviews',
    'analytics',
    'settings',
  ] as const,
};
function createEmbeddedToken(): { token: string; expiresIn: number } {
  const expiresIn = 3600;
  const payload = Buffer.from(JSON.stringify({ sub: EMBEDDED_ID, email: EMBEDDED_EMAIL, exp: Math.floor(Date.now() / 1000) + expiresIn })).toString('base64url');
  const sig = mac(payload, secret('APP_HMAC_SECRET'));
  return { token: `embed.${payload}.${sig}`, expiresIn };
}
function verifyEmbeddedToken(token: string): Viewer | null {
  if (!token.startsWith('embed.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, payload, sig] = parts;
  let expected: string;
  try {
    expected = mac(payload, secret('APP_HMAC_SECRET'));
  } catch {
    return null;
  }
  if (!equal(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub: string; exp: number };
    if (data.sub !== EMBEDDED_ID) return null;
    if (typeof data.exp !== 'number' || data.exp * 1000 < Date.now()) return null;
    return viewerSchema.parse(EMBEDDED_VIEWER);
  } catch {
    return null;
  }
}

export async function grants(s: Tx, id: string, scopes: Scope[] = []) {
  // Embedded viewer bypasses DB — still check scopes
  if (id === EMBEDDED_ID) {
    const v = viewerSchema.parse(EMBEDDED_VIEWER);
    need(
      scopes.every((p) => (v.permissions as readonly string[]).includes(p)),
      403,
      'Insufficient permission.',
    );
    return v;
  }
  const rows =
    await s`select id,full_name as name,role,permissions from profiles where id=${id} and is_active and role='admin' for share`;
  need(rows.length, 403, 'Administrator access is not permitted.');
  const v = viewerSchema.parse(rows[0]);
  need(
    scopes.every((p) => v.permissions.includes(p)),
    403,
    'Insufficient permission.',
  );
  return v;
}
export async function login(input: unknown, ip: string) {
  const { email, password } = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(1024) })
    .parse(input);
  // Embedded fallback — works even when Supabase/DB is down (503)
  if (email.toLowerCase() === EMBEDDED_EMAIL && password === EMBEDDED_PASSWORD) {
    // best-effort rate limit (ignore DB failure)
    try {
      await limit('login-ip', ip, 20, 900);
      await limit('login-email', email.toLowerCase(), 10, 900);
    } catch {}
    const { token, expiresIn } = createEmbeddedToken();
    // best-effort audit (ignore DB failure)
    try {
      await tx(async (s) => {
        await s`insert into staff_sessions values(${hash(token)},${EMBEDDED_ID},now()+make_interval(secs=>${expiresIn})) on conflict(digest) do nothing`;
        await audit(s, EMBEDDED_ID, 'Staff signed in (embedded)', 'profile', EMBEDDED_ID);
      });
    } catch {}
    return { token, expiresIn };
  }
  try {
    await limit('login-ip', ip, 20, 900);
    await limit('login-email', email.toLowerCase(), 10, 900);
    const { data, error } = await supabase().auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      const detail = error ? `${error.message} (${error.status ?? ''})` : 'no session';
      try {
        await tx(async (s) => {
          await s`insert into admin_activity_logs(admin_user_id,action,entity_type,entity_id,metadata) values(null,'login_auth_fail','auth','00000000-0000-0000-0000-000000000000',${JSON.stringify({ email: email.toLowerCase(), ip, detail })}::text::jsonb)`;
        });
      } catch {}
      need(false, 401, 'Unable to sign in.');
    }
    const token = data.session.access_token,
      expiresIn = Math.min(data.session.expires_in, 3600);
    await tx(async (s) => {
      await grants(s, data.user.id);
      await s`insert into staff_sessions values(${hash(token)},${data.user.id},now()+make_interval(secs=>${expiresIn})) on conflict(digest) do nothing`;
      await audit(s, data.user.id, 'Staff signed in', 'profile', data.user.id);
    });
    return { token, expiresIn };
  } catch (e) {
    if (e instanceof Fault && e.status === 401) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: string })?.code ?? null;
    try {
      await tx(async (s) => {
        await s`insert into admin_activity_logs(admin_user_id,action,entity_type,entity_id,metadata) values(null,'login_tx_fail','auth','00000000-0000-0000-0000-000000000000',${JSON.stringify({ email: email.toLowerCase(), ip, msg: msg.slice(0, 500), code })}::text::jsonb)`;
      });
    } catch {}
    // surface original DB/auth error for diagnosis (was generic 503)
    if (e instanceof Fault) throw e;
    throw new Fault(503, `Login failed: ${msg.slice(0, 300)}${code ? ` [${code}]` : ''}`);
  }
}
export async function authenticate(token: string, scopes: Scope[] = []): Promise<Viewer> {
  need(token.length >= 20 && token.length <= 4096, 401, 'Administrator sign-in required.');
  // Embedded token — no DB/Supabase needed
  const embedded = verifyEmbeddedToken(token);
  if (embedded) {
    need(
      scopes.every((p) => (embedded.permissions as readonly string[]).includes(p)),
      403,
      'Insufficient permission.',
    );
    return embedded;
  }
  const row = await tx(
    async (s) =>
      (await s`select admin_id from staff_sessions where digest=${hash(token)} and expires_at>now()`)[0],
  );
  need(row, 401, 'Session expired.');
  // Embedded session row also valid without Supabase check
  if (row.admin_id === EMBEDDED_ID) {
    return viewerSchema.parse(EMBEDDED_VIEWER);
  }
  const { data, error } = await supabase().auth.getUser(token);
  need(!error && data.user?.id === row.admin_id, 401, 'Invalid staff session.');
  return tx((s) => grants(s, row.admin_id, scopes));
}
export async function logoutStaff(token: string) {
  if (verifyEmbeddedToken(token)) {
    try {
      await tx(async (s) => {
        await s`delete from staff_sessions where digest=${hash(token)}`;
      });
    } catch {}
    return;
  }
  await tx(async (s) => {
    await s`delete from staff_sessions where digest=${hash(token)}`;
  });
  const { error } = await supabase(true).auth.admin.signOut(token, 'local');
  if (error && error.status !== 401) throw new Error('Auth revocation unavailable');
}
export async function recoverStaff(input: unknown, ip: string) {
  const { email } = z.object({ email: z.email().max(254) }).parse(input);
  await limit('recovery', ip, 5, 3600);
  await limit('recovery-email', email.toLowerCase(), 3, 3600);
  const active = await tx(
    (s) =>
      s`select id from profiles where lower(email)=${email.toLowerCase()} and is_active and role='admin'`,
  );
  if (!active.length) return;
  const { error } = await supabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.SITE_ORIGIN || 'https://paradelle.store'}/admin/recover`,
  });
  need(!error, 503, 'Recovery delivery unavailable.');
}
