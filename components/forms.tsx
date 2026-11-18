'use client';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { subscribeEmail, sendEnquiry } from '@/lib/actions';
export function MessageForm({ kind }: { kind: 'newsletter' | 'contact' }) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [sent, setSent] = useState(false);
  const newsletter = kind === 'newsletter';
  return (
    <form
      className="stack-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const d = new FormData(f);
        setPending(true);
        setFeedback('');
        try {
          const r = newsletter
            ? await subscribeEmail(String(d.get('email')), d.get('consent') === 'on')
            : await sendEnquiry(String(d.get('email')), String(d.get('message')));
          setFeedback(
            r.ok
              ? newsletter
                ? 'You’re subscribed to the Paradelle Letter.'
                : 'Your enquiry has been received.'
              : r.message,
          );
          if (r.ok) {
            f.reset();
            setSent(true);
          }
        } catch {
          setFeedback('We couldn’t send this. Please try again.');
        } finally {
          setPending(false);
        }
      }}
    >
      {!sent && (
        <>
          <label>
            Email address
            <input type="email" name="email" required autoComplete="email" maxLength={254} />
          </label>
          {newsletter ? (
            <label className="check-label">
              <input type="checkbox" name="consent" required />
              I’d like to receive editorial and collection emails from PARADELLE.
            </label>
          ) : (
            <label>
              Your enquiry
              <textarea name="message" required minLength={10} maxLength={2000} rows={4} />
            </label>
          )}
          <button type="submit" className="btn btn-dark" disabled={pending}>
            {pending ? 'Sending…' : newsletter ? 'Subscribe' : 'Send enquiry'}
            <ArrowRight size={16} />
          </button>
        </>
      )}
      <p role="status">{feedback}</p>
    </form>
  );
}
