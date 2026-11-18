'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  Boxes,
  ScanLine,
  ReceiptText,
  Users,
  MessageSquareText,
  ChartNoAxesCombined,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowUpRight,
  ChevronRight,
  Command,
  Search,
  Menu,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Store,
} from 'lucide-react';
import { Bloom } from '@/components/ui';
import { Modal } from '@/components/modal';
import { logout } from '@/lib/admin/actions';
import type { Access } from '@/lib/admin/models';
import { Notices } from './workbench';
const groups = [
  {
    title: 'Workspace',
    items: [
      { to: '/admin', label: 'Overview', icon: LayoutDashboard },
      { to: '/admin/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
    ],
  },
  {
    title: 'Catalogue',
    items: [
      { to: '/admin/products', label: 'Products', icon: ShoppingBag },
      { to: '/admin/importer', label: 'Import studio', icon: ScanLine },
      { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/admin/orders', label: 'Orders', icon: ReceiptText },
      { to: '/admin/customers', label: 'Customers', icon: Users },
      { to: '/admin/reviews', label: 'Reviews', icon: MessageSquareText },
    ],
  },
  { title: 'Store', items: [{ to: '/admin/settings', label: 'Settings', icon: Settings2 }] },
];
const pages = groups.flatMap((g) => g.items);
export function Shell({ children, session }: { children: React.ReactNode; session: Access }) {
  const path = usePathname(),
    router = useRouter();
  const [drawer, showDrawer] = useState(false),
    [collapsed, collapse] = useState(false),
    [search, showSearch] = useState(false),
    [q, setQ] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        showSearch((s) => !s);
      }
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, []);
  const match = (to: string) => (to === '/admin' ? path === to : path === to || path.startsWith(`${to}/`));
  const current = pages.find((p) => match(p.to));
  const group = groups.find((g) => g.items.some((i) => match(i.to)));
  const menu = (
    <>
      <div className="ad-brand">
        <Bloom size={34} />
        <div>
          <span>PARADELLE</span>
          <small>MERCHANT STUDIO</small>
        </div>
      </div>
      <nav aria-label="Administration" className="ad-nav">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="ad-nav-label">{g.title}</div>
            {g.items.map((i) => (
              <Link
                key={i.to}
                title={i.label}
                aria-current={match(i.to) ? 'page' : undefined}
                href={i.to}
                onClick={() => showDrawer(false)}
              >
                <i.icon size={18} />
                <span>{i.label}</span>
                {match(i.to) && <i />}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="ad-railfoot">
        <LockKeyhole size={16} />
        <div>
          Private workspace<small>paradelle.store</small>
        </div>
      </div>
    </>
  );
  return (
    <Notices>
      <div className={`ad-shell ${collapsed ? 'mini' : ''}`}>
        <a className="skip-link" href="#desk">
          Skip to workspace
        </a>
        <aside className="ad-rail">{menu}</aside>
        <div className="ad-canvas">
          <header className="ad-top">
            <div className="ad-top-left">
              <button
                type="button"
                aria-label="Open navigation"
                className="ad-icon ad-menu-toggle"
                onClick={() => showDrawer(true)}
              >
                <Menu size={19} />
              </button>
              <button
                type="button"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="ad-icon ad-rail-toggle"
                onClick={() => collapse(!collapsed)}
              >
                {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
              </button>
              <i className="ad-divider" />
              <span>{group?.title || 'Workspace'}</span>
              <ChevronRight size={13} />
              <b>{current?.label || 'Studio'}</b>
            </div>
            <div className="ad-top-right">
              <button
                type="button"
                className="ad-spotlight"
                title="Find a page"
                aria-keyshortcuts="Control+k Meta+k"
                onClick={() => {
                  setQ('');
                  showSearch(true);
                }}
              >
                <Search size={16} />
                <span>Find a page</span>
                <kbd>
                  <Command size={10} /> K
                </kbd>
              </button>
              <Link className="ad-storelink" aria-label="View store" href="/">
                <Store size={15} />
                <span>View store</span>
                <ArrowUpRight size={13} />
              </Link>
              {session.mode === 'verified' ? (
                <button
                  type="button"
                  className="ad-avatar"
                  aria-label="Sign out"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await logout();
                      router.replace('/admin/login');
                      router.refresh();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <LogOut size={16} />
                </button>
              ) : (
                <Link
                  href="/admin/login"
                  title="Administrator sign-in"
                  aria-label="Administrator sign-in"
                  className="ad-avatar"
                >
                  <ShieldCheck size={17} />
                </Link>
              )}
            </div>
          </header>
          <main id="desk" tabIndex={-1} className="ad-main">
            {children}
          </main>
          <footer className="ad-footer">
            <span>
              <Bloom size={15} /> PARADELLE STUDIO
            </span>
            <span>Single-store administration</span>
          </footer>
        </div>
      </div>
      {drawer && (
        <Modal title="Studio navigation" mode="menu" close={() => showDrawer(false)}>
          <div className="ad-drawer">{menu}</div>
        </Modal>
      )}
      {search && (
        <Modal title="Find a page" mode="search" close={() => showSearch(false)}>
          <div className="ad-dialog">
            <input
              className="ad-spotinput"
              data-initial-focus
              aria-label="Search workspace pages"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the studio…"
            />
            <div className="ad-findlist">
              {pages
                .filter((p) => p.label.toLowerCase().includes(q.trim().toLowerCase()))
                .map((p) => (
                  <Link key={p.to} href={p.to} onClick={() => showSearch(false)}>
                    <p.icon size={16} />
                    {p.label}
                    <ChevronRight size={14} />
                  </Link>
                ))}
              {!pages.some((p) => p.label.toLowerCase().includes(q.trim().toLowerCase())) && (
                <p>No matching pages.</p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </Notices>
  );
}
