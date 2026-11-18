'use client';
import { useSyncExternalStore } from 'react';
import type { Address, CartLine } from './contracts';
import { isSort, type Sort } from './content';
import { fingerprint, nextQuantity, slugOK, validMobile } from './shop';

export const STORAGE_KEY = 'paradelle:shopping:v1';
export type Device = {
  cart: CartLine[];
  wishlist: string[];
  recent: string[];
  sort: Sort;
  address: { value: Address; expires: number } | null;
  pending: { quoteDigest: string; bag: string } | null;
};
const empty = (): Device => ({
  cart: [],
  wishlist: [],
  recent: [],
  sort: 'recommended',
  address: null,
  pending: null,
});
const initial = empty();
let state = initial;
let hydrated = false;
let memoryOnly = false;
const listeners = new Set<() => void>();
const notify = () =>
  listeners.forEach((f) => {
    f();
  });
export const toast = (message: string) =>
  window.dispatchEvent(new CustomEvent('paradelle:notice', { detail: message }));
function stringList(v: unknown, max: number) {
  return Array.isArray(v) ? [...new Set(v.filter(slugOK))].slice(0, max) : [];
}
export function restore(raw: string | null): Device {
  try {
    const d = raw ? JSON.parse(raw) : {};
    if (!d || typeof d !== 'object') return empty();
    const cart: CartLine[] = [];
    if (Array.isArray(d.cart))
      for (const line of d.cart.slice(0, 99))
        if (
          line &&
          slugOK(line.slug) &&
          typeof line.variantId === 'string' &&
          line.variantId &&
          line.variantId.length <= 160 &&
          Number.isInteger(line.quantity) &&
          line.quantity > 0 &&
          line.quantity <= 99 &&
          !cart.some((l) => l.slug === line.slug && l.variantId === line.variantId)
        )
          cart.push({ slug: line.slug, variantId: line.variantId, quantity: line.quantity });
    let address: Device['address'] = null;
    const a = d.address?.value;
    if (
      a &&
      Number.isFinite(d.address.expires) &&
      d.address.expires > Date.now() &&
      ['fullName', 'mobile', 'address', 'city', 'state', 'pin'].every(
        (k) => typeof a[k] === 'string' && a[k].length > 0 && a[k].length <= 350,
      ) &&
      validMobile(a.mobile) &&
      /^[1-9]\d{5}$/.test(a.pin)
    ) {
      const { fullName, mobile, address: street, city, state, pin } = a;
      address = {
        value: { fullName, mobile, address: street, city, state, pin },
        expires: d.address.expires,
      };
    }
    const pending =
      typeof d.pending?.quoteDigest === 'string' &&
      /^[a-f0-9]{64}$/.test(d.pending.quoteDigest) &&
      typeof d.pending.bag === 'string' &&
      d.pending.bag.length < 40000
        ? { quoteDigest: d.pending.quoteDigest, bag: d.pending.bag }
        : null;
    return {
      cart,
      wishlist: stringList(d.wishlist, 99),
      recent: stringList(d.recent, 12),
      sort: isSort(d.sort) ? d.sort : 'recommended',
      address,
      pending,
    };
  } catch {
    return empty();
  }
}
function read() {
  if (!hydrated && typeof window !== 'undefined') {
    hydrated = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      state = restore(raw);
      if (raw && JSON.stringify(state) !== raw) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      memoryOnly = true;
    }
  }
  return state;
}
function write(s: Device) {
  state = s;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    memoryOnly = false;
  } catch {
    memoryOnly = true;
  }
  notify();
}
function onStorage(e: StorageEvent) {
  if (e.key === STORAGE_KEY || e.key === null) {
    hydrated = false;
    read();
    notify();
  }
}
function subscribe(f: () => void) {
  listeners.add(f);
  if (listeners.size === 1) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(f);
    if (!listeners.size) window.removeEventListener('storage', onStorage);
  };
}
export function useDevice() {
  return useSyncExternalStore(subscribe, read, () => initial);
}
export const useReady = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
export const storageNote = () =>
  memoryOnly ? ' Browser storage is unavailable; this change lasts for this visit only.' : '';
export function toggleWish(slug: string) {
  const s = read();
  const remove = s.wishlist.includes(slug);
  if (!remove && s.wishlist.length >= 99) {
    toast('Your wishlist is full. Remove a piece to save another.');
    return;
  }
  write({ ...s, wishlist: remove ? s.wishlist.filter((v) => v !== slug) : [slug, ...s.wishlist] });
  toast((remove ? 'Removed from your wishlist.' : 'Saved to your wishlist.') + storageNote());
}
export function markViewed(slug: string) {
  const s = read();
  if (s.recent[0] !== slug)
    write({ ...s, recent: [slug, ...s.recent.filter((v) => v !== slug)].slice(0, 12) });
}
export function changeQuantity(line: CartLine, quantity: number) {
  const s = read();
  write({
    ...s,
    cart: s.cart.flatMap((l) =>
      l.variantId === line.variantId && l.slug === line.slug
        ? quantity > 0
          ? [{ ...l, quantity: Math.min(99, quantity) }]
          : []
        : [l],
    ),
    pending: null,
  });
}
export function addToBag(slug: string, variantId: string, stock: number) {
  const s = read();
  const line = s.cart.find((l) => l.slug === slug && l.variantId === variantId);
  const qty = nextQuantity(line?.quantity ?? 0, 1, stock);
  if (qty <= (line?.quantity ?? 0) || (!line && s.cart.length >= 99)) {
    toast('The available quantity is already in your bag.');
    return false;
  }
  if (line) changeQuantity(line, qty);
  else write({ ...s, cart: [...s.cart, { slug, variantId, quantity: qty }], pending: null });
  toast(`Added to your bag.${storageNote()}`);
  return true;
}
export function saveSort(sort: Sort) {
  write({ ...read(), sort });
}
export function saveAddress(value: Address | null) {
  write({ ...read(), address: value ? { value, expires: Date.now() + 30 * 86400000 } : null });
  if (memoryOnly)
    toast(
      value
        ? 'Browser storage is unavailable. Your address was not saved for a future visit.'
        : 'Browser storage could not be updated. Clear this site’s data in browser settings to erase a previously saved address.',
    );
  return !memoryOnly;
}
// A quote identifier may be a capability. Never persist the identifier or the payment URL.
async function digestQuote(id: string) {
  try {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
    return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}
export async function rememberCheckout(quoteId: string, bag = fingerprint(read().cart)) {
  const quoteDigest = await digestQuote(quoteId);
  const s = read();
  if (quoteDigest && fingerprint(s.cart) === bag) write({ ...s, pending: { quoteDigest, bag } });
}
export async function settleBag(quoteId: string) {
  const digest = await digestQuote(quoteId);
  const s = read();
  if (digest && s.pending?.quoteDigest === digest)
    write({ ...s, cart: s.pending.bag === fingerprint(s.cart) ? [] : s.cart, pending: null });
}
export function forgetDevice() {
  state = empty();
  try {
    localStorage.removeItem(STORAGE_KEY);
    memoryOnly = false;
  } catch {
    memoryOnly = true;
  }
  notify();
  toast(
    memoryOnly
      ? 'This visit’s data was cleared. To erase inaccessible saved data, clear this site in your browser settings.'
      : 'Shopping data cleared from this browser.',
  );
}
