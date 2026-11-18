import { Bloom } from '@/components/ui';
export default function Loading() {
  return (
    <div className="frame loading-page" role="status">
      <Bloom size={30} />
      <span>Opening PARADELLE…</span>
    </div>
  );
}
