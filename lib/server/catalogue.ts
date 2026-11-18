import { productSchema, settingsSchema, slugSchema } from '../contracts';
import { productRecord, settings, blankSettings, type Draft, type Viewer, type Ref } from '../admin/models';
import { draftIssues, meeshoUrl } from '../admin/rules';
import { commercePrice } from '../../src/lib/pricing';
import { gatewayReady } from './checkout';
import { json, need, first, type Tx, tx, uid, iso } from './base';
export async function publicSettings() {
  return tx(async (s) => {
    const r = first(await s`select * from store_settings`);
    const cfg = settings.parse({ ...blankSettings(), ...r.sections });
    return settingsSchema.parse({
      announcement: cfg.identity.announcement || undefined,
      identityName: cfg.identity.name,
      logo: cfg.identity.logo
        ? { src: `/api/media/${cfg.identity.logo.id}`, alt: cfg.identity.logo.alt || cfg.identity.name }
        : null,
      seoTitle: cfg.seo.title || null,
      seoDescription: cfg.seo.description || null,
      social: Object.fromEntries(Object.entries(cfg.social).filter(([, v]) => !!v)),
      supportEmail: cfg.contact.email || null,
      supportPhone: cfg.contact.phone || null,
      businessName: cfg.contact.businessName || null,
      businessAddress: cfg.contact.address || null,
      registration: cfg.contact.registration || null,
      flatShippingPaise: r.shipping_paise,
      freeShippingFromPaise: r.free_from_paise,
      checkoutEnabled: gatewayReady() && r.shipping_paise != null && r.serviceable_pins.length > 0,
      trackingEnabled: !!process.env.APP_HMAC_SECRET,
      policies: cfg.policies,
    });
  });
}
export async function publicList(q = '', category = '', page = 1, size = 24, slug?: string) {
  if (slug) slugSchema.parse(slug);
  return tx(async (s) => {
    const where = s`(${slug ?? null}::text is null or slug=${slug ?? null}) and (${category}='' or category=${category}) and (${q}='' or strpos(lower(concat_ws(' ',title,description,fabric,category,colour,occasion)),lower(${q}))>0)`;
    const [count] = await s`select count(*)::int total from published_catalogue where ${where}`;
    const current = Math.min(page, Math.max(1, Math.ceil(count.total / size)));
    const rows =
      await s`select product from published_catalogue where ${where} order by is_featured desc,published_at desc,id limit ${size} offset ${(current - 1) * size}`;
    return {
      products: rows.map((r) => productSchema.parse(r.product)),
      total: count.total,
      page: current,
      pageSize: size,
    };
  });
}
export async function categories() {
  return tx(
    (s) =>
      s`select category,count(*)::int as count from products where status='published' group by category order by category`,
  );
}
export async function publishedReviews(id: string, page: number) {
  return tx(async (s) => {
    first(await s`select id from products where id=${uid(id)} and status='published'`);
    return s`select r.id,r.rating,r.review_text body,r.verification_status='purchase' as "verifiedPurchase",r.source from product_reviews r where r.product_id=${id} and r.publication_status='published' order by r.created_at desc limit 20 offset ${(page - 1) * 20}`;
  });
}
export async function getDraft(s: Tx, id: string) {
  const p = first(await s`select * from products where id=${uid(id)}`);
  const variants =
    await s`select id,size,coalesce(sku,'') sku,stock_quantity stock,is_available enabled,colour,variant_price_override as "priceOverride" from product_variants where product_id=${id} order by created_at,id`;
  const images =
    await s`select a.id,'/admin/media/'||a.id src,i.alt_text alt,a.width,a.height from product_images i join assets a on a.id=i.asset_id where i.product_id=${id} order by image_order`;
  return productRecord.parse({
    id,
    revision: p.revision,
    status: p.status,
    updatedAt: iso(p.updated_at),
    draft: {
      ...p.details,
      title: p.title,
      slug: p.slug ?? '',
      sku: p.sku ?? '',
      category: p.category,
      description: p.description,
      shortDescription: p.short_description,
      pricePaise: p.selling_price,
      sourceUrl: p.source_url ?? '',
      sourcePrice: p.source_price,
      compareAt: p.compare_at_price,
      featured: p.is_featured,
      bestseller: p.is_bestseller,
      seoTitle: p.seo_title,
      seoDescription: p.seo_description,
      variants: variants.map((v) => ({ ...v, colour: v.colour ?? '' })),
      images,
    },
  });
}
export async function locked(
  s: Tx,
  table: 'products' | 'product_variants' | 'orders' | 'product_reviews' | 'product_import_jobs',
  r: Ref,
) {
  const row = first(await s`select * from ${s(table)} where id=${uid(r.id)} for update`);
  need(row.revision === r.revision, 409, 'The record has changed.');
  return row;
}
export async function adjust(s: Tx, id: string, after: number, reason: string, actor: Viewer) {
  const v = first(
    await s`select v.*,p.title from product_variants v join products p on p.id=v.product_id where v.id=${uid(id)} for update of v`,
  );
  if (v.stock_quantity === after) return;
  const [holds] =
    await s`select coalesce(sum(quantity),0)::int n from reservations where variant_id=${id} and expires_at>now()`;
  need(after >= holds.n && after <= 1000000, 409, 'Stock adjustment would invalidate a reservation.');
  await s`update product_variants set stock_quantity=${after},updated_at=now(),revision=revision+1 where id=${id}`;
  await s`insert into stock_history(variant_id,product_id,product,size,sku,before_qty,delta,after_qty,reason,actor) values(${id},${v.product_id},${v.title},${v.size},${v.sku ?? ''},${v.stock_quantity},${after - v.stock_quantity},${after},${reason},${actor.name})`;
}
export async function saveProduct(
  s: Tx,
  actor: Viewer,
  d: Draft,
  ref: Ref | null,
  status: 'draft' | 'published' | 'archived',
  jobId?: string,
) {
  const publish = status === 'published';
  const issues = draftIssues(d, publish);
  need(!issues.length, 422, issues.join(' '));
  if (d.slug) slugSchema.parse(d.slug);
  if (d.sourceUrl) need(meeshoUrl(d.sourceUrl), 422, 'Invalid source URL.');
  if (d.compareAt)
    need(
      d.mrpVerified && d.pricePaise && d.compareAt > d.pricePaise,
      422,
      'A verified higher MRP is required.',
    );
  if (publish && d.bestseller) {
    need(ref, 422, 'Bestsellers need recorded sales.');
    const proof =
      await s`select 1 from (select l.product_id from order_items l join orders o on o.id=l.order_id where o.payment_status in ('paid','partially-refunded') and o.created_at>now()-interval '90 days' group by l.product_id order by sum(l.quantity) desc,l.product_id limit 10) best where best.product_id=${ref.id}`;
    need(proof.length, 422, 'No qualifying bestseller sales in the last 90 days.');
  }
  if (publish) {
    const calc = commercePrice(d.costs);
    need(
      calc.ok &&
        d.pricePaise &&
        d.pricePaise >= calc.min &&
        d.variants.every((v) => v.priceOverride == null || v.priceOverride >= calc.min),
      422,
      'Selling prices must cover the verified cost base.',
    );
  }
  const id = ref?.id ?? crypto.randomUUID();
  if (ref) {
    await locked(s, 'products', ref);
    if (publish && !jobId) {
      const [j] = await s`select status from product_import_jobs where product_id=${id}`;
      need(!j || j.status === 'published', 409, 'Complete the original import approval first.');
    }
  } else await s`insert into products(id,title) values(${id},${d.title})`;
  const { variants, images, ...details } = d;
  await s`update products set title=${d.title},slug=${d.slug || null},sku=${d.sku || null},short_description=${d.shortDescription},description=${d.description},category=${d.category},fabric=${d.attrs.fabric},pattern=${d.attrs.pattern},sleeve_type=${d.attrs.sleeve},neck_style=${d.attrs.neckline},kurti_length=${d.attrs.length},occasion=${d.attrs.occasion},colour=${d.attrs.colour},care_instructions=${d.attrs.care},seo_title=${d.seoTitle},seo_description=${d.seoDescription},source_url=${d.sourceUrl ? meeshoUrl(d.sourceUrl) : null},source_price=${d.sourcePrice ?? d.costs.source},purchase_cost=${d.costs.source},selling_price=${d.pricePaise},compare_at_price=${d.compareAt ?? null},status=${status},is_featured=${!!d.featured},is_bestseller=${!!d.bestseller},published_at=case when ${publish} then coalesce(published_at,now()) else published_at end,details=${json(details)}::text::jsonb,revision=revision+${ref ? 1 : 0},updated_at=now() where id=${id}`;
  const ids = variants.map((v) => uid(v.id));
  need(new Set(ids).size === ids.length, 422, 'Duplicate variants.');
  const old = await s`select * from product_variants where product_id=${id} order by id for update`;
  for (const v of old)
    if (!ids.includes(v.id)) {
      await adjust(s, v.id, 0, 'Variant removed', actor);
      await s`delete from product_variants where id=${v.id}`;
    }
  for (const v of variants) {
    const exists = old.some((o) => o.id === v.id);
    if (exists)
      await s`update product_variants set sku=${v.sku || null},size=${v.size},colour=${v.colour || null},variant_price_override=${v.priceOverride ?? null},is_available=${v.enabled},updated_at=now(),revision=revision+1 where id=${v.id}`;
    else
      await s`insert into product_variants(id,product_id,sku,size,colour,stock_quantity,is_available,variant_price_override) values(${v.id},${id},${v.sku || null},${v.size},${v.colour || null},0,${v.enabled},${v.priceOverride ?? null})`;
    await adjust(s, v.id, v.stock, 'Catalogue edit', actor);
  }
  await s`delete from product_images where product_id=${id}`;
  for (const [n, im] of images.entries()) {
    const a = first(
      await s`select * from assets where id=${uid(im.id)} and purpose in ('product','generated') and rights_confirmed`,
      'Upload a permitted product image first.',
    );
    const [work] =
      a.purpose === 'generated'
        ? await s`select w.job_id from work_queue w join product_import_jobs j on j.id=w.job_id where w.result_asset=${a.id} and (j.id=${jobId ?? null}::uuid or j.product_id=${id}) and exists(select 1 from jsonb_array_elements(j.images) e where e#>>'{photo,id}'=${String(a.id)} and (e->>'approved')::boolean)`
        : [];
    need(a.purpose !== 'generated' || work, 422, 'Generated image requires source job approval.');
    await s`insert into product_images(product_id,asset_id,storage_path,image_order,image_type,alt_text,generation_provider,generation_job_id) values(${id},${a.id},${a.storage_path},${n},${a.purpose},${im.alt},${work ? 'fal' : null},${work?.job_id ?? null})`;
  }
  return first(await s`select id,revision from products where id=${id}`);
}
export async function selectedCatalogue(kind: 'home' | 'selection' | 'related', keys: string[] = []) {
  return tx(async (s) => {
    const filter =
      kind === 'selection'
        ? s`slug=any(${s.array(keys)}::text[])`
        : kind === 'related'
          ? s`category=${keys[0]} and slug<>${keys[1]}`
          : s`is_bestseller or published_at>now()-interval '30 days'`;
    const rows =
      kind === 'home'
        ? await s`(select product from published_catalogue where is_bestseller order by is_featured desc,published_at desc limit 4) union (select product from published_catalogue where published_at>now()-interval '30 days' order by published_at desc limit 4)`
        : await s`select product from published_catalogue where ${filter} order by is_featured desc,published_at desc limit ${kind === 'selection' ? 220 : 4}`;
    return rows.map((r) => productSchema.parse(r.product));
  });
}
