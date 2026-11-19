import { supabase } from '@/lib/server/auth';
import { tx } from '@/lib/server/base';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const out: Record<string, unknown> = { at: new Date().toISOString() };
  // env presence
  out.env = {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    hasAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    anonPrefix: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').slice(0, 20),
    hasService: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasDb: !!process.env.DATABASE_URL,
    dbPrefix: (process.env.DATABASE_URL ?? '').slice(0, 30),
    siteOrigin: process.env.SITE_ORIGIN ?? null,
  };
  // db
  try {
    const rows = await tx(async (s) => await s`select 1 as ok`);
    out.db = { ok: true, rows };
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string; status?: number; cause?: unknown };
    out.db = { ok: false, message: err?.message ?? String(e), code: err?.code ?? null, status: err?.status ?? null };
  }
  // auth
  try {
    const anon = supabase();
    const { data, error } = await anon.auth.signInWithPassword({ email: 'admin@paradelle.store', password: 'Iskcon@098' });
    out.auth = { ok: !error && !!data.session, error: error?.message ?? null, status: (error as { status?: number })?.status ?? null, userId: data.user?.id ?? null, hasSession: !!data.session };
    if (data.session) await anon.auth.signOut();
  } catch (e: unknown) {
    out.auth = { ok: false, error: String(e), stack: e instanceof Error ? e.stack?.slice(0, 800) : null };
  }
  // grants
  try {
    const v = await tx(async (s) => await s`select id, email, role, is_active from profiles where id='d0b6fcc3-6365-4094-96cb-cdbb813d7d4d'`);
    out.profile = { ok: true, row: v[0] ?? null };
  } catch (e: unknown) {
    out.profile = { ok: false, error: String(e) };
  }
  return Response.json(out, { headers: { 'cache-control': 'no-store' } });
}
