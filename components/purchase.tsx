'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Ruler, ShoppingBag } from 'lucide-react';
import { addToBag, markViewed } from '@/lib/device';
import type { Product } from '@/lib/contracts';
import { money } from '@/lib/shop';
import { WishButton } from './wish-button';
import { Modal } from './modal';
export function Purchase({
  p,
}: {
  p: Pick<Product, 'slug' | 'name' | 'pricePaise' | 'variants' | 'sizeGuide'>;
}) {
  const [choice, setChoice] = useState('');
  const [guide, setGuide] = useState(false);
  const [notice, setNotice] = useState('');
  const [added, setAdded] = useState(false);
  const sizes = useRef<HTMLFieldSetElement>(null);
  const one = p.variants.length === 1 && !p.variants[0].size;
  const chosen = one ? p.variants[0] : p.variants.find((v) => v.id === choice);
  const sold = !p.variants.some((v) => v.stock > 0);
  useEffect(() => {
    markViewed(p.slug);
  }, [p.slug]);
  const add = () => {
    if (!chosen) {
      setNotice('Please select a size before adding this Kurti.');
      sizes.current?.querySelector<HTMLButtonElement>('button[data-size]:not(:disabled)')?.focus();
      return;
    }
    if (addToBag(p.slug, chosen.id, chosen.stock)) {
      setAdded(true);
      setNotice('');
    }
  };
  return (
    <div className="purchase">
      {!one && (
        <fieldset className="size-field" ref={sizes}>
          <legend>Select size</legend>
          <button type="button" className="guide-link underlink" onClick={() => setGuide(true)}>
            <Ruler size={14} />
            Size guide
          </button>
          <div className="size-row">
            {p.variants.map((v) => (
              <button
                type="button"
                key={v.id}
                data-size
                aria-pressed={choice === v.id}
                aria-label={`${v.size || 'One size'}${v.stock < 1 ? ', unavailable' : ''}`}
                disabled={v.stock < 1}
                className={`size-btn ${choice === v.id ? 'selected' : ''}`}
                onClick={() => {
                  setChoice(v.id);
                  setAdded(false);
                  setNotice('');
                }}
              >
                {v.size || 'One size'}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {notice && (
        <p className="field-error" role="alert">
          {notice}
        </p>
      )}
      <div className="purchase-bar">
        <button type="button" disabled={sold} className="btn btn-dark buy-btn" onClick={add}>
          <ShoppingBag size={17} />
          {sold ? 'Out of stock' : 'Add to bag'}
          {!sold && <span>— {money(p.pricePaise)}</span>}
        </button>
      </div>
      {added && (
        <Link href="/cart" className="added-link">
          Added to your bag · View bag <ArrowRight size={15} />
        </Link>
      )}
      <WishButton slug={p.slug} name={p.name} full />
      {guide && (
        <Modal title="Size guide" close={() => setGuide(false)} mode="sheet">
          <div className="prose">
            <p>
              Measure around the fullest part of your bust and hips, and the narrowest part of your waist.
              Keep the tape level and comfortably loose.
            </p>
            {p.sizeGuide ? (
              <>
                <h3>{p.sizeGuide.heading}</h3>
                <div className="table-scroll">
                  <table>
                    <caption className="sr-only">{p.name} size chart</caption>
                    <thead>
                      <tr>
                        {p.sizeGuide.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {p.sizeGuide.rows.map((r) => (
                        <tr key={r.join('|')}>
                          {r.map((c, j) => (
                            <td key={p.sizeGuide?.columns[j]}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {p.sizeGuide.note && <p>{p.sizeGuide.note}</p>}
              </>
            ) : (
              <p>
                A measurement chart is not available for this piece. If you are between sizes,{' '}
                <Link href="/contact">visit customer care</Link> before ordering.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
