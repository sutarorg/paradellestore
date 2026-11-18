import type { Costs } from '../../lib/admin/models';
export function commercePrice(c: Costs) {
  if (
    c.source == null ||
    c.margin == null ||
    c.tax === 'unspecified' ||
    (c.tax === 'inclusive' && c.gst == null)
  )
    return {
      ok: false as const,
      message: 'Enter sourcing cost, tax treatment and target margin to calculate prices.',
    };
  if (Object.values(c).some((v) => typeof v === 'number' && (!Number.isSafeInteger(v) || v < 0)))
    return { ok: false as const, message: 'Costs and rates must be non-negative.' };
  const fixed =
    c.source +
    (c.extras ?? 0) +
    (c.packaging ?? 0) +
    (c.shipping ?? 0) +
    (c.feeFixed ?? 0) +
    (c.reserve ?? 0) +
    (c.discountAllowance ?? 0);
  const t = c.tax === 'inclusive' ? (c.gst ?? 0) / 10000 : 0;
  const fee = (c.feeRate ?? 0) / 10000;
  if (
    !Number.isSafeInteger(fixed) ||
    fixed <= 0 ||
    (c.gst ?? 0) > 10000 ||
    (c.feeRate ?? 0) >= 10000 ||
    c.margin >= 10000
  )
    return { ok: false as const, message: 'Check the cost base and percentage rates.' };
  // Work in paise and basis points. Integer ceiling avoids rounding a minimum price below its target.
  const price = (marginBps: number) => {
    const gross = 10000 + (c.tax === 'inclusive' ? (c.gst ?? 0) : 0),
      divisor = (10000 - marginBps) * 10000 - (c.feeRate ?? 0) * gross;
    if (divisor <= 0) return null;
    const den = BigInt(divisor);
    const result = Number((BigInt(fixed) * 10000n * BigInt(gross) + den - 1n) / den);
    return Number.isSafeInteger(result) ? result : null;
  };
  const end = (p: number) => {
    const rounded = Math.ceil((p + 100) / 10000) * 10000 - 100;
    return c.endings && rounded <= p * 1.1 ? rounded : p;
  };
  const min = price(0),
    rec = price(c.margin),
    premium = price(c.margin + 500);
  if (!min || !rec)
    return {
      ok: false as const,
      message: 'A positive cost base and a feasible margin after fees and tax are required.',
    };
  return {
    ok: true as const,
    min,
    recommended: end(rec),
    premium: premium ? end(premium) : null,
    fixed,
    t,
    fee,
  };
}
export function contribution(price: number, cal: Extract<ReturnType<typeof commercePrice>, { ok: true }>) {
  const net = price / (1 + cal.t);
  const contribution = net - cal.fixed - price * cal.fee;
  return { amount: Math.round(contribution), percent: net ? (contribution / net) * 100 : null };
}
