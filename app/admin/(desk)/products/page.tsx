import { ProductsIndex } from '@/components/admin/indexes';
import { getProducts } from '@/lib/admin/gateway';
import { listQuery, type Raw } from '@/lib/admin/rules';
export const metadata = { title: 'Products' };
export default async function Page({ searchParams }: { searchParams: Promise<Raw> }) {
  const q = listQuery('products', await searchParams);
  const data = await getProducts(q);
  return (
    <ProductsIndex
      key={JSON.stringify([q, data.state === 'ready' ? data.value.rows.map((r) => r.id) : []])}
      query={q}
      data={data}
    />
  );
}
