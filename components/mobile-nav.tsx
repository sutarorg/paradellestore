import Link from 'next/link';
import { House, LayoutGrid, Sparkles, Heart, Truck } from 'lucide-react';
export function MobileNav({ path }: { path: string }) {
  return (
    <nav className="mobile-tabs" aria-label="Shop shortcuts">
      {[
        { url: '/', title: 'Home', Icon: House },
        { url: '/kurtis', title: 'Kurtis', Icon: LayoutGrid },
        { url: '/kurtis?edit=new', title: 'New in', Icon: Sparkles },
        { url: '/wishlist', title: 'Wishlist', Icon: Heart },
        { url: '/track-order', title: 'Track', Icon: Truck },
      ].map(({ url, title, Icon }) => (
        <Link
          key={url}
          href={url}
          className={path === url ? 'active' : ''}
          aria-current={path === url ? 'page' : undefined}
        >
          <Icon size={19} />
          {title}
        </Link>
      ))}
    </nav>
  );
}
