import type { Metadata } from 'next';
export const site = process.env.SITE_ORIGIN || 'https://paradelle.store';
export function pageMeta(
  title: string,
  description: string,
  path: string,
  noindex = false,
  image = '/editorial/courtyard.webp',
): Metadata {
  return {
    metadataBase: new URL(site),
    title: `${title} | PARADELLE`,
    description,
    alternates: { canonical: path },
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      type: 'website',
      siteName: 'PARADELLE',
      locale: 'en_IN',
      url: path,
      title: `${title} | PARADELLE`,
      description,
      images: [{ url: image, alt: title }],
    },
    twitter: { card: 'summary_large_image', title: `${title} | PARADELLE`, description, images: [image] },
  };
}
