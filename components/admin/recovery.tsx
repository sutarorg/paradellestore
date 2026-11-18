'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
export function Recovery() {
  const [token, set] = useState(''),
    [message, note] = useState(''),
    [busy, work] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(location.hash.slice(1)).get('token_hash');
    if (value) {
      history.replaceState(null, '', location.pathname);
      set(value);
    }
  }, []);
  return (
    <>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          work(true);
          try {
            const r = await fetch('/api/admin/auth/reset', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ tokenHash: token, password: f.get('password') }),
            });
            note(
              r.ok
                ? 'Password updated. Sign in with the new password.'
                : 'Recovery link expired or password not accepted.',
            );
            if (r.ok) set('');
          } catch {
            note('Recovery is unavailable.');
          } finally {
            work(false);
          }
        }}
      >
        {token ? (
          <>
            <label>
              New password (at least 12 characters)
              <input
                required
                name="password"
                autoComplete="new-password"
                type="password"
                minLength={12}
                maxLength={256}
              />
            </label>
            <button className="btn btn-dark" type="submit" disabled={busy}>
              {busy ? 'Updating…' : 'Set password'}
            </button>
          </>
        ) : (
          <p>Use the recovery link sent to your authorised staff email.</p>
        )}
        <p role="status">{message}</p>
      </form>
      <Link className="underlink" href="/admin/login">
        Return to studio sign-in
      </Link>
    </>
  );
}
