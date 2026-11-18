import type { ReactNode } from 'react';
import { Header, Notifications } from '@/components/header';
import { Footer } from '@/components/footer';
import { getSettings } from '@/lib/gateway';
export const dynamic = 'force-dynamic';
export default async function StoreLayout({ children }: { children: ReactNode }) {
  const settings = await getSettings();
  return (
    <>
      <Header
        announcement={settings.announcement}
        logo={settings.logo}
        identityName={settings.identityName}
      />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer social={settings.social} ga={process.env.GA4_MEASUREMENT_ID} meta={process.env.META_PIXEL_ID} />
      <Notifications />
    </>
  );
}
