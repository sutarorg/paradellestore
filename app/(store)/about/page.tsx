import { Gallery } from '@/components/product-gallery';
import { Bloom, ButtonLink, Crumbs, Eyebrow } from '@/components/ui';
import { pageMeta } from '@/lib/seo';
export const metadata = pageMeta(
  'Our Story',
  'Meet PARADELLE, an Indian womenswear destination devoted to the Kurti and the many ways it can be worn.',
  '/about',
);
export default function About() {
  return (
    <div className="frame standard-page">
      <Crumbs items={[{ label: 'Our story', href: '/about' }]} />
      <div className="story-layout">
        <div className="story-visual">
          <Gallery
            images={[
              {
                src: '/editorial/heritage-portrait.webp',
                alt: 'Ivory floral Kurti and a maroon dupatta in a sunlit haveli',
              },
              {
                src: '/editorial/cotton-portrait.webp',
                alt: 'Indigo botanical prints on ivory cotton, framed by courtyard arches',
              },
              {
                src: '/editorial/anarkali-portrait.webp',
                alt: 'Sage Anarkali silhouette in a weathered sandstone alcove',
              },
              {
                src: '/editorial/rose-portrait.webp',
                alt: 'Rose-print Kurti with a decorative neckline in dappled light',
              },
            ]}
          />
          <div className="lookbook-caption">
            <span>Campaign lookbook</span>
            <span>Four style studies</span>
          </div>
        </div>
        <article className="story-copy">
          <Eyebrow decor>Our story</Eyebrow>
          <h1>
            One silhouette.
            <br />
            <em>Endless expression.</em>
          </h1>
          <p className="standfirst">PARADELLE is a contemporary Indian destination devoted to the Kurti.</p>
          <p>
            A Kurti moves easily between the ordinary and the occasion: a quiet morning, a busy working day, a
            table set for celebration. That versatility is where our collection begins.
          </p>
          <p>
            We look at the details that give each piece its character. The line of a neckline. The rhythm of a
            botanical print. The way an Anarkali opens into a gentle flare. Rather than a wardrobe of
            everything, PARADELLE offers a closer look at one garment.
          </p>
          <Bloom size={30} />
          <p>
            Explore by fabric, follow a silhouette you already love, or save a piece to return to later. The
            edit is ours. The way you wear it is yours.
          </p>
          <ButtonLink href="/kurtis">Explore the collection</ButtonLink>
        </article>
      </div>
    </div>
  );
}
