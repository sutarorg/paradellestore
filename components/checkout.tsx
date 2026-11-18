'use client';
import { useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, LockKeyhole, ShoppingBag } from 'lucide-react';
import { regions } from '@/lib/india';
import { measure } from '@/lib/measurement';
import { openCheckout } from '@/lib/standard-checkout';
import { getQuote, startPayment } from '@/lib/actions';
import type { Address, Quote, Settings } from '@/lib/contracts';
import { rememberCheckout, saveAddress, toast, useDevice, useReady } from '@/lib/device';
import { fingerprint, formatMobile, money, resolveBag, validMobile } from '@/lib/shop';
import { BagSummary, LineSummary, ResolveStatus, useSelection } from './device-shopping';
import { EmptyState } from './ui';
type CheckoutSettings = Pick<
  Settings,
  'flatShippingPaise' | 'freeShippingFromPaise' | 'checkoutEnabled' | 'paymentMethods'
>;
export function Checkout({ settings }: { settings: CheckoutSettings }) {
  const d = useDevice();
  const ready = useReady();
  const look = useSelection(d.cart.map((l) => l.slug));
  const lines = resolveBag(d.cart, look.products);
  if (!ready || look.loading || look.error)
    return <ResolveStatus loading={!ready || look.loading} error={look.error} retry={look.retry} />;
  if (!d.cart.length)
    return (
      <EmptyState title="Start with a piece you love." icon={<ShoppingBag size={32} />}>
        Your bag is empty. Once you’ve chosen a Kurti, you can check out here as a guest.
      </EmptyState>
    );
  if (lines.some((l) => !l.valid))
    return (
      <EmptyState title="Your bag needs a quick review." href="/cart" cta="Review my bag">
        A selection or quantity is no longer available. Update your bag before checkout.
      </EmptyState>
    );
  return (
    <div className="commerce-layout">
      {settings.checkoutEnabled ? (
        <CheckoutForm key={fingerprint(d.cart)} settings={settings} />
      ) : (
        <EmptyState
          icon={<LockKeyhole size={30} />}
          title="Payments are not open right now."
          href="/cart"
          cta="Return to your bag"
        >
          Your selections are saved in this browser. No delivery details or payment are needed until checkout
          is available.
        </EmptyState>
      )}
      <BagSummary lines={lines} settings={settings}>
        <LineSummary cart={d.cart} products={look.products} />
        <Link href="/cart" className="underlink">
          Edit bag
        </Link>
      </BagSummary>
    </div>
  );
}
function CheckoutForm({ settings }: { settings: CheckoutSettings }) {
  const d = useDevice();
  const [save, setSave] = useState(!!d.address);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const quotePanel = useRef<HTMLDivElement>(null);
  const attempt = useRef<string | null>(null);
  const saved = d.address?.value;
  const [shippingAddress, setShippingAddress] = useState<Address | null>(null);
  const pay = async () => {
    if (!quote) return;
    if (Date.parse(quote.expiresAt) <= Date.now()) {
      setQuote(null);
      setFeedback('This quote has expired. Please review the total again.');
      return;
    }
    setBusy(true);
    setFeedback('');
    try {
      const r = await startPayment(quote.id);
      if (!r.ok) {
        setFeedback(r.message);
        setQuote(null);
        return;
      }
      await rememberCheckout(quote.id, fingerprint(d.cart));
      setFeedback(
        await openCheckout(r.value, () =>
          measure(
            'add_payment_info',
            d.cart.map((l) => ({ item_id: l.variantId, quantity: l.quantity })),
            quote.totalPaise / 100,
          ),
        ),
      );
    } catch {
      setFeedback('We couldn’t open payment. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <form
        className="checkout-form stack-form"
        onChange={() => {
          attempt.current = null;
          setQuote(null);
          setFeedback('');
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !settings.checkoutEnabled) return;
          const form = e.currentTarget;
          const fields = new FormData(form);
          const a: Address = {
            fullName: String(fields.get('fullName')).trim(),
            mobile: formatMobile(String(fields.get('mobile'))),
            address: String(fields.get('address')).trim(),
            city: String(fields.get('city')).trim(),
            state: String(fields.get('state')).trim(),
            pin: String(fields.get('pin')).trim(),
          };
          if (!validMobile(a.mobile)) {
            setFeedback('Enter a valid 10-digit Indian mobile number.');
            form.querySelector<HTMLInputElement>('[name="mobile"]')?.focus();
            return;
          }
          setBusy(true);
          setFeedback('');
          try {
            attempt.current ??= crypto.randomUUID();
            const r = await getQuote(
              d.cart,
              a,
              fields.get('terms') === 'on',
              String(fields.get('email') ?? '').trim() || undefined,
              String(fields.get('coupon') ?? '').trim() || undefined,
              attempt.current,
            );
            if (!r.ok) {
              setFeedback(r.message);
              return;
            }
            setShippingAddress(a);
            setQuote(r.value);
            measure(
              'begin_checkout',
              d.cart.map((l) => ({ item_id: l.variantId, quantity: l.quantity })),
              r.value.totalPaise / 100,
            );
            saveAddress(save ? a : null);
            requestAnimationFrame(() => quotePanel.current?.focus());
          } catch {
            setFeedback('Your total could not be confirmed. Please try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <legend>Delivery details</legend>
          <p className="muted">No registration or sign-in. Email is optional.</p>
          <div className="two-fields">
            <label>
              Full name
              <input
                name="fullName"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                defaultValue={saved?.fullName}
              />
            </label>
            <label>
              Mobile number
              <input
                name="mobile"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                required
                maxLength={18}
                defaultValue={saved?.mobile}
              />
            </label>
          </div>
          <label>
            Email (optional)
            <input type="email" name="email" autoComplete="email" maxLength={254} />
          </label>
          <label>
            Complete delivery address
            <textarea
              name="address"
              autoComplete="street-address"
              rows={3}
              minLength={8}
              maxLength={350}
              required
              defaultValue={saved?.address}
            />
          </label>
          <div className="two-fields">
            <label>
              City
              <input
                name="city"
                autoComplete="address-level2"
                maxLength={100}
                required
                defaultValue={saved?.city}
              />
            </label>
            <label>
              State / union territory
              <input
                list="checkout-regions"
                name="state"
                autoComplete="address-level1"
                required
                maxLength={100}
                defaultValue={saved?.state}
              />
            </label>
          </div>
          <label>
            PIN code
            <input
              name="pin"
              autoComplete="postal-code"
              pattern="[1-9][0-9]{5}"
              inputMode="numeric"
              maxLength={6}
              required
              title="Enter a six-digit Indian PIN code"
              defaultValue={saved?.pin}
            />
          </label>
          <datalist id="checkout-regions">
            {regions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <label className="check-label">
            <input
              type="checkbox"
              checked={save}
              onChange={(e) => {
                setSave(e.target.checked);
                if (!e.target.checked) saveAddress(null);
              }}
            />
            Save this address for 30 days on this device. Don’t select this on a shared device.
          </label>
          {saved && (
            <button
              type="button"
              className="underlink"
              onClick={() => {
                if (saveAddress(null)) toast('Address removed from browser storage.');
                setSave(false);
              }}
            >
              Forget saved address
            </button>
          )}
        </fieldset>
        <label>
          Coupon (optional)
          <input name="coupon" maxLength={32} autoComplete="off" />
        </label>
        <section className="payment-note">
          <LockKeyhole size={20} />
          <div>
            <h3>Secure prepaid payment</h3>
            <p>
              {settings.paymentMethods.length
                ? `Available methods: ${settings.paymentMethods.join(', ')}.`
                : 'Available payment methods are shown by Razorpay.'}{' '}
              Card details are never collected by this storefront.
            </p>
          </div>
        </section>
        <label className="check-label">
          <input name="terms" type="checkbox" disabled={busy} required />
          <span>
            I agree to the{' '}
            <Link href="/terms" target="_blank">
              terms
            </Link>{' '}
            and acknowledge the{' '}
            <Link href="/privacy-policy" target="_blank">
              privacy policy
            </Link>
            .
          </span>
        </label>
        {settings.checkoutEnabled ? (
          <button type="submit" className="btn btn-dark" disabled={busy}>
            {busy ? 'Please wait…' : 'Review final total'}
            <ArrowRight size={16} />
          </button>
        ) : (
          <p className="status-panel">
            Checkout is not accepting payments right now. No order will be placed.
          </p>
        )}
      </form>
      {quote && shippingAddress && (
        <div className="quote-panel" tabIndex={-1} ref={quotePanel}>
          <div className="eyebrow">Before you pay</div>
          <h2>Your final total</h2>
          <dl className="totals">
            <div>
              <dt>Items</dt>
              <dd>{money(quote.subtotalPaise)}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>{money(quote.shippingPaise)}</dd>
            </div>
            {quote.discountPaise > 0 && (
              <div>
                <dt>Discount</dt>
                <dd>−{money(quote.discountPaise)}</dd>
              </div>
            )}
            {quote.taxPaise != null && (
              <div>
                <dt>GST included</dt>
                <dd>{money(quote.taxPaise)}</dd>
              </div>
            )}
            <div className="total">
              <dt>Payable total</dt>
              <dd>{money(quote.totalPaise)}</dd>
            </div>
          </dl>
          <p>
            Delivering to {shippingAddress.city}, {shippingAddress.pin}. {quote.delivery}
          </p>
          <button type="button" className="btn btn-dark" disabled={busy} onClick={pay}>
            <LockKeyhole size={17} />
            {busy ? 'Opening payment…' : `Pay ${money(quote.totalPaise)}`}
          </button>
        </div>
      )}
      {feedback && (
        <Link className="underlink" href="/order-success">
          Check confirmed payment on this device
        </Link>
      )}
      {feedback && (
        <p className="field-error" role="alert">
          {feedback}
        </p>
      )}
    </div>
  );
}
