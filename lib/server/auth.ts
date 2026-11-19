import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { viewerSchema, type Scope, type Viewer } from '../admin/models';
import { need, secret, hash, tx, limit, audit, type Tx } from './base';
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
export async function grants(s: Tx, id: string, scopes: Scope[] = []) {
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
    throw e;
  }
}
export async function authenticate(token: string, scopes: Scope[] = []): Promise<Viewer> {
  need(token.length >= 20 && token.length <= 4096, 401, 'Administrator sign-in required.');
  const row = await tx(
    async (s) =>
      (await s`select admin_id from staff_sessions where digest=${hash(token)} and expires_at>now()`)[0],
  );
  need(row, 401, 'Session expired.');
  const { data, error } = await supabase().auth.getUser(token);
  need(!error && data.user?.id === row.admin_id, 401, 'Invalid staff session.');
  return tx((s) => grants(s, row.admin_id, scopes));
}
export async function logoutStaff(token: string) {
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
