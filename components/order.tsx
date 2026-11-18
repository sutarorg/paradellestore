'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, PackageSearch, Truck } from 'lucide-react';
import { trackOrders } from '@/lib/actions';
import type { Tracking } from '@/lib/contracts';
import { validMobile } from '@/lib/shop';
import { settleBag } from '@/lib/device';
export function SettledBag({ quoteId }: { quoteId: string }) {
  useEffect(() => {
    settleBag(quoteId);
  }, [quoteId]);
  return null;
}
export function TrackForm() {
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [results, setResults] = useState<Tracking | null>(null);
  return (
    <div className="tracking-card">
      <div className="track-icon">
        <PackageSearch size={28} />
      </div>
      <h2>Find your order</h2>
      <p className="muted">
        Use the Indian mobile number entered at checkout. No account or verification code needed.
      </p>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setResults(null);
          setMessage('');
          if (!validMobile(number)) {
            setInvalid(true);
            setMessage('Enter a valid 10-digit Indian mobile number.');
            return;
          }
          setInvalid(false);
          setBusy(true);
          try {
            const r = await trackOrders(number);
            if (r.ok) setResults(r.value);
            else setMessage(r.message);
          } catch {
            setMessage('Tracking could not be reached. Please try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="track-mobile">Mobile number</label>
        <div className="phone-input">
          <span>+91</span>
          <input
            id="track-mobile"
            name="mobile"
            type="tel"
            autoComplete="tel-national"
            inputMode="tel"
            required
            maxLength={18}
            readOnly={busy}
            value={number}
            aria-invalid={invalid}
            aria-describedby={message ? 'tracking-message' : undefined}
            onChange={(e) => {
              setNumber(e.target.value);
              setMessage('');
              setResults(null);
              setInvalid(false);
            }}
          />
        </div>
        <button type="submit" className="btn btn-dark" disabled={busy}>
          {busy ? 'Checking…' : 'Track order'}
          <ArrowRight size={17} />
        </button>
      </form>
      <div aria-live="polite">
        {message && (
          <p id="tracking-message" className="form-message">
            {message}
          </p>
        )}
        {results &&
          (!results.length ? (
            <p className="form-message">
              There is no recent status to show for these details. For help, contact the store.
            </p>
          ) : (
            results.map((r) => (
              <article key={`${r.reference}:${r.items.join('|')}:${r.update}`} className="tracking-result">
                <div className="eyebrow">Order {r.reference}</div>
                <h3>
                  <Truck size={18} />
                  {r.status}
                </h3>
                <p>{r.items.join(' · ')}</p>
                <p>{r.update}</p>
                {r.trackingUrl ? (
                  <a className="arrow-link" href={r.trackingUrl} target="_blank" rel="noopener noreferrer">
                    {r.carrier || 'Carrier'} tracking
                    <ArrowRight size={14} />
                  </a>
                ) : (
                  <p className="small muted">Shipment tracking is not available yet.</p>
                )}
              </article>
            ))
          ))}
      </div>
    </div>
  );
}
