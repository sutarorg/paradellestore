import { InventoryIndex } from '@/components/admin/indexes';
import { getStock, getStockHistory } from '@/lib/admin/gateway';
import { listQuery, type Raw } from '@/lib/admin/rules';
export const metadata = { title: 'Inventory' };
export default async function Page({ searchParams }: { searchParams: Promise<Raw> }) {
  const q = listQuery('inventory', await searchParams);
  const [data, history] = await Promise.all([getStock(q), getStockHistory()]);
  return <InventoryIndex query={q} data={data} history={history} />;
}
