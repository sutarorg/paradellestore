'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Bloom } from '@/components/ui';
import { signIn, recover } from '@/lib/admin/actions';
import { Button, InfoBox } from './workbench';
export function Login({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [recovery, mode] = useState(false),
    [show, see] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, wait] = useState(false),
    [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  function toggle() {
    mode(!recovery);
    setPassword('');
    see(false);
    setMsg(null);
  }
  return (
    <main className="ad-login">
      <div className="ad-login-art">
        <Image alt="" src="/admin/atelier.webp" fill sizes="(min-width: 800px) 48vw, 100vw" priority />
        <div className="ad-login-brand">
          <Bloom size={28} /> PARADELLE
        </div>
        <div className="ad-login-caption">
          <div className="ad-over">THE MERCHANT STUDIO</div>
          <h2>Behind the collection.</h2>
          <p>The private workspace for PARADELLE.</p>
        </div>
      </div>
      <div className="ad-login-form">
        <div className="ad-over">
          <i /> Administrator access
        </div>
        <h1>{recovery ? 'Reset your password' : 'Studio sign-in'}</h1>
        <p>
          {recovery
            ? 'Request a recovery link for your administrator email.'
            : 'Sign in with your authorised store account.'}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            wait(true);
            setMsg(null);
            try {
              const res = await (recovery ? recover(email) : signIn(email, password));
              if (!res.ok) setMsg({ ok: false, text: res.message });
              else if (recovery)
                setMsg({
                  ok: true,
                  text: 'If this email belongs to an authorised account, recovery instructions will be sent.',
                });
              else {
                setPassword('');
                router.replace('/admin');
                router.refresh();
              }
            } catch {
              setMsg({ ok: false, text: 'The private service is unavailable. Try again later.' });
            } finally {
              wait(false);
            }
          }}
        >
          <label className="ad-field">
            <span>Admin email</span>
            <input
              type="email"
              required
              autoComplete="username"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {!recovery && (
            <label className="ad-field">
              <span>Password</span>
              <span className="ad-password">
                <input
                  autoComplete="current-password"
                  required
                  type={show ? 'text' : 'password'}
                  maxLength={1024}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={show ? 'Hide password' : 'Show password'}
                  onClick={() => see(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
          )}
          {msg && <InfoBox error={!msg.ok}>{msg.text}</InfoBox>}
          <Button type="submit" busy={busy}>
            {recovery ? 'Request recovery link' : 'Sign in'}
            <ArrowRight size={16} />
          </Button>
        </form>
        <button disabled={busy} type="button" className="ad-textlink" onClick={toggle}>
          {recovery ? 'Back to sign-in' : 'Forgot password?'}
        </button>
        <div className="ad-login-note">
          <ShieldCheck size={16} />
          {connected
            ? 'Restricted to authorised administrators.'
            : 'Private authentication is not connected.'}
        </div>
        <Link className="ad-textlink" href="/">
          <ArrowLeft size={14} />
          Return to storefront
        </Link>
      </div>
      <span className="ad-login-mark">
        <LockKeyhole size={12} /> PRIVATE ADMINISTRATION
      </span>
    </main>
  );
}
