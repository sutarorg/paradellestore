import type { MetadataRoute } from 'next';
import { site } from '@/lib/seo';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/checkout', '/cart', '/order-success', '/wishlist', '/api/', '/admin'],
    },
    sitemap: new URL('/sitemap.xml', site).href,
  };
}
