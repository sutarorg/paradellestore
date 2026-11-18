import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import localFont from 'next/font/local';
import { pageMeta } from '@/lib/seo';
import './globals.css';
const serif = localFont({
  src: [
    {
      path: '../node_modules/@fontsource-variable/cormorant-garamond/files/cormorant-garamond-latin-wght-normal.woff2',
      style: 'normal',
      weight: '300 700',
    },
    {
      path: '../node_modules/@fontsource-variable/cormorant-garamond/files/cormorant-garamond-latin-wght-italic.woff2',
      style: 'italic',
      weight: '300 700',
    },
  ],
  variable: '--editorial',
  display: 'swap',
  fallback: ['Georgia'],
});
const sans = localFont({
  src: '../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2',
  variable: '--sans',
  weight: '100 1000',
  display: 'swap',
  fallback: ['Arial'],
});
export const metadata = pageMeta(
  'Contemporary Indian Kurtis for Women',
  'Discover PARADELLE: a considered collection of contemporary women’s Kurtis, from everyday cotton to graceful Anarkali silhouettes.',
  '/',
);
export const viewport: Viewport = { themeColor: '#49372f', width: 'device-width', initialScale: 1 };
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={`${serif.variable} ${sans.variable}`}>
      <body id="top">{children}</body>
    </html>
  );
}
