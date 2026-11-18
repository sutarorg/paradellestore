'use client';
import Link from 'next/link';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="ad-standalone">
      <div className="ad-over">PARADELLE STUDIO</div>
      <h1>Workspace unavailable</h1>
      <p>This view could not load. No changes have been confirmed.</p>
      <button className="ad-btn" type="button" onClick={reset}>
        Try again
      </button>
      <Link href="/admin/login">Administrator sign-in</Link>
    </main>
  );
}
