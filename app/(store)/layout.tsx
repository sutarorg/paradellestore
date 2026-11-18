import type { ReactNode } from 'react';
import { Header, Notifications } from '@/components/header';
import { Footer } from '@/components/footer';
import { getSettings } from '@/lib/gateway';
export default async function StoreLayout({ children }: { children: ReactNode }) {
  const settings = await getSettings();
  return (
    <>
      <Header announcement={settings.announcement} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer />
      <Notifications />
    </>
  );
}
