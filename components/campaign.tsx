'use client';
import { getImageProps } from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, MoveRight } from 'lucide-react';
const campaigns = [
  {
    image: 'courtyard',
    mobile: 'courtyard-mobile',
    alt: 'An Indian woman in an ivory floral Kurti and maroon dupatta in a sunlit sandstone courtyard',
    kicker: 'The heritage edit',
    title: 'Effortless',
    italic: 'Elegance',
    line: 'Timeless Kurtis for every you.',
    href: '/kurtis',
    button: 'Shop now',
    series: 'The courtyard series',
  },
  {
    image: 'cotton-campaign',
    mobile: 'cotton-campaign',
    alt: 'Indigo botanical cotton styling among sunlit courtyard arches',
    kicker: 'The cotton edit',
    title: 'Everyday',
    italic: 'Poetry',
    line: 'An ode to cotton and unhurried mornings.',
    href: '/kurtis?category=cotton',
    button: 'Explore cotton',
    series: 'The cotton study',
  },
  {
    image: 'anarkali-campaign',
    mobile: 'anarkali-campaign',
    alt: 'A softly flared sage Anarkali framed by weathered haveli arches',
    kicker: 'The occasion edit',
    title: 'Grace in',
    italic: 'Motion',
    line: 'Discover the Anarkali silhouette.',
    href: '/kurtis?category=anarkali',
    button: 'Explore Anarkali',
    series: 'The silhouette study',
  },
];
export function Campaign() {
  const [i, setI] = useState(0);
  const s = campaigns[i];
  const desktop = getImageProps({
    src: `/editorial/${s.image}.webp`,
    alt: s.alt,
    width: 1792,
    height: 592,
    sizes: '100vw',
    loading: 'eager',
  }).props;
  const mobile = getImageProps({
    src: `/editorial/${s.mobile}.webp`,
    alt: s.alt,
    width: 756,
    height: 592,
    sizes: '100vw',
  }).props;
  return (
    <section
      className={`campaign slide-${i}`}
      aria-label="Editorial campaigns"
      aria-roledescription="carousel"
    >
      <picture className="campaign-art">
        <source media="(max-width: 639px)" srcSet={mobile.srcSet} sizes="100vw" />
        {/* getImageProps supplies Next's responsive, optimised sources for this art-directed picture. */}
        <img {...desktop} alt={s.alt} fetchPriority={i === 0 ? 'high' : 'auto'} />
      </picture>
      <div className="campaign-shade" />
      <div className="frame campaign-frame">
        <div className="campaign-copy" key={i}>
          <div className="hero-eyebrow">
            <span />
            {s.kicker}
          </div>
          <h1>
            {s.title}
            <em>{s.italic}</em>
          </h1>
          <p>{s.line}</p>
          <Link className="campaign-cta" href={s.href}>
            {s.button}
            <MoveRight size={22} />
          </Link>
        </div>
        <div className="campaign-foot">
          <fieldset className="campaign-position" aria-label={`Campaign ${i + 1} of 3`}>
            <span>0{i + 1}</span>
            <div className="segments">
              {campaigns.map((item, n) => (
                <button
                  type="button"
                  key={item.title}
                  onClick={() => setI(n)}
                  aria-label={`Show ${item.kicker}`}
                  aria-pressed={n === i}
                  className={n === i ? 'on' : ''}
                >
                  <i />
                </button>
              ))}
            </div>
            <span>03</span>
          </fieldset>
          <div className="campaign-controls">
            <span className="plate">{s.series}</span>
            <button
              type="button"
              className="circle-btn"
              aria-label="Previous campaign"
              onClick={() => setI((i + 2) % 3)}
            >
              <ArrowLeft size={17} />
            </button>
            <button
              type="button"
              className="circle-btn"
              aria-label="Next campaign"
              onClick={() => setI((i + 1) % 3)}
            >
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        Campaign {i + 1} of 3: {s.kicker}
      </span>
    </section>
  );
}
