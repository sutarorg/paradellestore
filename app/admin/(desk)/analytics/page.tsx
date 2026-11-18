import { Reports } from '@/components/admin/overview';
import { getAnalytics } from '@/lib/admin/gateway';
import { rangeDays, type Raw } from '@/lib/admin/rules';
export const metadata = { title: 'Store analytics' };
export default async function Page({ searchParams }: { searchParams: Promise<Raw> }) {
  const days = rangeDays((await searchParams).days);
  return <Reports days={days} data={await getAnalytics(days)} />;
}
