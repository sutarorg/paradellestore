import { getPreferences } from '@/lib/admin/gateway';
import { Preferences } from '@/components/admin/settings';
export const metadata = { title: 'Store settings' };
export default async function Page() {
  const data = await getPreferences();
  return <Preferences data={data} />;
}
