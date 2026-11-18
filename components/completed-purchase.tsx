'use client';
import { useEffect, useState } from 'react';
import type { Receipt } from '@/lib/contracts';
import { measure } from '@/lib/measurement';
export function CompletedPurchase({ order }: { order: Receipt }) {
  const [feedback, set] = useState(''),
    [busy, work] = useState(false);
  useEffect(() => {
    const send = () =>
      measure(
        'purchase',
        order.items
          .filter((i) => i.productId)
          .map((i) => ({
            item_id: i.productId || '',
            quantity: i.quantity,
            price: (i.revenuePaise ?? i.lineTotalPaise) / i.quantity / 100,
          })),
        order.items.reduce((n, i) => n + (i.revenuePaise ?? i.lineTotalPaise), 0) / 100,
        { quoteId: order.quoteId, reference: order.reference },
      );
    send();
    window.addEventListener('paradelle:metrics-ready', send);
    return () => window.removeEventListener('paradelle:metrics-ready', send);
  }, [order]);
  if (!order.reviewEligible || !order.items.some((i) => i.productId)) return null;
  return (
    <details className="info-detail">
      <summary>Review a delivered piece</summary>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          work(true);
          try {
            const r = await fetch('/api/reviews', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                quoteId: order.quoteId,
                productId: f.get('piece'),
                rating: Number(f.get('rating')),
                body: f.get('body'),
              }),
            });
            set(
              r.ok
                ? 'Your review was received for moderation.'
                : r.status === 409
                  ? 'A review for this piece was already received.'
                  : 'Review could not be submitted.',
            );
          } catch {
            set('Connection interrupted. Please try again.');
          } finally {
            work(false);
          }
        }}
      >
        <label>
          Purchased piece
          <select name="piece">
            {[...new Map(order.items.filter((x) => x.productId).map((i) => [i.productId, i])).values()].map(
              (i) => (
                <option key={i.productId} value={i.productId}>
                  {i.name}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Rating
          <select name="rating" defaultValue="" required>
            <option value="" disabled>
              Choose rating
            </option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} / 5
              </option>
            ))}
          </select>
        </label>
        <label>
          Your review — please omit personal information
          <textarea required name="body" minLength={5} maxLength={1500} />
        </label>
        <button type="submit" className="btn btn-dark" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit review'}
        </button>
        <p role="status">{feedback}</p>
      </form>
    </details>
  );
}
