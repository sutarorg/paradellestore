import { ProductEditor } from '@/components/admin/product-editor';
import { getProduct } from '@/lib/admin/gateway';
import { ALink, Heading, StateBox } from '@/components/admin/workbench';
export const metadata = { title: 'Edit product' };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const r = await getProduct((await params).id);
  return r.state === 'ready' ? (
    <ProductEditor
      key={`${r.value.id}:${r.value.revision}`}
      preview={(await searchParams).view === 'preview'}
      record={r.value}
    />
  ) : (
    <>
      <Heading label="Catalogue" title="Edit product" />
      <section className="ad-panel">
        <StateBox
          noun="product records"
          state={r}
          action={<ALink href="/admin/products">Back to products</ALink>}
        />
      </section>
    </>
  );
}
