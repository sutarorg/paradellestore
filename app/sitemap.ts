import type { MetadataRoute } from 'next';
import { getCatalogue } from '@/lib/gateway';
import { publicPages, categories, categoryHref } from '@/lib/content';
import { site } from '@/lib/seo';
export const revalidate = 60;
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products } = await getCatalogue();
  return [
    ...publicPages,
    ...categories
      .filter((c) => c.slug !== 'all' && products.some((p) => p.categories.includes(c.slug)))
      .map((c) => categoryHref(c.slug)),
    ...products.map((p) => `/kurtis/${p.slug}`),
  ].map((p) => ({ url: new URL(p, site).href }));
}
