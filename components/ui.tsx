import Link from 'next/link';
import { ArrowRight, ArrowUpRight, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { site } from '@/lib/seo';
export function Bloom({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      className={className}
    >
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <path key={angle} d="M24 20C19 15 18 9 24 3C30 9 29 15 24 20Z" transform={`rotate(${angle} 24 24)`} />
      ))}
      <circle cx="24" cy="24" r="4" />
    </svg>
  );
}
export function Eyebrow({ children, decor = false }: { children: ReactNode; decor?: boolean }) {
  return (
    <div className="eyebrow">
      {decor && <span className="short-line" />}
      {children}
    </div>
  );
}
export function ArrowLink({
  href,
  children,
  diagonal = false,
  className = '',
}: {
  href: string;
  children: ReactNode;
  diagonal?: boolean;
  className?: string;
}) {
  const Icon = diagonal ? ArrowUpRight : ArrowRight;
  return (
    <Link href={href} className={`arrow-link ${className}`}>
      {children}
      <Icon size={16} />
    </Link>
  );
}
export function ButtonLink({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link className={`btn ${secondary ? 'btn-light' : 'btn-dark'}`} href={href}>
      {children}
      <ArrowRight size={17} />
    </Link>
  );
}
export function JsonLd({ value }: { value: unknown }) {
  return <script type="application/ld+json">{JSON.stringify(value).replace(/</g, '\\u003c')}</script>;
}
export function Crumbs({ items }: { items: { label: string; href: string }[] }) {
  const list = [{ label: 'Home', href: '/' }, ...items];
  return (
    <>
      <nav aria-label="Breadcrumb" className="crumbs">
        {list.map((v, i) => (
          <span key={v.href}>
            {i > 0 && <ChevronRight size={11} />}{' '}
            {i === list.length - 1 ? (
              <span aria-current="page">{v.label}</span>
            ) : (
              <Link href={v.href}>{v.label}</Link>
            )}
          </span>
        ))}
      </nav>
      <JsonLd
        value={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: list.map((v, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: v.label,
            item: new URL(v.href, site).href,
          })),
        }}
      />
    </>
  );
}
export function PageHead({ kicker, title, lead }: { kicker: string; title: string; lead?: string }) {
  return (
    <header className="page-head">
      <Eyebrow decor>{kicker}</Eyebrow>
      <h1>{title}</h1>
      {lead && <p>{lead}</p>}
    </header>
  );
}
export function EmptyState({
  icon,
  title,
  children,
  href = '/kurtis',
  cta = 'Explore all Kurtis',
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-symbol">{icon || <Bloom size={35} />}</span>
      <h2>{title}</h2>
      <p>{children}</p>
      <ButtonLink href={href}>{cta}</ButtonLink>
    </div>
  );
}
