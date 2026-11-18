'use client';
import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, ChartNoAxesColumnIncreasing, ChevronDown } from 'lucide-react';
import { buckets, stamp } from '@/lib/admin/rules';
import { money } from '@/lib/shop';
import type { Read, SaleDay } from '@/lib/admin/models';
import { DataTable, PanelHead, StateBox } from './workbench';
export function Period({ days }: { days: number }) {
  const router = useRouter(),
    path = usePathname();
  const [loading, start] = useTransition();
  return (
    <label aria-busy={loading} className="ad-period">
      <CalendarDays size={14} />
      <select
        aria-label="Reporting period"
        value={days}
        onChange={(e) => start(() => router.push(`${path}?days=${e.target.value}`, { scroll: false }))}
      >
        {[7, 30, 90].map((n) => (
          <option key={n} value={n}>
            Last {n} days
          </option>
        ))}
      </select>
      <ChevronDown size={13} />
    </label>
  );
}
export function Sales({ result }: { result: Read<SaleDay[]> }) {
  const [unit, set] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const data = result.state === 'ready' ? buckets(result.value, unit) : [];
  const max = Math.max(1, ...data.map((r) => r[1]));
  return (
    <section className="ad-panel ad-sales">
      <PanelHead title="Sales performance" kicker="Revenue ledger" />
      <div className="ad-chart-top">
        <fieldset className="ad-segments">
          <legend className="sr-only">Sales grouping</legend>
          {(['daily', 'weekly', 'monthly'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={unit === v} onClick={() => set(v)}>
              {v}
            </button>
          ))}
        </fieldset>
        <span className="ad-caption">INR</span>
      </div>
      {data.length ? (
        <>
          <div
            className="ad-plot"
            role="img"
            aria-label={`${unit} sales in Indian rupees. Exact values follow.`}
          >
            {data.map(([k, n]) => (
              <div
                key={k}
                style={{ height: `${Math.max(0, (n / max) * 100)}%` }}
                title={`${k}: ${money(n)}`}
              />
            ))}
          </div>
          <div className="ad-xaxis">
            <span>{stamp(data[0][0])}</span>
            <span>{stamp(data[data.length - 1][0])}</span>
          </div>
          <details className="ad-disclose">
            <summary>View sales values</summary>
            <DataTable
              title="Sales series"
              heads={['Period starting', 'Sales']}
              rows={data.map(([k, v]) => ({ key: k, cells: [k, money(v)] }))}
            />
          </details>
        </>
      ) : (
        <div className="ad-plot-empty">
          <StateBox state={result} noun={`${unit} sales`} icon={<ChartNoAxesColumnIncreasing size={24} />} />
        </div>
      )}
    </section>
  );
}
