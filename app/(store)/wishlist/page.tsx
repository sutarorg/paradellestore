import { MobileNav } from '@/components/mobile-nav';
import { Crumbs, PageHead } from '@/components/ui';
import { Wishlist } from '@/components/device-shopping';
import { pageMeta } from '@/lib/seo';
export const metadata = pageMeta(
  'Your Wishlist',
  'Revisit your favourite Paradelle Kurtis saved in this browser.',
  '/wishlist',
  true,
);
export default function WishlistPage() {
  return (
    <div className="frame standard-page">
      <Crumbs items={[{ label: 'Wishlist', href: '/wishlist' }]} />
      <PageHead kicker="Your personal edit" title="Wishlist" />
      <Wishlist />
      <MobileNav path="/wishlist" />
    </div>
  );
}
