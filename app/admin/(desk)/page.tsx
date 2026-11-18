import { Overview } from '@/components/admin/overview';
import { getDashboard } from '@/lib/admin/gateway';
import { rangeDays, type Raw } from '@/lib/admin/rules';
export const metadata = { title: 'Store overview' };
export default async function Page({ searchParams }: { searchParams: Promise<Raw> }) {
  const days = rangeDays((await searchParams).days);
  return <Overview days={days} data={await getDashboard(days)} />;
}
