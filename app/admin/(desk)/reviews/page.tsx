import { ReviewsIndex } from '@/components/admin/indexes';
import { getReviews } from '@/lib/admin/gateway';
import { listQuery, type Raw } from '@/lib/admin/rules';
export const metadata = { title: 'Reviews' };
export default async function Page({ searchParams }: { searchParams: Promise<Raw> }) {
  const q = listQuery('reviews', await searchParams);
  const data = await getReviews(q);
  return (
    <ReviewsIndex
      key={JSON.stringify([q, data.state === 'ready' ? data.value.rows.map((r) => r.id) : []])}
      query={q}
      data={data}
    />
  );
}
