'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Heart,
  Menu,
  Search,
  ShoppingBag,
  X,
} from 'lucide-react';
import { categories, categoryHref } from '@/lib/content';
import { useDevice } from '@/lib/device';
import { Bloom } from './ui';
import { Modal } from './modal';
function SearchPanel({ close }: { close: () => void }) {
  const [q, setQ] = useState('');
  const router = useRouter();
  return (
    <Modal title="Search PARADELLE" close={close} mode="search">
      <p className="muted">Find a Kurti by fabric, silhouette or colour.</p>
      <form
        className="search-input"
        onSubmit={(e) => {
          e.preventDefault();
          close();
          router.push(q.trim() ? `/kurtis?q=${encodeURIComponent(q.trim())}` : '/kurtis');
        }}
      >
        <Search size={20} />
        <input
          aria-label="Search Kurtis"
          data-initial-focus
          value={q}
          maxLength={150}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Kurtis…"
          type="search"
        />
        <button type="submit" className="icon-btn" aria-label="Submit search">
          <ArrowRight />
        </button>
      </form>
      <div className="eyebrow">Browse by category</div>
      <div className="suggestions">
        {categories.map((c) => (
          <Link key={c.slug} className="chip" href={categoryHref(c.slug)} onClick={close}>
            {c.name}
          </Link>
        ))}
      </div>
    </Modal>
  );
}
export function Header({
  announcement,
  logo,
  identityName = 'PARADELLE',
}: {
  announcement: string;
  logo?: { src: string; alt: string } | null;
  identityName?: string;
}) {
  const pathname = usePathname();
  const [panel, setPanel] = useState<'search' | 'menu' | null>(null);
  const device = useDevice();
  const count = device.cart.reduce((a, b) => a + b.quantity, 0);
  const shopRef = useRef<HTMLDetailsElement>(null);
  const close = () => {
    setPanel(null);
    shopRef.current?.removeAttribute('open');
  };
  useEffect(() => {
    const click = (e: PointerEvent) => {
      if (e.target instanceof Node && !shopRef.current?.contains(e.target))
        shopRef.current?.removeAttribute('open');
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && shopRef.current?.open) {
        shopRef.current.open = false;
        shopRef.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', click);
      document.removeEventListener('keydown', key);
    };
  }, []);
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className={`announcement ${pathname === '/' ? '' : 'inner-announcement'}`}>
        <Bloom size={13} />
        <span>{announcement}</span>
        <Bloom size={13} />
      </div>
      <header className="masthead">
        <div className="frame mast-inner">
          <button
            type="button"
            className="icon-btn menu-toggle"
            onClick={() => setPanel('menu')}
            aria-label="Open navigation menu"
          >
            <Menu />
          </button>
          <Link href="/" aria-label="Paradelle home" className="wordmark">
            {logo ? (
              <Image
                src={logo.src}
                alt={logo.alt}
                width={132}
                height={36}
                unoptimized
                style={{ objectFit: 'contain' }}
              />
            ) : (
              identityName
            )}
          </Link>
          <nav className="desktop-nav" aria-label="Main navigation">
            <details ref={shopRef} className="shop-disclosure">
              <summary>
                Shop Kurtis <ChevronDown size={13} />
              </summary>
              <div className="shop-popover">
                <span className="eyebrow">The style directory</span>
                {categories.map((c) => (
                  <Link key={c.slug} href={categoryHref(c.slug)} onClick={close}>
                    {c.name}
                    <ArrowUpRight size={14} />
                  </Link>
                ))}
              </div>
            </details>
            <Link href="/kurtis?edit=new">New Arrivals</Link>
            <Link href="/#collections">Collections</Link>
            <Link href="/about">Our Story</Link>
          </nav>
          <div className="utilities">
            <button
              type="button"
              className="icon-btn"
              aria-label="Open search"
              onClick={() => setPanel('search')}
            >
              <Search />
            </button>
            <Link
              href="/wishlist"
              className="icon-btn wish-util"
              aria-label={`Wishlist, ${device.wishlist.length} saved pieces`}
            >
              <Heart />
            </Link>
            <span className="util-rule" />
            <Link href="/cart" className="icon-btn bag-util" aria-label={`Shopping bag, ${count} items`}>
              <ShoppingBag />
              <span className="count" aria-hidden="true">
                {count > 99 ? '99+' : count}
              </span>
            </Link>
          </div>
        </div>
      </header>
      {panel === 'search' && <SearchPanel close={close} />}
      {panel === 'menu' && (
        <Modal title="Explore PARADELLE" close={close} mode="menu">
          <div className="menu-links">
            {[
              ['/', 'Home'],
              ['/kurtis', 'All Kurtis'],
              ['/kurtis?edit=new', 'New Arrivals'],
              ['/#collections', 'Curated collections'],
              ['/about', 'Our Story'],
              ['/wishlist', 'Wishlist'],
              ['/track-order', 'Track an order'],
              ['/contact', 'Customer care'],
            ].map(([href, label]) => (
              <Link key={href} href={href} onClick={close}>
                {label}
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
          <div className="menu-photo">
            <Image
              src="/editorial/courtyard.webp"
              alt="Sunlight in the Paradelle campaign courtyard"
              fill
              sizes="360px"
            />
          </div>
        </Modal>
      )}
    </>
  );
}
export function Notifications() {
  const [notice, setNotice] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const event = (e: Event) => {
      setNotice((e as CustomEvent<string>).detail);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setNotice(''), 4500);
    };
    window.addEventListener('paradelle:notice', event);
    return () => {
      window.removeEventListener('paradelle:notice', event);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  return (
    <div className="notice-area" role="status" aria-live="polite">
      {notice && (
        <div className="notice">
          <Check size={17} />
          {notice}
          <button
            type="button"
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setNotice('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
