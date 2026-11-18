import sharp from 'sharp';
import { supabase, grants } from './auth';
import { need, tx, first, uid, audit, json } from './base';
import type { Viewer } from '../admin/models';
export const asPhoto = (a: Record<string, unknown>) => ({
  id: String(a.id),
  src: `/admin/media/${a.id}`,
  alt: String(a.alt || ''),
  width: Number(a.width),
  height: Number(a.height),
});
export async function storeImage(
  bytes: Buffer,
  purpose: 'reference' | 'logo' | 'product' | 'generated',
  actor: Viewer,
  alt = '',
  square = false,
  mime?: string,
) {
  need(bytes.length <= (purpose === 'generated' ? 12 : 4) * 1024 * 1024, 413, 'Image too large.');
  const img = sharp(bytes, { limitInputPixels: 25000000, failOn: 'error' });
  const meta = await img.metadata();
  need(
    (!mime || mime === `image/${meta.format}`) &&
      ['jpeg', 'png', 'webp'].includes(meta.format ?? '') &&
      (meta.pages ?? 1) === 1 &&
      (!square || meta.width === meta.height),
    422,
    'Unsupported image.',
  );
  const { data, info } = await img
    .rotate()
    .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  need(data.length <= 4194304, 413, 'Processed image too large.');
  const id = crypto.randomUUID(),
    bucket = purpose === 'logo' ? 'site-assets' : 'product-images',
    path = `${purpose}/${id}.webp`;
  const store = supabase(true).storage.from(bucket);
  const { error } = await store.upload(path, data, {
    contentType: 'image/webp',
    upsert: false,
    cacheControl: '0',
  });
  need(!error, 502, 'Storage upload was not confirmed.');
  const paths = [path];
  const renditions: Record<string, string> = {};
  try {
    if (purpose === 'product' || purpose === 'generated')
      for (const width of [320, 640, 960]) {
        if (width >= info.width) continue;
        const resized = await sharp(data).resize({ width }).webp({ quality: 80 }).toBuffer();
        const name = path.replace('.webp', `.w${width}.webp`);
        const saved = await store.upload(name, resized, {
          contentType: 'image/webp',
          upsert: false,
          cacheControl: '0',
        });
        need(!saved.error, 502, 'Rendition upload not confirmed.');
        paths.push(name);
        renditions[width] = name;
      }
    return await tx(async (s) => {
      await grants(s, actor.id, [
        purpose === 'logo' ? 'settings' : purpose === 'product' ? 'catalogue' : 'imports',
      ]);
      const a = first(
        await s`insert into assets(id,bucket,storage_path,purpose,width,height,alt,rights_confirmed,created_by,renditions) values(${id},${bucket},${path},${purpose},${info.width},${info.height},${alt},true,${actor.id},${json(renditions)}::text::jsonb) returning *`,
      );
      await audit(s, actor.id, 'Image stored', 'asset', id, purpose);
      return asPhoto(a);
    });
  } catch (e) {
    await store.remove(paths);
    throw e;
  }
}
export async function deliverImage(id: string, v?: Viewer, width?: string) {
  const r = await tx(async (s) => {
    const a = first(await s`select * from assets where id=${uid(id)}`);
    if (v) {
      if (a.purpose === 'reference') await grants(s, v.id, ['imports']);
      else if (a.purpose === 'logo') await grants(s, v.id, ['settings']);
      else
        need(
          v.permissions.includes('catalogue') ||
            v.permissions.includes('imports') ||
            (v.permissions.includes('orders') && v.permissions.includes('pii')),
          403,
          'Image access denied.',
        );
    } else {
      const approved =
        await s`select 1 from product_images i join products p on p.id=i.product_id where i.asset_id=${id} and p.status='published' union all select 1 from store_settings where sections#>>'{identity,logo,id}'=${id} limit 1`;
      need(approved.length, 404, 'Image not found.');
    }
    return a;
  });
  const { data, error } = await supabase(true)
    .storage.from(r.bucket)
    .download((width && r.renditions?.[width]) || r.storage_path);
  need(!error && data, 502, 'Storage unavailable.');
  return new Response(data, {
    headers: {
      'content-type': 'image/webp',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}
