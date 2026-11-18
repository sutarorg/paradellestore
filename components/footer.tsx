import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { categories, categoryHref, policyLinks } from '@/lib/content';
import { Bloom } from './ui';
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="frame">
        <div className="footer-main">
          <div className="footer-brand">
            <Link className="wordmark" href="/">
              PARADELLE
            </Link>
            <p>Timeless Kurtis for every you.</p>
            <Bloom size={32} />
          </div>
          <div>
            <h2>Discover</h2>
            {categories.slice(0, 4).map((c) => (
              <Link href={categoryHref(c.slug)} key={c.slug}>
                {c.name}
              </Link>
            ))}
          </div>
          <div>
            <h2>Customer care</h2>
            <Link href="/track-order">Track an order</Link>
            <Link href="/contact">Contact us</Link>
            <Link href="/shipping-policy">Shipping policy</Link>
            <Link href="/returns-refunds">Returns & refunds</Link>
          </div>
          <div>
            <h2>Paradelle</h2>
            <Link href="/about">Our story</Link>
            <Link href="/wishlist">Your wishlist</Link>
            {policyLinks.slice(2).map(([href, label]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="footer-base">
          <span>© {new Date().getFullYear()} PARADELLE</span>
          <span>India · INR ₹</span>
          <a href="#top">
            Back to top <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </footer>
  );
}
