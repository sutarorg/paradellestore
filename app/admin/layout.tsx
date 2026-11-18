import type { Metadata } from 'next';
import './studio.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { default: 'Merchant studio | PARADELLE', template: '%s · PARADELLE Studio' },
  description: 'Private PARADELLE merchant workspace.',
  robots: { index: false, follow: false },
  alternates: null,
  openGraph: null,
  twitter: null,
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
