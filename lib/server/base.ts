import postgres from 'postgres';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
export class Fault extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function need(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new Fault(status, message);
}
export function secret(name: string) {
  const s = process.env[name]?.trim();
  need(s, 503, `Configuration required: ${name}.`);
  if (name === 'APP_HMAC_SECRET' || name === 'CRON_SECRET')
    need(s.length >= 32, 503, `Configure a strong ${name}.`);
  return s;
}
export const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const mac = (s: string | Buffer, k: string) => createHmac('sha256', k).update(s).digest('hex');
export const fresh = () => randomBytes(32).toString('base64url');
export const equal = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
export const configuredDB = () => !!process.env.DATABASE_URL;
let pool: ReturnType<typeof postgres> | undefined;
export function db() {
  if (!pool) {
    const url = secret('DATABASE_URL');
    const u = new URL(url);
    pool = postgres(url, {
      max: 3,
      prepare: false,
      idle_timeout: 15,
      connect_timeout: 5,
      ssl: ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
        ? false
        : {
            rejectUnauthorized: true,
            ...(process.env.DATABASE_CA_PEM
              ? { ca: process.env.DATABASE_CA_PEM.replaceAll('\\n', '\n') }
              : {}),
          },
      onnotice: () => {},
      connection: { application_name: 'paradelle', statement_timeout: 12000 },
    });
  }
  return pool;
}
export type Tx = postgres.TransactionSql;
export const tx = async <T>(fn: (sql: Tx) => Promise<T>): Promise<T> =>
  (await db().begin(async (sql) => {
    await sql`set local role paradelle_runtime`;
    await sql`set local search_path=shop,pg_catalog`;
    return fn(sql);
  })) as T;
export async function closeDB() {
  if (pool) await pool.end({ timeout: 2 });
  pool = undefined;
}
export const json = (obj: unknown) => JSON.stringify(obj);
export const uid = (v: unknown) => z.uuid().parse(v);
export const first = <T>(a: T[], msg = 'Record not found.') => {
  need(a.length, 404, msg);
  return a[0];
};
export const iso = (v: string | Date) => new Date(v).toISOString();
export async function audit(
  s: Tx,
  actor: string | null,
  action: string,
  kind: string,
  id: string,
  detail = '',
) {
  const [r] =
    await s`insert into admin_activity_logs(admin_user_id,action,entity_type,entity_id,metadata) values(${actor},${action},${kind},${id},${json({ detail })}::text::jsonb) returning id`;
  return String(r.id);
}
export async function limit(name: string, subject: string, maximum: number, seconds: number) {
  const bucket = mac(`${name}:${subject}`, secret('APP_HMAC_SECRET'));
  const allowed = await tx(async (s) => {
    const [r] =
      await s`insert into rate_windows(bucket,hits,expires_at) values(${bucket},1,now()+make_interval(secs=>${seconds})) on conflict(bucket) do update set hits=case when rate_windows.expires_at<=now() then 1 else least(rate_windows.hits+1,1000000) end,expires_at=case when rate_windows.expires_at<=now() then excluded.expires_at else rate_windows.expires_at end returning hits`;
    return r.hits <= maximum;
  });
  need(allowed, 429, 'Too many requests. Please try again later.');
}
export function clientIP(h: Headers) {
  return process.env.VERCEL === '1'
    ? (h.get('x-vercel-forwarded-for') || h.get('x-real-ip') || 'unknown').split(',')[0].trim().slice(0, 64)
    : 'local-or-untrusted-proxy';
}
export function safeError(err: unknown) {
  if (err instanceof Fault) return err;
  if (err instanceof z.ZodError) return new Fault(422, 'Check the supplied fields.');
  const code = String((err as { code?: string })?.code ?? '');
  if (['23503', '23505', '40001', '40P01'].includes(code))
    return new Fault(409, 'This operation conflicts with the current record. Refresh before retrying.');
  if (['23514', '22003', '22P02', '23502'].includes(code))
    return new Fault(422, 'The request violates a data constraint.');
  return new Fault(503, 'The service could not confirm this operation.');
}
export async function boundedBytes(r: Request | Response, max: number) {
  need(Number(r.headers.get('content-length') || 0) <= max, 413, 'Request is too large.');
  const reader = r.body?.getReader();
  need(reader, 400, 'A body is required.');
  let n = 0;
  const parts: Uint8Array[] = [];
  for (;;) {
    const x = await reader.read();
    if (x.done) break;
    n += x.value.length;
    if (n > max) {
      await reader.cancel();
      throw new Fault(413, 'Request is too large.');
    }
    parts.push(x.value);
  }
  return Buffer.concat(parts);
}
export async function body(r: Request, max = 262144) {
  need(r.headers.get('content-type')?.split(';')[0] === 'application/json', 415, 'Expected JSON.');
  try {
    return JSON.parse((await boundedBytes(r, max)).toString('utf8'));
  } catch (e) {
    if (e instanceof Fault) throw e;
    throw new Fault(400, 'Invalid JSON.');
  }
}
