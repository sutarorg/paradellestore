'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { Modal } from './modal';
import {
  consent,
  preference,
  measure,
  measurementId,
  type MetricItem,
  type EventName,
  type Consent,
} from '@/lib/measurement';

export function PrivacyChoices({ ga = '', meta = '' }: { ga?: string; meta?: string }) {
  const [open, setOpen] = useState(false),
    [c, set] = useState<Consent>({ ga: false, meta: false, expires: 0 }),
    [a, aa] = useState(false),
    [m, mm] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null),
    ready = useRef(false);
  const pending = useRef<unknown[]>([]);
  const pathname = usePathname();
  const channels = useMemo(
    () => ({ ga: c.ga && /^G-[A-Z0-9]+$/.test(ga), meta: c.meta && /^\d{5,24}$/.test(meta) }),
    [c.ga, c.meta, ga, meta],
  );
  useEffect(() => {
    function reload() {
      const p = preference();
      set(p);
    }
    reload();
    const storage = (e: StorageEvent) => {
      if (!e.key || e.key === 'paradelle:privacy:v1') reload();
    };
    window.addEventListener('storage', storage);
    window.addEventListener('paradelle:consent', reload);
    return () => {
      window.removeEventListener('storage', storage);
      window.removeEventListener('paradelle:consent', reload);
    };
  }, []);
  useEffect(() => {
    if (!c.expires) return;
    const t = window.setTimeout(
      () => set(preference()),
      Math.min(2147483647, Math.max(1, c.expires - Date.now())),
    );
    return () => clearTimeout(t);
  }, [c]);
  useEffect(() => {
    if (!channels.ga && !channels.meta) return;
    const target = () => frame.current?.contentWindow;
    const send = (payload: unknown) => {
      if (ready.current) target()?.postMessage(payload, '*');
      else if (pending.current.length < 40) pending.current.push(payload);
    };
    const ack = (e: MessageEvent) => {
      if (e.source !== target() || e.data !== 'paradelle:ready') return;
      ready.current = true;
      target()?.postMessage(
        { init: true, ga: channels.ga ? ga : '', meta: channels.meta ? meta : '', clientId: measurementId() },
        '*',
      );
      for (const x of pending.current) target()?.postMessage(x, '*');
      pending.current = [];
      window.dispatchEvent(new Event('paradelle:metrics-ready'));
    };
    async function onMeasure(e: Event) {
      const d = (
        e as CustomEvent<{
          name: EventName;
          items: MetricItem[];
          value?: number;
          order?: { quoteId: string; reference: string };
        }>
      ).detail;
      const p = preference();
      for (const channel of ['ga', 'meta'] as const) {
        if (!channels[channel] || !p[channel]) continue;
        if (d.name === 'purchase') {
          if (!d.order) continue;
          try {
            const r = await fetch('/api/analytics/purchase', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ channel, quoteId: d.order.quoteId }),
            });
            if (!r.ok || !(await r.json()).send || !preference()[channel]) continue;
          } catch {
            continue;
          }
        }
        send({ channel, name: d.name, items: d.items, value: d.value, transaction_id: d.order?.reference });
      }
    }
    window.addEventListener('message', ack);
    window.addEventListener('paradelle:measure', onMeasure);
    return () => {
      window.removeEventListener('message', ack);
      window.removeEventListener('paradelle:measure', onMeasure);
      ready.current = false;
      pending.current = [];
    };
  }, [channels, ga, meta]);
  useEffect(() => {
    if ((!channels.ga && !channels.meta) || !pathname) return;
    const item = (el: HTMLElement) => ({
      item_id: el.dataset.metricItem || '',
      quantity: 1,
      price: Number(el.dataset.metricPrice) / 100,
    });
    const tiles = [...document.querySelectorAll<HTMLElement>('[data-metric-item]')];
    const list = tiles.filter((e) => e.dataset.metricKind === 'tile');
    if (list.length) measure('view_item_list', list.map(item));
    const main = tiles.find((e) => e.dataset.metricKind === 'detail');
    if (main) measure('view_item', [item(main)]);
    const select = (e: MouseEvent) => {
      const hit =
        e.target instanceof Element
          ? e.target.closest('a')?.closest<HTMLElement>('[data-metric-kind="tile"]')
          : null;
      if (hit) measure('select_item', [item(hit)]);
    };
    document.addEventListener('click', select);
    return () => document.removeEventListener('click', select);
  }, [pathname, channels.ga, channels.meta]);
  const change = (a: boolean, m: boolean) => {
    if (a !== c.ga || m !== c.meta) frame.current?.contentWindow?.postMessage({ revoke: true }, '*');
    consent(a, m);
    setOpen(false);
  };
  return (
    <>
      <button
        className="underlink"
        type="button"
        onClick={() => {
          const p = preference();
          aa(p.ga);
          mm(p.meta);
          setOpen(true);
        }}
      >
        Privacy choices
      </button>
      {(channels.ga || channels.meta) && (
        <iframe
          key={`${channels.ga}:${channels.meta}`}
          title="Optional measurement"
          ref={frame}
          hidden
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          src="/signals.html"
        />
      )}
      {open && (
        <Modal title="Your privacy choices" close={() => setOpen(false)} mode="sheet">
          <p>
            Optional measurement is off until you choose it. You can shop and pay without enabling either
            option.
          </p>
          <label className="check-label">
            <input type="checkbox" checked={a} onChange={(e) => aa(e.target.checked)} />
            Allow Google Analytics to measure product and checkout events.
          </label>
          <label className="check-label">
            <input type="checkbox" checked={m} onChange={(e) => mm(e.target.checked)} />
            Allow Meta to measure shopping events for advertising.
          </label>
          <p className="small muted">
            We do not send your name, phone, address, email or payment credentials. Your choice applies to
            this browser for 180 days.
          </p>
          <div className="row-wrap">
            <button type="button" className="btn btn-outline" onClick={() => change(false, false)}>
              Reject optional tracking
            </button>
            <button type="button" className="btn btn-dark" onClick={() => change(a, m)}>
              Save choices
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
