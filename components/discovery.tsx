'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { categories, isSort, sortOptions } from '@/lib/content';
import { saveSort, useDevice } from '@/lib/device';
import { facetNames, parseQuery, queryHref, type Facet, type Query } from '@/lib/shop';
import { Modal } from './modal';
export type Facets = Record<Facet, string[]>;
const labels: Record<Facet, string> = {
  fabric: 'Fabric',
  size: 'Size',
  style: 'Style',
  colour: 'Colour',
  availability: 'Availability',
  occasion: 'Occasion',
};
function Filters({
  q,
  options,
  close,
  apply,
}: {
  q: Query;
  options: Facets;
  close: () => void;
  apply: (s: Query) => void;
}) {
  const [draft, setDraft] = useState(q);
  const [error, setError] = useState('');
  const toggle = (key: Facet, value: string) =>
    setDraft((s) => ({
      ...s,
      [key]: s[key].includes(value) ? s[key].filter((v) => v !== value) : [...s[key], value],
    }));
  return (
    <Modal title="Filter Kurtis" close={close} mode="sheet">
      <form
        className="filters-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.min && draft.max && Number(draft.min) > Number(draft.max)) {
            setError('The maximum price must be at least the minimum price.');
            return;
          }
          apply({ ...draft, page: 1 });
        }}
      >
        <div className="filter-body">
          <fieldset>
            <legend>Price range</legend>
            <div className="two-fields">
              {(['min', 'max'] as const).map((k) => (
                <label key={k}>
                  {k === 'min' ? 'Minimum' : 'Maximum'} (₹)
                  <input
                    type="number"
                    min="0"
                    max="9999999"
                    step="0.01"
                    inputMode="decimal"
                    value={draft[k]}
                    onChange={(e) => {
                      setError('');
                      setDraft({ ...draft, [k]: e.target.value });
                    }}
                  />
                </label>
              ))}
            </div>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
          </fieldset>
          {facetNames.map((k) => {
            const vals = Array.from(
              new Set([
                ...options[k],
                ...draft[k],
                ...(k === 'availability' ? ['In stock', 'Out of stock'] : []),
              ]),
            );
            return (
              <fieldset key={k}>
                <legend>{labels[k]}</legend>
                {vals.length ? (
                  <div className="filter-options">
                    {vals.map((v) => (
                      <label
                        key={v}
                        className={draft[k].includes(v) ? 'filter-option selected' : 'filter-option'}
                      >
                        <input type="checkbox" checked={draft[k].includes(v)} onChange={() => toggle(k, v)} />
                        {draft[k].includes(v) && <Check size={13} />} {v}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="small muted">{labels[k]} options appear when pieces are available.</p>
                )}
              </fieldset>
            );
          })}
        </div>
        <div className="filter-footer">
          <button
            type="button"
            className="underlink"
            onClick={() => {
              setError('');
              setDraft({ ...parseQuery({}), q: q.q, category: q.category, sort: q.sort, edit: q.edit });
            }}
          >
            Reset filters
          </button>
          <button type="submit" className="btn btn-dark">
            Apply filters
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function CollectionControls({ q, options, hasSort }: { q: Query; options: Facets; hasSort: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const saved = useDevice().sort;
  useEffect(() => {
    if (!hasSort && saved !== 'recommended' && q.sort !== saved)
      router.replace(queryHref({ ...q, sort: saved }), { scroll: false });
  }, [saved, hasSort, q, router]);
  const patch = (s: Query) => {
    setOpen(false);
    start(() => router.push(queryHref(s), { scroll: false }));
  };
  const pills: { label: string; q: Query }[] = [];
  if (q.min) pills.push({ label: `From ₹${q.min}`, q: { ...q, min: '', page: 1 } });
  if (q.max) pills.push({ label: `Up to ₹${q.max}`, q: { ...q, max: '', page: 1 } });
  for (const key of facetNames)
    for (const v of q[key])
      pills.push({ label: v, q: { ...q, [key]: q[key].filter((s) => s !== v), page: 1 } });
  return (
    <div className="discovery-controls" aria-busy={pending}>
      <div className="tools-row">
        <button type="button" className="filter-trigger" onClick={() => setOpen(true)}>
          <SlidersHorizontal size={17} />
          Filter{pills.length > 0 && <span>({pills.length})</span>}
        </button>
        <label className="sort-box">
          <span>
            {q.sort === 'recommended'
              ? 'Sort'
              : q.sort === 'newest'
                ? 'Newest'
                : q.sort === 'price-asc'
                  ? 'Price ↑'
                  : 'Price ↓'}
          </span>
          <select
            aria-label="Sort Kurtis"
            value={q.sort}
            onChange={(e) => {
              const s = e.target.value;
              if (isSort(s)) {
                saveSort(s);
                patch({ ...q, sort: s, page: 1 });
              }
            }}
          >
            {sortOptions.map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
      </div>
      <nav className="category-chips" aria-label="Kurti categories">
        {categories.map((c) => (
          <Link
            href={queryHref({ ...q, category: c.slug, page: 1 })}
            scroll={false}
            className={`chip ${c.slug === q.category ? 'selected' : ''}`}
            aria-current={c.slug === q.category ? 'page' : undefined}
            key={c.slug}
          >
            {c.short}
          </Link>
        ))}
      </nav>
      {pills.length > 0 && (
        <div className="active-filters">
          {pills.map((p) => (
            <Link
              key={queryHref(p.q)}
              href={queryHref(p.q)}
              scroll={false}
              aria-label={`Remove ${p.label} filter`}
            >
              {p.label}
              <X size={13} />
            </Link>
          ))}
        </div>
      )}
      <span className="sr-only" role="status">
        {pending ? 'Updating the collection…' : ''}
      </span>
      {open && <Filters q={q} options={options} close={() => setOpen(false)} apply={patch} />}
    </div>
  );
}
export function Retry() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-outline"
      disabled={pending}
      onClick={() => start(() => router.refresh())}
    >
      {pending ? 'Checking…' : 'Try again'}
    </button>
  );
}
