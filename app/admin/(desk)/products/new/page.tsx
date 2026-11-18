import { ProductEditor } from '@/components/admin/product-editor';
import { getPricingDefaults } from '@/lib/admin/gateway';
import { Heading, StateBox } from '@/components/admin/workbench';
export const metadata = { title: 'New product' };
export default async function Page() {
  const r = await getPricingDefaults();
  return r.state === 'forbidden' || r.state === 'error' ? (
    <>
      <Heading label="Catalogue" title="New product" />
      <StateBox state={r} />
    </>
  ) : (
    <ProductEditor defaults={r.state === 'ready' ? r.value : undefined} />
  );
}
