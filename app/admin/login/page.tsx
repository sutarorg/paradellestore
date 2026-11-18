import { configured, access } from '@/lib/admin/gateway';
import { redirect } from 'next/navigation';
import { Login } from '@/components/admin/login';
export const metadata = { title: 'Administrator sign-in' };
export default async function Page() {
  if ((await access()).mode === 'verified') redirect('/admin');
  return <Login connected={configured()} />;
}
