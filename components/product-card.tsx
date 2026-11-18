import Link from 'next/link';
import { GarmentImage as Image } from './garment-image';
import { ArrowUpRight } from 'lucide-react';
import type { ProductTile } from '@/lib/contracts';
import { discount, money } from '@/lib/shop';
import { WishButton } from './wish-button';
export function ProductCard({ product: p }: { product: ProductTile }) {
  return (
    <article
      className="product-card"
      data-metric-item={p.id}
      data-metric-kind="tile"
      data-metric-price={p.pricePaise}
    >
      <div className="card-photo">
        <Link href={`/kurtis/${p.slug}`}>
          <Image
            src={p.images[0].src}
            alt={p.images[0].alt}
            fill
            sizes="(max-width: 639px) 46vw, (max-width: 1099px) 30vw, 22vw"
          />
        </Link>
        {(p.newArrival || p.bestseller) && (
          <span className="product-label">{p.newArrival ? 'New arrival' : 'Bestseller'}</span>
        )}
        <WishButton slug={p.slug} name={p.name} />
      </div>
      <div className="card-meta">
        <h3>
          <Link href={`/kurtis/${p.slug}`}>{p.name}</Link>
        </h3>
        <div className="price">
          {money(p.pricePaise)}
          {p.mrpPaise != null && discount(p.pricePaise, p.mrpPaise) > 0 && (
            <del>
              <span className="sr-only">MRP </span>
              {money(p.mrpPaise)}
            </del>
          )}
        </div>
        <Link className="card-view" href={`/kurtis/${p.slug}`}>
          View piece
          <ArrowUpRight size={13} />
        </Link>
      </div>
    </article>
  );
}
