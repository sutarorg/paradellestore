'use client';
import type { z } from 'zod';
import type { standardSessionSchema } from './contracts';
type Session = z.infer<typeof standardSessionSchema>;
type Success = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type Options = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  theme: { color: string };
  handler: (p: Success) => void;
  modal: { ondismiss: () => void };
};
declare global {
  interface Window {
    Razorpay?: new (o: Options) => { open: () => void; on: (k: string, f: () => void) => void };
  }
}
let script: Promise<void> | undefined;
function load() {
  if (window.Razorpay) return Promise.resolve();
  if (!script)
    script = new Promise<void>((ok, bad) => {
      const el = document.createElement('script');
      const fail = () => {
        script = undefined;
        el.remove();
        bad(new Error('Secure payment could not load.'));
      };
      const t = window.setTimeout(fail, 12000);
      el.src = 'https://checkout.razorpay.com/v1/checkout.js';
      el.async = true;
      el.referrerPolicy = 'no-referrer';
      el.onload = () => {
        clearTimeout(t);
        if (window.Razorpay) ok();
        else fail();
      };
      el.onerror = () => {
        clearTimeout(t);
        fail();
      };
      document.head.appendChild(el);
    });
  return script;
}
export async function openCheckout(s: Session, onAttempt: () => void) {
  await load();
  const R = window.Razorpay;
  if (!R) throw new Error('Unavailable');
  return new Promise<string>((resolve) => {
    let failed = false;
    const widget = new R({
      key: s.keyId,
      order_id: s.orderId,
      amount: s.amount,
      currency: s.currency,
      name: 'PARADELLE',
      theme: { color: '#49372F' },
      modal: {
        ondismiss: () =>
          resolve(
            failed
              ? 'Payment was not completed. Your bag is saved.'
              : 'Payment window closed. Your bag is saved.',
          ),
      },
      handler: async (p) => {
        try {
          const r = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...p, quoteId: s.quoteId }),
          });
          if (r.ok) {
            window.location.assign(`/order-success?receipt=${encodeURIComponent(s.quoteId)}`);
            resolve('Payment confirmed.');
          } else resolve('Awaiting payment confirmation. Check order status before paying again.');
        } catch {
          resolve('Confirmation is delayed. Check order status before trying again.');
        }
      },
    });
    widget.on('payment.failed', () => {
      failed = true;
    });
    onAttempt();
    widget.open();
  });
}
