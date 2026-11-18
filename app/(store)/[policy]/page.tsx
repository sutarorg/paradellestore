import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Crumbs, PageHead, ArrowLink } from '@/components/ui';
import { DevicePrivacy } from '@/components/device-shopping';
import { policies } from '@/lib/policies';
import { policyLinks } from '@/lib/content';
import { getSettings } from '@/lib/gateway';
import { pageMeta } from '@/lib/seo';
export const dynamicParams = false;
export const revalidate = 60;
export function generateStaticParams() {
  return Object.keys(policies).map((policy) => ({ policy }));
}
type Props = { params: Promise<{ policy: string }> };
export async function generateMetadata({ params }: Props) {
  const { policy } = await params;
  const p = policies[policy];
  return p ? pageMeta(p.title, p.lead, `/${policy}`) : {};
}
export default async function PolicyPage({ params }: Props) {
  const { policy } = await params;
  const p = Object.hasOwn(policies, policy) ? policies[policy] : null;
  if (!p) notFound();
  const settings = await getSettings();
  const sections = settings.policies[policy]?.length ? settings.policies[policy] : p.sections;
  return (
    <div className="frame standard-page">
      <Crumbs items={[{ label: p.title, href: `/${policy}` }]} />
      <PageHead title={p.title} kicker="Customer care" lead={p.lead} />
      <div className="reading-layout">
        <article className="prose">
          {sections.map((s) => (
            <section key={s.title}>
              <h2>{s.title}</h2>
              <p>{s.body}</p>
            </section>
          ))}
          {policy === 'privacy-policy' && <DevicePrivacy />}
          {(policy === 'terms' || policy === 'privacy-policy') && settings.businessName && (
            <section>
              <h2>Business details</h2>
              <p>
                {[settings.businessName, settings.businessAddress, settings.registration]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </section>
          )}
          {settings.supportEmail && (
            <p>
              Contact: <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a>
            </p>
          )}
          <ArrowLink href="/contact">Customer care</ArrowLink>
        </article>
        <aside className="care-sidebar">
          <div className="eyebrow">Care directory</div>
          {policyLinks.map(([href, label]) => (
            <Link href={href} key={href} aria-current={href === `/${policy}` ? 'page' : undefined}>
              {label}
            </Link>
          ))}
          <Link href="/track-order">Track an order</Link>
        </aside>
      </div>
    </div>
  );
}
