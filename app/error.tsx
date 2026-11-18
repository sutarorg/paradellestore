'use client';
import Link from 'next/link';
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <div className="frame state-page">
      <div className="empty-state">
        <div className="eyebrow">PARADELLE</div>
        <h1>Let’s try that again.</h1>
        <p>We couldn’t load this page. Your browser-saved shopping data hasn’t been changed.</p>
        <button type="button" className="btn btn-dark" onClick={reset}>
          Try again
        </button>
        <Link className="arrow-link" href="/">
          Return home
        </Link>
      </div>
    </div>
  );
}
