'use client';
import { Heart } from 'lucide-react';
import { toggleWish, useDevice } from '@/lib/device';
export function WishButton({ slug, name, full = false }: { slug: string; name: string; full?: boolean }) {
  const saved = useDevice().wishlist.includes(slug);
  return (
    <button
      type="button"
      className={full ? 'btn btn-outline wishlist-full' : 'wish-btn'}
      onClick={() => toggleWish(slug)}
      aria-label={`${saved ? 'Remove' : 'Save'} ${name} ${saved ? 'from' : 'to'} wishlist`}
      aria-pressed={saved}
    >
      <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
      {full && (saved ? 'Saved to wishlist' : 'Add to wishlist')}
    </button>
  );
}
