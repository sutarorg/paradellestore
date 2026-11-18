import { MobileNav } from '@/components/mobile-nav';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CollectionControls, Retry } from '@/components/discovery';
import { ArrowLink, Bloom, Crumbs, Eyebrow } from '@/components/ui';
import { ProductCard } from '@/components/product-card';
import { getCatalogue } from '@/lib/gateway';
import { categories } from '@/lib/content';
import { discover, getFacets, parseQuery, queryHref, type Params } from '@/lib/shop';
import { pageMeta } from '@/lib/seo';
function titleFor(q: ReturnType<typeof parseQuery>) {
  return q.q
    ? 'Search results'
    : q.edit === 'new'
      ? 'New Arrivals'
      : q.edit === 'bestsellers'
        ? 'Bestselling Kurtis'
        : (categories.find((c) => c.slug === q.category)?.name ?? 'All Kurtis');
}
export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }) {
  const q = parseQuery(await searchParams);
  const base = parseQuery({ category: q.category, edit: q.edit, page: String(q.page) });
  const { products } = await getCatalogue();
  const canonical = queryHref({ ...base, page: discover(products, base).page });
  return pageMeta(
    `${titleFor(q)} for Women`,
    'Explore women’s Kurtis by fabric, size, colour and silhouette. Find cotton, rayon, straight and Anarkali styles in the Paradelle collection.',
    canonical,
    !!q.q,
  );
}
export default async function Collection({ searchParams }: { searchParams: Promise<Params> }) {
  const [raw, { products, unavailable }] = await Promise.all([searchParams, getCatalogue()]);
  const q = parseQuery(raw);
  const { items, total, page, pages } = discover(products, q);
  const title = titleFor(q);
  const filtered = !!(
    q.q ||
    q.min ||
    q.max ||
    q.fabric.length ||
    q.size.length ||
    q.colour.length ||
    q.style.length ||
    q.occasion.length ||
    q.availability.length
  );
  return (
    <div className="frame collection-page">
      <Crumbs items={[{ label: title, href: queryHref(q) }]} />
      <header className="collection-head">
        <Eyebrow decor>The collection</Eyebrow>
        <h1>{title}</h1>
        <p>{q.q ? `Searching for “${q.q}”` : 'Timeless styles, for every mood and moment.'}</p>
      </header>
      <CollectionControls q={q} options={getFacets(products)} hasSort={!!raw.sort} />
      <div className="result-caption" role="status">
        {unavailable ? 'Collection unavailable' : `${total} ${total === 1 ? 'product' : 'products'}`}
        {pages > 1 && (
          <span>
            Page {page} of {pages}
          </span>
        )}
      </div>
      {items.length > 0 ? (
        <div className="product-grid">
          {items.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      ) : (
        <div className="collection-empty">
          <div className="collection-empty-copy">
            <Bloom size={36} />
            <Eyebrow>
              {unavailable
                ? 'Connection interrupted'
                : filtered
                  ? 'Refine your search'
                  : 'A note from the atelier'}
            </Eyebrow>
            <h2>
              {unavailable
                ? 'We couldn’t load the collection.'
                : filtered
                  ? 'No pieces match this edit.'
                  : 'An edit in the making.'}
            </h2>
            <p>
              {unavailable
                ? 'Please try again in a moment.'
                : filtered
                  ? 'Try a different fabric, remove a filter or explore all Kurtis.'
                  : 'There are no pieces in this collection just yet. In the meantime, discover the story behind PARADELLE.'}
            </p>
            {unavailable ? (
              <Retry />
            ) : (
              <ArrowLink href={filtered || q.category !== 'all' || q.edit ? '/kurtis' : '/about'}>
                {filtered
                  ? 'Clear search & filters'
                  : q.category !== 'all' || q.edit
                    ? 'Explore all Kurtis'
                    : 'Discover our story'}
              </ArrowLink>
            )}
          </div>
          {!unavailable && !filtered && (
            <div className="empty-editorial">
              <Image
                src="/editorial/heritage-portrait.webp"
                alt="Paradelle editorial: an ivory floral silhouette in a courtyard"
                fill
                sizes="(max-width:639px) 92vw, 35vw"
              />
              <span>PARADELLE EDITORIAL</span>
            </div>
          )}
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Collection pages" className="pagination">
          {page > 1 && (
            <Link className="btn btn-outline" href={queryHref({ ...q, page: page - 1 })}>
              <ChevronLeft size={15} /> Previous
            </Link>
          )}
          <span>
            {page} / {pages}
          </span>
          {page < pages && (
            <Link className="btn btn-outline" href={queryHref({ ...q, page: page + 1 })}>
              Next <ChevronRight size={15} />
            </Link>
          )}
        </nav>
      )}
      <MobileNav path={q.edit === 'new' ? '/kurtis?edit=new' : '/kurtis'} />
    </div>
  );
}
