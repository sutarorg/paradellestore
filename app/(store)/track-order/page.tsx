import { TrackForm } from '@/components/order';
import { Crumbs, PageHead, ArrowLink } from '@/components/ui';
import { pageMeta } from '@/lib/seo';
export const metadata = pageMeta(
  'Track Your Order',
  'Find the latest fulfilment update for your Paradelle order using your checkout mobile number.',
  '/track-order',
);
export default function TrackPage() {
  return (
    <div className="frame standard-page">
      <Crumbs items={[{ label: 'Track order', href: '/track-order' }]} />
      <div className="info-layout">
        <div>
          <PageHead
            kicker="Order care"
            title="Track Your Order"
            lead="Follow your Kurti from confirmation to delivery."
          />
          <div className="tracking-aside">
            <p>
              For your privacy, tracking shows a masked reference and shipment updates, never your full
              address.
            </p>
            <ArrowLink href="/contact">Visit customer care</ArrowLink>
          </div>
        </div>
        <TrackForm />
      </div>
    </div>
  );
}
