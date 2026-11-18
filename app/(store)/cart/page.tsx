import { Crumbs, PageHead } from '@/components/ui';
import { Cart } from '@/components/device-shopping';
import { getSettings } from '@/lib/gateway';
import { pageMeta } from '@/lib/seo';
export const metadata = pageMeta(
  'Shopping Bag',
  'Review selected Kurtis, sizes and quantities in your shopping bag.',
  '/cart',
  true,
);
export default async function CartPage() {
  const s = await getSettings();
  return (
    <div className="frame standard-page">
      <Crumbs items={[{ label: 'Shopping bag', href: '/cart' }]} />
      <PageHead kicker="Your wardrobe" title="Shopping Bag" />
      <Cart
        settings={{ flatShippingPaise: s.flatShippingPaise, freeShippingFromPaise: s.freeShippingFromPaise }}
      />
    </div>
  );
}
