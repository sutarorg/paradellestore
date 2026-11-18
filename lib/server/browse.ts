import { tx } from './base';
import { productSchema } from '../contracts';
import { type Query, type Facet, facetNames } from '../shop';
export async function browse(q: Query) {
  return tx(async (s) => {
    const conditions = [s`p.status='published'`];
    const available = s`exists(select 1 from product_variants v where v.product_id=p.id and v.is_available and v.stock_quantity>coalesce((select sum(r.quantity) from reservations r where r.variant_id=v.id and r.expires_at>now()),0))`;
    if (q.category !== 'all') conditions.push(s`p.category=${q.category}`);
    if (q.edit === 'new') conditions.push(s`p.published_at>now()-interval '30 days'`);
    if (q.edit === 'bestsellers') conditions.push(s`p.is_bestseller`);
    if (q.min) conditions.push(s`p.selling_price>=${Math.round(Number(q.min) * 100)}`);
    if (q.max) conditions.push(s`p.selling_price<=${Math.round(Number(q.max) * 100)}`);
    for (const word of q.q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 12))
      conditions.push(
        s`strpos(lower(concat_ws(' ',p.title,p.category,p.fabric,p.colour,p.occasion,p.description)),${word})>0`,
      );
    for (const k of ['fabric', 'colour', 'occasion', 'style'] as const)
      if (q[k].length)
        conditions.push(s`${k === 'style' ? s`initcap(p.category)` : s(k)}=any(${s.array(q[k])}::text[])`);
    if (q.size.length)
      conditions.push(
        s`exists(select 1 from product_variants v where v.product_id=p.id and v.is_available and v.size=any(${s.array(q.size)}::text[]) and v.stock_quantity>coalesce((select sum(quantity) from reservations where variant_id=v.id and expires_at>now()),0))`,
      );
    if (q.availability.length)
      conditions.push(
        s`(case when ${available} then 'In stock' else 'Out of stock' end)=any(${s.array(q.availability)}::text[])`,
      );
    const where = conditions.reduce((a, b) => s`${a} and ${b}`);
    const [n] = await s`select count(*)::int total from products p where ${where}`;
    const pages = Math.max(1, Math.ceil(n.total / 12)),
      page = Math.min(q.page, pages);
    const order =
      q.sort === 'price-desc'
        ? s`p.selling_price desc`
        : q.sort === 'price-asc'
          ? s`p.selling_price asc`
          : q.sort === 'newest'
            ? s`p.published_at desc`
            : s`p.is_featured desc,p.published_at desc`;
    const rows =
      await s`with ids as materialized(select p.id,row_number() over(order by ${order},p.id) pos from products p where ${where} order by ${order},p.id limit 12 offset ${(page - 1) * 12}) select v.product from ids join published_catalogue v on v.id=ids.id order by ids.pos`;
    const facets =
      await s`select distinct f.k,f.v from products p cross join lateral(values ('fabric',p.fabric),('colour',p.colour),('occasion',p.occasion),('style',initcap(p.category)),('availability',case when ${available} then 'In stock' else 'Out of stock' end)) f(k,v) where p.status='published' and f.v<>'' union select distinct 'size',v.size from product_variants v join products p on p.id=v.product_id where p.status='published' and v.is_available and v.stock_quantity>coalesce((select sum(quantity) from reservations where variant_id=v.id and expires_at>now()),0) order by 1,2`;
    const options = Object.fromEntries(
      facetNames.map((k) => [k, facets.filter((r) => r.k === k).map((r) => String(r.v))]),
    ) as Record<Facet, string[]>;
    return {
      items: rows.map((r) => productSchema.parse(r.product)),
      total: n.total,
      page,
      pages,
      options,
      unavailable: false,
    };
  });
}
