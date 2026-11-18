import type { MetadataRoute } from 'next';
import { site } from '@/lib/seo';
export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV === 'preview') return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/api/media/'],
      disallow: ['/checkout', '/cart', '/order-success', '/wishlist', '/api/', '/signals', '/admin'],
    },
    sitemap: new URL('/sitemap.xml', site).href,
  };
}
