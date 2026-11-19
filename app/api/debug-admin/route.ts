import { supabase, grants } from '@/lib/server/auth';
import { tx, secret } from '@/lib/server/base';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const out: Record<string, unknown> = {};
  try {
    out.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
    out.hasAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    out.hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    out.hasDb = !!process.env.DATABASE_URL;
    out.siteOrigin = process.env.SITE_ORIGIN ?? null;
    // test auth
    try {
      const anon = supabase();
      const { data, error } = await anon.auth.signInWithPassword({ email: 'admin@paradelle.store', password: 'Iskcon@098' });
      out.auth = { ok: !!data.session, error: error?.message ?? null, userId: data.user?.id ?? null };
      if (data.session) await anon.auth.signOut();
    } catch (e: unknown) {
      out.auth = { ok: false, error: String(e) };
    }
    // test db via tx grants
    try {
      const v = await tx(async (s) => {
        const rows = await s`select id, full_name as name, role, permissions from profiles where id='d0b6fcc3-6365-4094-96cb-cdbb813d7d4d' and is_active and role='admin' limit 1`;
        return rows[0] ?? null;
      });
      out.db = { ok: true, profile: v };
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string; status?: number };
      out.db = { ok: false, error: err?.message ?? String(e), code: (err as { code?: string })?.code ?? null };
    }
    // test grants function
    try {
      const g = await tx(async (s) => grants(s, 'd0b6fcc3-6365-4094-96cb-cdbb813d7d4d'));
      out.grants = { ok: true, value: g };
    } catch (e: unknown) {
      const err = e as { message?: string; status?: number };
      out.grants = { ok: false, error: err?.message ?? String(e), status: err?.status ?? null };
    }
    return Response.json(out);
  } catch (e: unknown) {
    return Response.json({ fatal: String(e) }, { status: 500 });
  }
}
