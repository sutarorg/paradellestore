import { Checkout } from '@/components/checkout';
import { Crumbs, PageHead } from '@/components/ui';
import { getSettings } from '@/lib/gateway';
import { pageMeta } from '@/lib/seo';
export const metadata = pageMeta(
  'Guest Checkout',
  'Review delivery details and your final total before prepaid guest checkout.',
  '/checkout',
  true,
);
export default async function CheckoutPage() {
  const s = await getSettings();
  return (
    <div className="frame standard-page">
      <Crumbs
        items={[
          { label: 'Shopping bag', href: '/cart' },
          { label: 'Checkout', href: '/checkout' },
        ]}
      />
      <PageHead kicker="No account required" title="Guest Checkout" />
      <Checkout
        settings={{
          flatShippingPaise: s.flatShippingPaise,
          freeShippingFromPaise: s.freeShippingFromPaise,
          checkoutEnabled: s.checkoutEnabled,
          paymentMethods: s.paymentMethods,
        }}
      />
    </div>
  );
}
