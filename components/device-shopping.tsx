'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GarmentImage as Image } from './garment-image';
import { ArrowRight, Heart, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { lookupProducts } from '@/lib/actions';
import type { CartLine, Result, Settings, ShopProduct } from '@/lib/contracts';
import {
  changeQuantity,
  forgetDevice,
  saveAddress,
  toast,
  toggleWish,
  useDevice,
  useReady,
} from '@/lib/device';
import { discount, money, resolveBag, shipping } from '@/lib/shop';
import { ButtonLink, EmptyState } from './ui';
import { ProductCard } from './product-card';
import { Modal } from './modal';
export function useSelection(slugs: string[]) {
  const key = [...new Set(slugs)].sort().join('|');
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<{ key: string; n: number; r: Result<ShopProduct[]> } | null>(null);
  useEffect(() => {
    let active = true;
    if (key)
      lookupProducts(key.split('|'))
        .then((r) => {
          if (active) setData({ key, n: attempt, r });
        })
        .catch(() => {
          if (active)
            setData({
              key,
              n: attempt,
              r: {
                ok: false,
                kind: 'unavailable',
                message: 'We couldn’t check these pieces. Please try again.',
              },
            });
        });
    return () => {
      active = false;
    };
  }, [key, attempt]);
  const result = data?.key === key && data.n === attempt ? data.r : null;
  return {
    loading: !!key && !result,
    products: result?.ok ? result.value : [],
    error: result && !result.ok ? result.message : '',
    retry: () => setAttempt((n) => n + 1),
  };
}
export const deviceCopy = 'Your bag, wishlist and preferences are saved in this browser, not across devices.';
export function DeviceNotice() {
  return (
    <p className="device-note">
      {deviceCopy} <Link href="/privacy-policy">Manage saved data</Link>
    </p>
  );
}
export function ResolveStatus({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  if (loading)
    return (
      <div className="status-panel" role="status">
        Checking your saved pieces…
      </div>
    );
  return (
    <div className="status-panel" role="alert">
      {error}
      <button type="button" className="underlink" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
export function BagSummary({
  lines,
  settings,
  children,
}: {
  lines: ReturnType<typeof resolveBag>;
  settings: Pick<Settings, 'flatShippingPaise' | 'freeShippingFromPaise'>;
  children?: React.ReactNode;
}) {
  const subtotal = lines.reduce((n, l) => n + (l.product?.pricePaise ?? 0) * l.quantity, 0);
  const saved = lines.reduce(
    (n, l) => n + (l.product ? discount(l.product.pricePaise, l.product.mrpPaise) : 0) * l.quantity,
    0,
  );
  const fee = shipping(subtotal, settings);
  const all = lines.every((l) => l.valid);
  return (
    <aside className="bag-summary">
      <div className="eyebrow">At a glance</div>
      <h2>Order summary</h2>
      <dl className="totals">
        <div>
          <dt>Item subtotal</dt>
          <dd>{money(subtotal + saved)}</dd>
        </div>
        {saved > 0 && (
          <div>
            <dt>Price reduction</dt>
            <dd>−{money(saved)}</dd>
          </div>
        )}
        <div>
          <dt>Shipping</dt>
          <dd>{fee === null ? 'Calculated at checkout' : money(fee)}</dd>
        </div>
        <div className="total">
          <dt>{fee === null ? 'Subtotal' : 'Estimated total'}</dt>
          <dd>{money(subtotal + (fee ?? 0))}</dd>
        </div>
      </dl>
      <p className="small muted">
        {all
          ? 'Your final payable total will be confirmed before payment.'
          : 'Please resolve unavailable pieces before checkout.'}
      </p>
      {children}
    </aside>
  );
}
export function Cart({
  settings,
}: {
  settings: Pick<Settings, 'flatShippingPaise' | 'freeShippingFromPaise'>;
}) {
  const { cart } = useDevice();
  const ready = useReady();
  const look = useSelection(cart.map((l) => l.slug));
  if (!ready || look.loading || look.error)
    return <ResolveStatus loading={!ready || look.loading} error={look.error} retry={look.retry} />;
  if (!cart.length)
    return (
      <>
        <EmptyState title="Your bag is empty." icon={<ShoppingBag size={32} />} cta="Explore the Kurtis">
          Find a silhouette you love and it will be waiting here.
        </EmptyState>
        <DeviceNotice />
      </>
    );
  const lines = resolveBag(cart, look.products);
  return (
    <>
      <div className="commerce-layout">
        <div className="bag-lines">
          {lines.map((l) => (
            <article className="bag-line" key={`${l.slug}|${l.variantId}`}>
              {l.product && (
                <Link href={`/kurtis/${l.slug}`} className="bag-img">
                  <Image src={l.product.images[0].src} alt={l.product.images[0].alt} fill sizes="95px" />
                </Link>
              )}
              <div className="bag-line-info">
                <h2>
                  {l.product ? (
                    <Link href={`/kurtis/${l.slug}`}>{l.product.name}</Link>
                  ) : (
                    'Piece no longer available'
                  )}
                </h2>
                <p>
                  {l.variant?.size
                    ? `Size: ${l.variant.size}`
                    : l.variant
                      ? 'One size'
                      : 'Unavailable selection'}
                </p>
                {l.product && <strong>{money(l.product.pricePaise)}</strong>}
                {!l.valid && (
                  <p className="field-error">
                    {l.variant?.stock
                      ? `Only ${l.variant.stock} available. Reduce the quantity to continue.`
                      : 'This selection is unavailable. Please remove it to continue.'}
                  </p>
                )}
                <div className="bag-line-actions">
                  <div className="stepper">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Decrease quantity of ${l.product?.name ?? 'piece'}`}
                      disabled={l.quantity <= 1}
                      onClick={() => changeQuantity(l, l.quantity - 1)}
                    >
                      <Minus size={14} />
                    </button>
                    <output aria-label="Quantity">{l.quantity}</output>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Increase quantity of ${l.product?.name ?? 'piece'}`}
                      disabled={l.quantity >= Math.min(99, l.variant?.stock ?? 0)}
                      onClick={() => changeQuantity(l, l.quantity + 1)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="underlink"
                    onClick={() => {
                      changeQuantity(l, 0);
                      toast('Piece removed from your bag.');
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}
          <Link href="/kurtis" className="arrow-link">
            Continue shopping
            <ArrowRight size={16} />
          </Link>
        </div>
        <BagSummary lines={lines} settings={settings}>
          {lines.every((l) => l.valid) && <ButtonLink href="/checkout">Proceed to checkout</ButtonLink>}
        </BagSummary>
      </div>
      <DeviceNotice />
    </>
  );
}
export function Wishlist() {
  const d = useDevice();
  const ready = useReady();
  const look = useSelection([...d.wishlist, ...d.recent]);
  if (!ready || look.loading || look.error)
    return <ResolveStatus loading={!ready || look.loading} error={look.error} retry={look.retry} />;
  const find = (slug: string) => look.products.find((p) => p.slug === slug);
  const recent = d.recent.flatMap((s) => find(s) || []);
  return (
    <>
      {d.wishlist.length ? (
        <div className="product-grid">
          {d.wishlist.map((s) => {
            const p = find(s);
            return p ? (
              <ProductCard product={p} key={s} />
            ) : (
              <div className="status-panel" key={s}>
                <p>A saved piece is no longer available.</p>
                <button type="button" onClick={() => toggleWish(s)} className="underlink">
                  Remove from wishlist
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Keep your favourites here."
          icon={<Heart size={34} />}
          cta="Discover the collection"
        >
          Tap the heart on a Kurti to save it for another day. No account needed.
        </EmptyState>
      )}
      {recent.length > 0 && (
        <section className="merch-shelf">
          <h2>Recently viewed</h2>
          <div className="product-grid">
            {recent.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        </section>
      )}
      <DeviceNotice />
    </>
  );
}
export function DevicePrivacy() {
  const d = useDevice();
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="privacy-tools">
      <h2>Your browser data</h2>
      <p>
        {deviceCopy} Clearing it will not cancel an order, erase a backend order record or unsubscribe an
        email address.
      </p>
      <div className="row-wrap">
        <button type="button" className="btn btn-outline" onClick={() => setConfirm(true)}>
          <Trash2 size={16} />
          Clear shopping data
        </button>
        {d.address && (
          <button
            type="button"
            className="underlink"
            onClick={() => {
              if (saveAddress(null)) toast('Saved address removed.');
            }}
          >
            Forget delivery address
          </button>
        )}
      </div>
      {confirm && (
        <Modal title="Clear this browser’s shopping data?" mode="sheet" close={() => setConfirm(false)}>
          <p className="muted">
            This removes the bag, wishlist, recently viewed pieces, shopping preferences and any saved address
            and receipt access on this browser. This can’t be undone.
          </p>
          <div className="dialog-actions">
            <button
              type="button"
              className="btn btn-outline"
              data-initial-focus
              onClick={() => setConfirm(false)}
            >
              Keep my data
            </button>
            <button
              type="button"
              className="btn btn-dark"
              onClick={async () => {
                forgetDevice();
                try {
                  const r = await fetch('/api/device/forget', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: '{}',
                  });
                  if (!r.ok) throw new Error();
                } catch {
                  toast('To remove receipt access too, clear this site in browser settings.');
                }
                setConfirm(false);
              }}
            >
              Clear data
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
export function LineSummary({ cart, products }: { cart: CartLine[]; products: ShopProduct[] }) {
  return (
    <ul className="line-summary">
      {resolveBag(cart, products).map((l) => (
        <li key={l.slug + l.variantId}>
          <span>
            {l.product?.name || 'Unavailable piece'}
            <small>
              {l.variant?.size ? `Size ${l.variant.size} · ` : ''}Qty {l.quantity}
            </small>
          </span>
          <span>{l.product ? money(l.product.pricePaise * l.quantity) : 'Unavailable'}</span>
        </li>
      ))}
    </ul>
  );
}
