import { OrdersIndex } from '@/components/admin/indexes';
import { getOrders } from '@/lib/admin/gateway';
import { listQuery, type Raw } from '@/lib/admin/rules';
export const metadata = { title: 'Orders' };
export default async function Page({ searchParams }: { searchParams: Promise<Raw> }) {
  const q = listQuery('orders', { ...(await searchParams), q: '' });
  const data = await getOrders(q);
  return (
    <OrdersIndex
      key={JSON.stringify([q, data.state === 'ready' ? data.value.rows.map((r) => r.id) : []])}
      query={q}
      data={data}
    />
  );
}
