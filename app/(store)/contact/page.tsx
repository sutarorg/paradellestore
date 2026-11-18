import { ChevronDown, Package, RotateCcw, Truck } from 'lucide-react';
import Link from 'next/link';
import { ArrowLink, Crumbs, PageHead } from '@/components/ui';
import { MessageForm } from '@/components/forms';
import { getSettings } from '@/lib/gateway';
import { pageMeta } from '@/lib/seo';
export const metadata = pageMeta(
  'Contact & Customer Care',
  'Find help with a Paradelle order, shipping, returns, payments and guest shopping.',
  '/contact',
);
export default async function Contact() {
  const s = await getSettings();
  return (
    <div className="frame standard-page">
      <Crumbs items={[{ label: 'Customer care', href: '/contact' }]} />
      <PageHead
        kicker="Here to help"
        title="Customer Care"
        lead="Find the right place to start, whether you’re exploring a piece or following an order."
      />
      <div className="help-grid">
        {[
          {
            Icon: Package,
            title: 'Track an order',
            copy: 'Find the latest update using your checkout mobile number.',
            href: '/track-order',
          },
          {
            Icon: Truck,
            title: 'Shipping & delivery',
            copy: 'Understand delivery estimates, charges and address details.',
            href: '/shipping-policy',
          },
          {
            Icon: RotateCcw,
            title: 'Returns & refunds',
            copy: 'Check what to do if something isn’t quite right.',
            href: '/returns-refunds',
          },
        ].map(({ Icon, title, copy, href }) => (
          <div className="help-card" key={href}>
            <Icon size={26} />
            <h2>{title}</h2>
            <p>{copy}</p>
            <ArrowLink href={href}>
              Read more<span className="sr-only"> about {title}</span>
            </ArrowLink>
          </div>
        ))}
      </div>
      <div className="info-layout contact-lower">
        <section>
          <div className="eyebrow">Shopping guide</div>
          <h2>Common questions</h2>
          {[
            [
              'Do I need an account?',
              'No. You can browse, save favourites, check out and track an order without registering.',
            ],
            [
              'Which payment methods can I use?',
              'Orders are prepaid. The available UPI, card or net-banking options are shown by Razorpay before payment.',
            ],
            [
              'Where can I find size information?',
              'Each published piece has its own size selection and size guide. Check product-specific measurements where available rather than assuming sizes are identical across styles.',
            ],
            [
              'Why isn’t my bag on my other device?',
              'Your bag and wishlist are stored in the browser you used to save them. They are not linked to an account or synced between devices.',
            ],
          ].map(([q, a]) => (
            <details className="info-detail" key={q}>
              <summary>
                {q}
                <ChevronDown size={15} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
        <section className="contact-note">
          <div className="eyebrow">Direct enquiries</div>
          <h2>Get in touch</h2>
          {s.contactEnabled ? (
            <MessageForm kind="contact" />
          ) : (
            <p>
              {s.supportEmail || s.supportPhone
                ? 'Use the contact details below for help with a specific enquiry.'
                : 'Direct enquiries are not open at the moment. The care guides and order tracking are available without an account.'}
            </p>
          )}
          {s.supportEmail && (
            <a className="underlink" href={`mailto:${s.supportEmail}`}>
              {s.supportEmail}
            </a>
          )}
          {s.supportPhone && (
            <a className="underlink" href={`tel:${s.supportPhone.replace(/[^+\d]/g, '')}`}>
              {s.supportPhone}
            </a>
          )}
          {s.businessAddress && <p>{s.businessAddress}</p>}
          <p className="small muted">
            Never share a card number, UPI PIN or verification code in an enquiry. Read our{' '}
            <Link href="/privacy-policy">privacy policy</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
