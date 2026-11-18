// Isolated transport fixtures. Not imported by application code. Never contact a paid endpoint in this suite.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { fresh, mac } from '../lib/server/base';
export async function isolatedProviders(staffId: string) {
  const original = globalThis.fetch;
  const image = await sharp({ create: { width: 128, height: 128, channels: 3, background: '#dcc7b2' } })
    .webp()
    .toBuffer();
  const authUser = {
    id: staffId,
    email: `${staffId}@example.test`,
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const token = `${[
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: staffId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: 'authenticated',
      session_id: randomUUID(),
    },
  ]
    .map((o) => Buffer.from(JSON.stringify(o)).toString('base64url'))
    .join('.')}.${fresh()}`;
  const password = fresh();
  const cfg = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://isolated.supabase.test',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'isolated-public-key',
    SUPABASE_SERVICE_ROLE_KEY: fresh(),
  };
  Object.assign(process.env, cfg);
  const files = new Set<string>(['product/isolated.webp']);
  const tasks = new Map<string, string>();
  const failedPolls = new Set<string>();
  const orderAmounts = new Map<string, number>();
  const calls: string[] = [];
  let imageSubmits = 0;
  const stub: typeof fetch = async (input, init) => {
    const u = new URL(input instanceof Request ? input.url : String(input));
    if (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return original(input, init);
    const req = new Request(input, init);
    const p = u.pathname;
    calls.push(`${u.hostname}${p}`);
    if (u.hostname === 'isolated.supabase.test') {
      if (p === '/auth/v1/token') {
        const b = await req.json();
        if (b.email !== authUser.email || b.password !== password)
          return Response.json({ message: 'denied' }, { status: 400 });
        return Response.json({
          access_token: token,
          token_type: 'bearer',
          refresh_token: fresh(),
          expires_in: 3600,
          user: authUser,
        });
      }
      if (p === '/auth/v1/user' && req.headers.get('authorization') === `Bearer ${token}`)
        return Response.json(authUser);
      if (p === '/auth/v1/logout') return new Response(null, { status: 204 });
      if (p.includes('/storage/v1/')) {
        assert.equal(req.headers.get('authorization'), `Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}`);
        const path = p.split('/product-images/')[1];
        if (p.includes('/object/sign/'))
          return Response.json({ signedURL: `/object/sign/product-images/${path}?token=${fresh()}` });
        if (req.method === 'POST') {
          assert.ok((await req.arrayBuffer()).byteLength > 12);
          files.add(path);
          return Response.json({ Key: path });
        }
        if (req.method === 'GET' && files.has(path))
          return new Response(new Uint8Array(image), { headers: { 'content-type': 'image/webp' } });
        return Response.json({ error: 'not found' }, { status: 404 });
      }
    }
    if (u.hostname === 'queue.fal.run') {
      assert.equal(req.headers.get('authorization'), `Key ${process.env.FAL_KEY}`);
      if (req.method === 'POST') {
        const b = await req.json();
        if (p.endsWith('/edit')) {
          assert.equal(b.image_size, 'square_hd');
          assert.equal(b.num_images, 1);
          assert.equal(b.image_urls.length, 1);
          assert.ok(b.image_urls[0].startsWith('https://isolated.supabase.test/storage/'));
          imageSubmits++;
        }
        const id = randomUUID(),
          url = `https://queue.fal.run/test/app/requests/${id}`;
        tasks.set(id, p);
        return Response.json({ request_id: id, status_url: `${url}/status`, response_url: url });
      }
      const id = p.split('/requests/')[1]?.split('/')[0];
      assert.ok(tasks.has(id));
      if (failedPolls.has(id)) return Response.json({ error: 'isolated transient outage' }, { status: 503 });
      if (p.endsWith('/status')) return Response.json({ status: 'COMPLETED' });
      return Response.json(
        tasks.get(id)?.endsWith('/edit')
          ? { images: [{ url: `https://v3b.fal.media/files/${id}.webp` }] }
          : { output: '["description","fabric","colour"]' },
      );
    }
    if (u.hostname === 'v3b.fal.media') {
      assert.equal(req.headers.get('authorization'), null);
      return new Response(new Uint8Array(image));
    }
    if (u.hostname === 'api.razorpay.com') {
      assert.ok(req.headers.get('authorization')?.startsWith('Basic '));
      if (p === '/v1/orders' && req.method === 'POST') {
        const b = await req.json();
        const id = `order_${b.receipt.replaceAll('-', '')}`;
        orderAmounts.set(id, b.amount);
        return Response.json({ ...b, id });
      }
      if (p.startsWith('/v1/payments/pay_')) {
        const id = `order_${p.split('pay_')[1]}`;
        return Response.json({
          id: id.replace('order_', 'pay_'),
          order_id: id,
          amount: orderAmounts.get(id),
          currency: 'INR',
          status: 'captured',
          captured: true,
          method: 'upi',
        });
      }
    }
    throw new Error(`Unexpected test transport: ${u.hostname} ${p}`);
  };
  globalThis.fetch = stub;
  return {
    calls,
    image,
    files,
    failedPolls,
    email: authUser.email,
    password,
    token,
    images: () => imageSubmits,
    sign: (id: string) => mac(`${id}|${id.replace('order_', 'pay_')}`, process.env.RAZORPAY_KEY_SECRET || ''),
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
