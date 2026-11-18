import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, Package, RotateCcw } from 'lucide-react';
import { getSelection } from '@/lib/gateway';
import { pageMeta, site } from '@/lib/seo';
import { availability, discount, money } from '@/lib/shop';
import { Gallery } from '@/components/product-gallery';
import { Purchase } from '@/components/purchase';
import { Crumbs, Eyebrow, JsonLd } from '@/components/ui';
import { ProductCard } from '@/components/product-card';
import { Retry } from '@/components/discovery';
export const revalidate = 60;
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const { products } = await getSelection('detail', slug);
  const p = products.find((x) => x.slug === slug);
  return p
    ? pageMeta(
        p.seoTitle || p.name,
        p.seoDescription || p.description.slice(0, 155),
        `/kurtis/${slug}`,
        false,
        p.images[0].src,
      )
    : pageMeta('Piece unavailable', 'This piece is not currently available.', `/kurtis/${slug}`, true);
}
export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const { products, unavailable } = await getSelection('detail', slug);
  if (unavailable)
    return (
      <div className="frame state-page">
        <h1>We couldn’t load this piece.</h1>
        <p>Please try again in a moment.</p>
        <Retry />
      </div>
    );
  const p = products.find((x) => x.slug === slug);
  if (!p) notFound();
  const saving = discount(p.pricePaise, p.mrpPaise);
  const related = (await getSelection('related', p.categories[0], p.slug)).products
    .filter((o) => o.slug !== slug && o.categories.some((c) => p.categories.includes(c)))
    .slice(0, 4);
  return (
    <div className="frame detail-page">
      <Crumbs
        items={[
          { label: 'All Kurtis', href: '/kurtis' },
          { label: p.name, href: `/kurtis/${slug}` },
        ]}
      />
      <div className="product-layout">
        <Gallery images={p.images} />
        <div
          className="product-information"
          data-metric-item={p.id}
          data-metric-kind="detail"
          data-metric-price={p.pricePaise}
        >
          <Eyebrow decor>The Paradelle collection</Eyebrow>
          <h1>{p.name}</h1>
          <div className="product-price">
            {money(p.pricePaise)}
            {p.mrpPaise != null && saving > 0 && (
              <>
                <del>MRP {money(p.mrpPaise)}</del>
                <small>{Math.floor((saving / p.mrpPaise) * 100)}% off</small>
              </>
            )}
          </div>
          {p.taxNote && <p className="small muted">{p.taxNote}</p>}
          <Purchase
            p={{
              slug: p.slug,
              name: p.name,
              pricePaise: p.pricePaise,
              variants: p.variants,
              sizeGuide: p.sizeGuide,
            }}
          />
          <details className="info-detail" open>
            <summary>
              Product details
              <ChevronDown size={16} />
            </summary>
            <p>{p.description}</p>
            <dl className="specs">
              {Object.entries({
                Fabric: p.fabric,
                Style: p.style,
                Colour: p.colour,
                ...p.specifications,
              }).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </details>
          <details className="info-detail">
            <summary>
              <span>
                <Package size={16} />
                Delivery
              </span>
              <ChevronDown size={16} />
            </summary>
            <p>
              {p.deliveryNote ||
                'Delivery estimates depend on your PIN code and will be confirmed before payment.'}
            </p>
            <Link className="underlink" href="/shipping-policy">
              Shipping policy
            </Link>
          </details>
          <details className="info-detail">
            <summary>
              <span>
                <RotateCcw size={16} />
                Returns & refunds
              </span>
              <ChevronDown size={16} />
            </summary>
            <p>{p.returnNote || 'Review the return terms for your purchase before placing an order.'}</p>
            <Link className="underlink" href="/returns-refunds">
              Read the return policy
            </Link>
          </details>
        </div>
      </div>
      {p.reviews.length > 0 && (
        <section className="review-shelf">
          <Eyebrow>From our customers</Eyebrow>
          <h2>Verified reviews</h2>
          {p.reviews.map((r) => (
            <blockquote key={r.id}>
              <strong>{r.rating} / 5</strong>
              <p>{r.body}</p>
              <cite>{r.displayName} · Verified purchase</cite>
            </blockquote>
          ))}
        </section>
      )}
      {p.sourceReviews.length > 0 && (
        <section className="review-shelf">
          <Eyebrow>Authorised source feedback</Eyebrow>
          <h2>From the original listing</h2>
          <p>Shared with permission. These are not verified PARADELLE purchases.</p>
          {p.sourceReviews.map((r) => (
            <blockquote key={r.id}>
              <strong>{r.rating} / 5</strong>
              <p>{r.body}</p>
              <cite>Source: {r.source}</cite>
            </blockquote>
          ))}
        </section>
      )}
      {related.length > 0 && (
        <section className="merch-shelf">
          <h2>You may also like</h2>
          <div className="product-grid">
            {related.map((o) => (
              <ProductCard key={o.slug} product={o} />
            ))}
          </div>
        </section>
      )}
      <JsonLd
        value={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: p.name,
          description: p.description,
          brand: { '@type': 'Brand', name: 'PARADELLE' },
          image: p.images.map((i) => new URL(i.src, site).href),
          color: p.colour,
          material: p.fabric,
          offers: {
            '@type': 'Offer',
            url: new URL(`/kurtis/${slug}`, site).href,
            priceCurrency: 'INR',
            price: (p.pricePaise / 100).toFixed(2),
            availability: `https://schema.org/${availability(p) ? 'InStock' : 'OutOfStock'}`,
          },
        }}
      />
    </div>
  );
}
