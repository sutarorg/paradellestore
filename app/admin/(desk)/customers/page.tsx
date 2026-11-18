import { CustomersIndex } from '@/components/admin/indexes';
import { getCustomers } from '@/lib/admin/gateway';
import { listQuery, type Raw } from '@/lib/admin/rules';
export const metadata = { title: 'Customers' };
export default async function Page({ searchParams }: { searchParams: Promise<Raw> }) {
  const q = listQuery('customers', { ...(await searchParams), q: '' });
  const data = await getCustomers(q);
  return (
    <CustomersIndex
      key={JSON.stringify([q, data.state === 'ready' ? data.value.rows.map((r) => r.id) : []])}
      query={q}
      data={data}
    />
  );
}
