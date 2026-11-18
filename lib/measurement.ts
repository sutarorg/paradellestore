'use client';
export type Consent = { ga: boolean; meta: boolean; expires: number };
const key = 'paradelle:privacy:v1';
const off = (): Consent => ({ ga: false, meta: false, expires: 0 });
let memory: Consent | undefined;
export function preference() {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : memory;
    if (v?.expires > Date.now())
      return { ga: v.ga === true, meta: v.meta === true, expires: Number(v.expires) };
  } catch {
    if (memory && memory.expires > Date.now()) return memory;
  }
  return off();
}
export function measurementId() {
  if (!preference().ga) return crypto.randomUUID();
  try {
    const key = 'paradelle:measurement-id:v1',
      saved = localStorage.getItem(key);
    if (saved && itemId.test(saved)) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
export function consent(ga: boolean, meta: boolean) {
  if (!ga) {
    try {
      localStorage.removeItem('paradelle:measurement-id:v1');
    } catch {
      /* No identifier retained in memory. */
    }
  }
  memory = { ga, meta, expires: Date.now() + 180 * 86400000 };
  try {
    localStorage.setItem(key, JSON.stringify(memory));
  } catch {
    /* Consent in this tab only. */
  }
  window.dispatchEvent(new Event('paradelle:consent'));
}
export const commerceEvents = [
  'view_item_list',
  'select_item',
  'view_item',
  'add_to_cart',
  'remove_from_cart',
  'begin_checkout',
  'add_payment_info',
  'purchase',
] as const;
export type EventName = (typeof commerceEvents)[number];
export type MetricItem = { item_id: string; quantity: number; price?: number };
const itemId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function measure(
  name: EventName,
  items: MetricItem[],
  value?: number,
  order?: { quoteId: string; reference: string },
) {
  const c = preference();
  if (!c.ga && !c.meta) return;
  const clean = items
    .filter(
      (x) =>
        itemId.test(x.item_id) && Number.isSafeInteger(x.quantity) && x.quantity >= 1 && x.quantity <= 99,
    )
    .slice(0, 40)
    .map((x) => ({
      item_id: x.item_id,
      quantity: x.quantity,
      ...(x.price != null && Number.isFinite(x.price) && x.price >= 0 ? { price: x.price } : {}),
    }));
  if (
    !clean.length ||
    (name === 'purchase' && (!order || !itemId.test(order.quoteId) || !/^PAR-\d{5,}$/.test(order.reference)))
  )
    return;
  window.dispatchEvent(
    new CustomEvent('paradelle:measure', {
      detail: {
        name,
        items: clean,
        value: value == null ? undefined : Number.isFinite(value) && value >= 0 ? value : undefined,
        order,
      },
    }),
  );
}
