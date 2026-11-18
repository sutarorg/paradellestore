import type { MetadataRoute } from 'next';
import { sitemapRecords } from '@/lib/gateway';
import { publicPages, categories, categoryHref } from '@/lib/content';
import { site } from '@/lib/seo';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await sitemapRecords();
  return [
    ...publicPages,
    ...categories
      .filter((c) => c.slug !== 'all' && products.some((p) => p.category === c.slug))
      .map((c) => categoryHref(c.slug)),
    ...products.map((p) => `/kurtis/${p.slug}`),
  ].map((p) => ({ url: new URL(p, site).href }));
}
