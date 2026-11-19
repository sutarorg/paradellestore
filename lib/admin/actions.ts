'use server';
import { cookies } from 'next/headers';
import { updateTag } from 'next/cache';
import { z } from 'zod';
import { command, checkCommand, queued, receipt, scopes, type Receipt, type Result } from './commands';
import {
  allow,
  configured,
  cookieName,
  disconnected,
  getJob,
  privateOrderSearch,
  privateCustomerSearch,
  request,
  validToken,
} from './gateway';
import { key, photo, settings, viewerSchema, type Photo, type Scope } from './models';
import { importIssues, verifiedFacts, listQuery, type ListQuery } from './rules';
const failed = (message: string) => ({ ok: false as const, message });
const statusMessage = (s: number) =>
  ({
    401: 'Your session has expired. Sign in again.',
    403: 'This action is not permitted.',
    404: 'The record is no longer available.',
    409: 'This record changed. Reload it before applying your change.',
    422: 'The service rejected this change. Check required fields, rights and current status.',
    429: 'Too many requests. Wait before trying again.',
  })[s] ?? 'The service did not confirm the change. Refresh its status before retrying.';
const serviceError = 'No confirmation was received. Refresh before trying again.';
export async function signIn(email: string, password: string): Promise<Result<null>> {
  if (
    !z.email().max(254).safeParse(email).success ||
    typeof password !== 'string' ||
    !password ||
    password.length > 1024
  )
    return failed('Enter your admin email and password.');
  if (!configured()) return failed('Administrator sign-in is not connected. No session was created.');
  try {
    const r = await request(
      'auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      false,
    );
    if (!r.ok) {
      let detail = '';
      try {
        const j = await r.clone().json() as { error?: { message?: string } };
        if (typeof j?.error?.message === 'string') detail = ` (${j.error.message})`;
      } catch {}
      return failed(r.status === 429 ? statusMessage(429) : `Unable to sign in with these details.${detail} [${r.status}]`);
    }
    const data = z
      .object({ token: z.string().refine(validToken), expiresIn: z.int().positive().max(86400) })
      .parse(await r.json());
    const claims = await request(
      'auth/session',
      { headers: { authorization: `Bearer ${data.token}` } },
      false,
    );
    if (!claims.ok || !viewerSchema.safeParse(await claims.json()).success)
      return failed('Administrator access could not be verified.');
    (await cookies()).set(cookieName, data.token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: process.env.DATABASE_URL ? '/' : '/admin',
      maxAge: data.expiresIn,
    });
    return { ok: true, value: null };
  } catch {
    return failed('Sign-in is unavailable. Try again later.');
  }
}
export async function recover(email: string): Promise<Result<null>> {
  if (!z.email().max(254).safeParse(email).success) return failed('Enter a valid administrator email.');
  if (!configured()) return failed('Password recovery is not connected. No email was requested.');
  try {
    const r = await request('auth/recover', { method: 'POST', body: JSON.stringify({ email }) }, false);
    return r.status === 202 ? { ok: true, value: null } : failed('Recovery is unavailable. Try again later.');
  } catch {
    return failed('Recovery is unavailable. Try again later.');
  }
}
export async function logout() {
  try {
    if (configured()) await request('auth/logout', { method: 'POST' });
  } catch {
    /* Always expire this browser session. */
  }
  (await cookies()).set(cookieName, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: process.env.DATABASE_URL ? '/' : '/admin',
    maxAge: 0,
  });
}
export async function mutate(raw: unknown, attempt: string): Promise<Result<Receipt>> {
  const c = command.safeParse(raw);
  if (!c.success || !z.uuid().safeParse(attempt).success)
    return failed('Check the required fields and try again.');
  const v = c.data;
  const scope = scopes[v.op.split('.')[0]];
  const perms: Scope[] = [scope];
  if (scope === 'orders') perms.push('pii');
  if (v.op === 'import.finish') perms.push('catalogue');
  const denied = await allow(perms);
  if (denied) return failed(denied.state === 'offline' ? disconnected : denied.message);
  const invalid = checkCommand(v);
  if (invalid.length) return failed(invalid.join(' '));
  if (v.op !== 'import.start' && 'ref' in v && v.ref && v.op.startsWith('import.')) {
    const j = await getJob(v.ref.id);
    if (j.state !== 'ready' || j.value.revision !== v.ref.revision) return failed(statusMessage(409));
    if (['cancelled', 'published'].includes(j.value.stages.approval)) return failed('This job is closed.');
    if (
      v.op === 'import.review' &&
      v.approved &&
      !j.value.reviews.some((r) => r.id === v.id && r.permission === 'granted')
    )
      return failed('Only permission-cleared reviews can be approved.');
    if (v.op === 'import.image' && v.action === 'approve') {
      const im = j.value.images.find((i) => i.slot === v.slot);
      if (
        !j.value.rightsConfirmed ||
        im?.status !== 'ready' ||
        !im.photo ||
        im.photo.width !== im.photo.height ||
        !v.alt
      )
        return failed('A rights-cleared square output and description are required.');
    }
    if (v.op === 'import.retry' && j.value.stages[v.stage] !== 'failed')
      return failed('Only failed tasks may be retried.');
    if (
      v.op === 'import.images' &&
      (j.value.images.length || ['queued', 'running', 'ready'].includes(j.value.stages.images))
    )
      return failed('An initial set already exists. Regenerate an individual frame instead.');
    if (v.op === 'import.finish' && v.intent === 'publish') {
      const e = importIssues(v.draft, j.value);
      if (e.length) return failed(e.join(' '));
    } else if (v.op === 'import.content' && !verifiedFacts(j.value.facts).length)
      return failed('Verify source facts first.');
  }
  try {
    const r = await request('commands', {
      method: 'POST',
      headers: { 'idempotency-key': attempt },
      body: JSON.stringify(
        v.op === 'settings.save' ? { ...v, value: settings.shape[v.section].parse(v.value) } : v,
      ),
    });
    if (!r.ok) {
      if (process.env.DATABASE_URL) {
        const data = await r.json().catch(() => null);
        if (typeof data?.error?.message === 'string') return failed(data.error.message);
      }
      return failed(statusMessage(r.status));
    }
    const accepted = receipt.parse(await r.json());
    if (
      queued(v)
        ? r.status !== 202 || accepted.outcome !== 'queued'
        : ![200, 201].includes(r.status) || accepted.outcome !== 'applied'
    )
      return failed(serviceError);
    if (accepted.outcome === 'applied') {
      if (
        v.op.startsWith('product.') ||
        v.op === 'stock.adjust' ||
        v.op === 'review.moderate' ||
        v.op === 'import.finish'
      )
        updateTag('storefront-catalogue');
      if (v.op === 'settings.save') updateTag('storefront-settings');
    }
    return { ok: true, value: accepted };
  } catch {
    return failed(serviceError);
  }
}
export async function uploadPhoto(data: FormData): Promise<Result<Photo>> {
  if (!(data instanceof FormData)) return failed('Choose an image to upload.');
  const purpose = data.get('purpose');
  if (!['product', 'reference', 'logo'].includes(String(purpose)) || data.get('rights') !== 'confirmed')
    return failed('Confirm image usage rights before uploading.');
  const denied = await allow([
    purpose === 'product' ? 'catalogue' : purpose === 'reference' ? 'imports' : 'settings',
  ]);
  if (denied) return failed(denied.state === 'offline' ? disconnected : denied.message);
  const f = data.get('file');
  if (
    !(f instanceof File) ||
    f.size > 4 * 1024 * 1024 ||
    f.size < 12 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(f.type)
  )
    return failed('Choose a JPEG, PNG or WebP image up to 4 MB.');
  try {
    const b = Buffer.from(await f.slice(0, 12).arrayBuffer());
    if (
      !(
        (f.type === 'image/jpeg' && b.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) ||
        (f.type === 'image/png' && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
        (f.type === 'image/webp' &&
          b.toString('ascii', 0, 4) === 'RIFF' &&
          b.toString('ascii', 8, 12) === 'WEBP')
      )
    )
      return failed('The file contents do not match the image type.');
    const body = new FormData();
    body.set('purpose', String(purpose));
    body.set('rights', 'confirmed');
    body.set('file', f);
    const r = await request('media', { method: 'POST', body });
    return r.ok ? { ok: true, value: photo.parse(await r.json()) } : failed(statusMessage(r.status));
  } catch {
    return failed(serviceError);
  }
}
export async function refreshJob(id: string) {
  if (!key.safeParse(id).success) return { state: 'missing' as const, message: 'Invalid job identifier.' };
  return getJob(id);
}

function cleanSearch(kind: 'orders' | 'customers', v: ListQuery) {
  const input = z
    .object({
      q: z.string().max(150),
      status: z.string(),
      category: z.string(),
      sort: z.string(),
      customerId: z.string(),
      page: z.int().positive().max(999999),
    })
    .parse(v);
  return listQuery(kind, { ...input, page: String(input.page) });
}
export async function findOrders(v: ListQuery) {
  return privateOrderSearch(cleanSearch('orders', v));
}
export async function findCustomers(v: ListQuery) {
  return privateCustomerSearch(cleanSearch('customers', v));
}
