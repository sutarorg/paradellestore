import { OrderDesk } from '@/components/admin/order-desk';
import { ALink, Heading, StateBox } from '@/components/admin/workbench';
import { getOrder } from '@/lib/admin/gateway';
export const metadata = { title: 'Order detail' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const r = await getOrder((await params).id);
  return r.state === 'ready' ? (
    <OrderDesk key={`${r.value.id}:${r.value.revision}`} o={r.value} />
  ) : (
    <>
      <Heading title="Order detail" label="Operations / Order record" />
      <section className="ad-panel">
        <StateBox
          state={r}
          noun="order records"
          action={<ALink href="/admin/orders">Back to orders</ALink>}
        />
      </section>
    </>
  );
}
