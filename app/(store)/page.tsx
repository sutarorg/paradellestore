import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Feather, Heart, Layers, LockKeyhole, Mail } from 'lucide-react';
import { Campaign } from '@/components/campaign';
import { ArrowLink, Bloom, Eyebrow } from '@/components/ui';
import { ProductCard } from '@/components/product-card';
import { MessageForm } from '@/components/forms';
import { categories, categoryHref, editionLinks } from '@/lib/content';
import { getCatalogue, getSettings } from '@/lib/gateway';
import type { Product } from '@/lib/contracts';
export const revalidate = 60;
function MerchShelf({
  title,
  kicker,
  copy,
  products,
  href,
  unavailable,
}: {
  title: string;
  kicker: string;
  copy: string;
  products: Product[];
  href: string;
  unavailable: boolean;
}) {
  return (
    <section className="merch-shelf">
      <div className="section-head">
        <div>
          <Eyebrow decor>{kicker}</Eyebrow>
          <h2>{title}</h2>
        </div>
        <ArrowLink href={href}>View all</ArrowLink>
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.slice(0, 4).map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      ) : (
        <div className="empty-shelf">
          <Bloom size={30} />
          <p>
            {unavailable ? 'The collection couldn’t be loaded. Please visit the shop to try again.' : copy}
          </p>
        </div>
      )}
    </section>
  );
}
export default async function Home() {
  const [{ products, unavailable }, settings] = await Promise.all([getCatalogue(), getSettings()]);
  const reviews = products.flatMap((p) => p.reviews.map((r) => ({ ...r, product: p }))).slice(0, 3);
  return (
    <>
      <Campaign />
      <section className="category-section" id="categories">
        <div className="frame">
          <div className="section-head">
            <div>
              <Eyebrow decor>The style directory</Eyebrow>
              <h2>Shop by Category</h2>
            </div>
            <ArrowLink href="/kurtis">Explore all Kurtis</ArrowLink>
          </div>
          <div className="category-rail">
            {categories.map((c) => (
              <Link key={c.slug} href={categoryHref(c.slug)} className="category">
                <span className="category-ring">
                  <span>
                    <Image
                      src={`/editorial/${c.slug}.webp`}
                      width={256}
                      height={256}
                      alt={c.alt}
                      sizes="(max-width:639px) 68px,(max-width:900px) 100px, 150px"
                    />
                  </span>
                </span>
                <span className="category-name">{c.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <div className="frame shelves">
        <MerchShelf
          title="New Arrivals"
          kicker="Just in"
          copy="Our next edit is taking shape. New Kurtis will appear here when they arrive."
          products={products.filter((p) => p.newArrival)}
          href="/kurtis?edit=new"
          unavailable={unavailable}
        />
        <MerchShelf
          title="Bestselling Kurtis"
          kicker="Most loved"
          copy="This space is reserved for the pieces our shoppers return to. There are no bestsellers to show yet."
          products={products.filter((p) => p.bestseller)}
          href="/kurtis?edit=bestsellers"
          unavailable={unavailable}
        />
      </div>
      <section className="edits-section" id="collections">
        <div className="frame">
          <div className="section-head">
            <div>
              <Eyebrow decor>The Paradelle edit</Eyebrow>
              <h2>Curated Collections</h2>
            </div>
            <span className="quiet-caption">Notes on silhouette & fabric</span>
          </div>
          <div className="edits-grid">
            {editionLinks.map((c, i) => (
              <Link href={c.href} className="edit-card" key={c.href}>
                <Image
                  src={`/editorial/${c.image}.webp`}
                  alt={
                    i
                      ? 'Olive Anarkali silhouette in a sandstone courtyard'
                      : 'Indigo prints and ivory cotton in the afternoon light'
                  }
                  fill
                  sizes="(max-width:639px) 90vw, 45vw"
                />
                <div className="edit-shade" />
                <div className="edit-content">
                  <div className="eyebrow">Style study / 0{i + 1}</div>
                  <h3>{c.name}</h3>
                  <p>{c.note}</p>
                </div>
                <span className="edit-arrow">
                  <ArrowUpRight />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="values-section frame">
        <Eyebrow decor>Our point of view</Eyebrow>
        <h2>Why you’ll love PARADELLE</h2>
        <div className="values-grid">
          {[
            { Icon: Layers, title: 'Kurti specialists', copy: 'One garment, thoughtfully explored.' },
            { Icon: Feather, title: 'Considered style', copy: 'From quiet mornings to celebrations.' },
            { Icon: Heart, title: 'Your own edit', copy: 'Save favourites without an account.' },
            { Icon: LockKeyhole, title: 'Guest checkout', copy: 'A simple, prepaid shopping experience.' },
          ].map(({ Icon, title, copy }) => (
            <div key={title}>
              <Icon size={25} />
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </section>
      {reviews.length > 0 && (
        <section className="frame review-shelf">
          <Eyebrow>Verified purchase reviews</Eyebrow>
          <h2>From our customers</h2>
          {reviews.map((r) => (
            <blockquote key={r.product.slug + r.id}>
              <p>{r.body}</p>
              <cite>
                {r.displayName} · <Link href={`/kurtis/${r.product.slug}`}>{r.product.name}</Link>
              </cite>
            </blockquote>
          ))}
        </section>
      )}
      <section className="letter">
        <div className="frame letter-inner">
          <div>
            <Eyebrow>
              <Mail size={14} /> Notes from PARADELLE
            </Eyebrow>
            <h2>The Paradelle Letter</h2>
            <p>Stories of silhouette, print and the everyday Kurti.</p>
          </div>
          {settings.newsletterEnabled ? (
            <MessageForm kind="newsletter" />
          ) : (
            <div className="letter-status">
              <p>Email subscriptions aren’t open yet.</p>
              <ArrowLink href="/about">Read our story</ArrowLink>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
