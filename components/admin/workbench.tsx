'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useContext,
  useId,
  useState,
  useRef,
  useEffect,
  useCallback,
  useTransition,
  type ReactNode,
  type FormEvent,
} from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Check as CheckMark,
  Database,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Modal } from '@/components/modal';
import { mutate } from '@/lib/admin/actions';
import type { Command, Receipt } from '@/lib/admin/commands';
import { categoryValues, type Activity, type PageData, type Read } from '@/lib/admin/models';
import { human, lists, searchQuery, timed, type ListName, type ListQuery } from '@/lib/admin/rules';
const ctx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {});
export function Notices({ children }: { children: ReactNode }) {
  const [msg, set] = useState<{ text: string; kind: 'ok' | 'error'; at: number } | null>(null);
  const notify = useCallback(
    (text: string, kind: 'ok' | 'error' = 'ok') => set({ text, kind, at: Date.now() }),
    [],
  );
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => set(null), 8500);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ctx.Provider value={notify}>
      {children}
      <div className="ad-notices" aria-live="polite" aria-atomic="true">
        {msg && (
          <div className={`ad-notice ${msg.kind}`}>
            {msg.kind === 'ok' ? <CheckMark size={17} /> : <AlertCircle size={17} />}
            <span>{msg.text}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => set(null)}>
              <X size={17} />
            </button>
          </div>
        )}
      </div>
    </ctx.Provider>
  );
}
export const useNotice = () => useContext(ctx);
export function useCommand() {
  const router = useRouter(),
    note = useNotice();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false),
    attempt = useRef({ payload: '', key: '' });
  const [error, setError] = useState('');
  async function run(c: Command, success: string, onDone?: (v: Receipt) => void) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    const payload = JSON.stringify(c);
    if (attempt.current.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() };
    try {
      const r = await mutate(c, attempt.current.key);
      if (!r.ok) {
        setError(r.message);
        note(r.message, 'error');
        return false;
      }
      attempt.current = { payload: '', key: '' };
      note(success);
      if (onDone) onDone(r.value);
      else router.refresh();
      return true;
    } catch {
      const m = 'No confirmation was received. Refresh before retrying.';
      setError(m);
      note(m, 'error');
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run, clear: () => setError('') };
}
export function Button({
  children,
  onClick,
  secondary = false,
  danger = false,
  busy = false,
  disabled = false,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  danger?: boolean;
  busy?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      className={`ad-btn ${secondary ? 'light' : ''} ${danger ? 'danger' : ''}`}
      onClick={onClick}
      disabled={disabled || busy}
    >
      {busy && <LoaderCircle size={15} className="ad-spin" />}
      {children}
    </button>
  );
}
export function ALink({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <Link href={href} className={primary ? 'ad-btn' : 'ad-textlink'}>
      {children}
      {primary ? <ArrowRight size={15} /> : <ArrowUpRight size={14} />}
    </Link>
  );
}
export function Tag({ value, children }: { value: string; children?: ReactNode }) {
  return (
    <span className={`ad-tag ad-tag-${value}`}>
      <i />
      {children || human(value)}
    </span>
  );
}
export function Heading({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="ad-pagehead">
      <div>
        <div className="ad-over">
          <i />
          {label}
        </div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="ad-row">{children}</div>}
    </header>
  );
}
export function PanelHead({
  kicker,
  title,
  children,
}: {
  kicker?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="ad-panelhead">
      <div>
        {kicker && <div className="ad-over">{kicker}</div>}
        <h2>{title}</h2>
      </div>
      {children}
    </header>
  );
}
export function Empty({
  title,
  body,
  icon,
  action,
  compact = false,
}: {
  title: string;
  body: string;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`ad-empty ${compact ? 'compact' : ''}`}>
      <span className="ad-emptyicon">{icon || <Database size={21} />}</span>
      <strong>{title}</strong>
      <p>{body}</p>
      {action}
    </div>
  );
}
export function StateBox({
  state,
  noun = 'records',
  filtered = false,
  icon,
  action,
  retry,
}: {
  state: Read<unknown>;
  noun?: string;
  filtered?: boolean;
  icon?: ReactNode;
  action?: ReactNode;
  retry?: () => Promise<void>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (state.state === 'ready')
    return (
      <Empty
        icon={icon}
        title={filtered ? 'No matching records' : `No ${noun} yet`}
        body={
          filtered
            ? 'Change your filters or search to see more records.'
            : `When ${noun} are recorded, they will appear here.`
        }
        action={action}
      />
    );
  const title = {
    offline: `${human(noun)} not connected`,
    error: 'Unable to load this view',
    forbidden: 'Access restricted',
    missing: 'Record not found',
  }[state.state];
  return (
    <Empty
      icon={state.state === 'forbidden' ? <ShieldCheck /> : icon}
      title={title}
      body={
        state.state === 'offline'
          ? `This view will show ${noun} from the private store service.`
          : state.message
      }
      action={
        state.state === 'error' ? (
          <Button
            busy={pending}
            secondary
            onClick={() =>
              start(async () => {
                if (retry) await retry();
                else router.refresh();
              })
            }
          >
            <RefreshCw size={14} />
            Retry
          </Button>
        ) : (
          action
        )
      }
    />
  );
}
export function InfoBox({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={`ad-info ${error ? 'error' : ''}`} role={error ? 'alert' : undefined}>
      {error ? <AlertCircle size={16} /> : <Info size={16} />}
      <div>{children}</div>
    </div>
  );
}
export function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  hint,
  wide = false,
  min,
  max,
  step,
  placeholder,
  autoComplete,
  maxLength,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  hint?: string;
  wide?: boolean;
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={`ad-field ${wide ? 'wide' : ''}`}>
      <span>
        {label}
        {required && <b aria-hidden="true"> *</b>}
      </span>
      {type === 'textarea' ? (
        <textarea
          id={id}
          aria-describedby={hint ? `${id}-hint` : undefined}
          value={value}
          rows={4}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          maxLength={maxLength ?? 12000}
        />
      ) : (
        <input
          id={id}
          aria-describedby={hint ? `${id}-hint` : undefined}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          autoComplete={autoComplete}
          maxLength={maxLength ?? 240}
        />
      )}{' '}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </label>
  );
}
export function Check({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="ad-check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (string | readonly [string, string])[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="ad-field">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const [v, n] = typeof o === 'string' ? [o, human(o)] : o;
          return (
            <option value={v} key={v}>
              {n}
            </option>
          );
        })}
      </select>
    </label>
  );
}
export function Confirm({
  title,
  body,
  confirm,
  children,
  close,
  onConfirm,
  busy = false,
  danger = false,
  error,
}: {
  title: string;
  body: string;
  confirm: string;
  children?: ReactNode;
  close: () => void;
  onConfirm: () => void;
  busy?: boolean;
  danger?: boolean;
  error?: string;
}) {
  return (
    <Modal
      mode="sheet"
      title={title}
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="ad-dialog">
        <p>{body}</p>
        {children}
        {error && <InfoBox error>{error}</InfoBox>}
        <div className="ad-row">
          <Button secondary disabled={busy} onClick={close}>
            Go back
          </Button>
          <Button busy={busy} danger={danger} onClick={onConfirm}>
            {confirm}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
export function History({ rows }: { rows: Activity[] }) {
  return rows.length ? (
    <ol className="ad-history">
      {rows.map((v) => (
        <li key={v.id}>
          <i />
          <div>
            <strong>{v.label}</strong>
            {v.detail && <p>{v.detail}</p>}
            <small>
              {timed(v.at)} · {v.actor || 'Store service'}
            </small>
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <Empty compact title="No activity recorded" body="Changes will appear here with their date and source." />
  );
}
const display: Record<string, string> = {
  paid: 'Payment successful',
  'updated-desc': 'Last updated',
  'title-asc': 'Title: A–Z',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  'stock-asc': 'Stock: low to high',
  'stock-desc': 'Stock: high to low',
  'name-asc': 'Name: A–Z',
  'spend-desc': 'Highest spend',
  'value-desc': 'Highest order value',
  'rating-desc': 'Highest rating',
  'authorised-feed': 'Authorised source',
  recent: 'Last purchase',
};
export function Toolbar({
  kind,
  query,
  base,
  privateQuery,
}: {
  kind: ListName;
  query: ListQuery;
  base: string;
  privateQuery?: (q: ListQuery) => Promise<void>;
}) {
  const router = useRouter();
  const [q, set] = useState(query.q),
    [pending, start] = useTransition();
  const go = (p: Partial<ListQuery>) =>
    start(async () => {
      const next = { ...query, q, ...p, page: 1 };
      if (privateQuery && (next.q || query.q)) {
        await privateQuery(next);
        return;
      }
      router.push(`${base}${base.includes('?') ? '&' : '?'}${searchQuery(next)}`, { scroll: false });
    });
  const sel = (k: 'status' | 'sort' | 'category', list: readonly string[], title: string, all?: string) => (
    <label className="ad-select">
      <span>{title}</span>
      <select value={query[k]} aria-label={title} onChange={(e) => go({ [k]: e.target.value })}>
        {all && <option value="">{all}</option>}
        {list.map((v) => (
          <option key={v} value={v}>
            {display[v] || human(v)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="ad-toolbar" aria-busy={pending}>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          go({});
        }}
        className="ad-search"
      >
        <Search size={16} />
        <input
          aria-label={`Search ${kind}`}
          value={q}
          onChange={(e) => set(e.target.value)}
          placeholder={`Search ${kind}…`}
          maxLength={150}
        />
        <button type="submit" aria-label="Apply search">
          <ArrowRight size={15} />
        </button>
      </form>
      {lists[kind].status.length > 0 && sel('status', lists[kind].status, 'Filter', 'All statuses')}
      {kind === 'products' && sel('category', categoryValues, 'Category', 'All categories')}
      {sel('sort', lists[kind].sort, 'Sort by')}
      {(query.q || query.status || query.category || query.customerId) &&
        (privateQuery && query.q ? (
          <button
            type="button"
            className="ad-textlink"
            onClick={() => {
              set('');
              go({ q: '', sort: lists[kind].sort[0], category: '', status: '', customerId: '' });
            }}
          >
            Clear filters
          </button>
        ) : (
          <Link className="ad-textlink" href={base}>
            Clear filters
          </Link>
        ))}
      {pending && <LoaderCircle size={15} className="ad-spin" />}
    </div>
  );
}
export function Pager({
  data,
  query,
  base,
  privateQuery,
}: {
  data: PageData<unknown>;
  query: ListQuery;
  base: string;
  privateQuery?: (q: ListQuery) => Promise<void>;
}) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <nav className="ad-pager" aria-label="Result pages">
      <span>
        {data.total.toLocaleString('en-IN')} records · Page {data.page} of {pages}
      </span>
      <div>
        {[
          [-1, 'Previous'],
          [1, 'Next'],
        ].map(([delta, label]) => {
          const n = data.page + Number(delta);
          if (n < 1 || n > pages) return null;
          const next = { ...query, page: n };
          return privateQuery && query.q ? (
            <button type="button" className="ad-textlink" key={label} onClick={() => privateQuery(next)}>
              {label}
            </button>
          ) : (
            <Link key={label} href={`${base}${base.includes('?') ? '&' : '?'}${searchQuery(next)}`}>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
export function DataTable({
  title,
  heads,
  rows,
}: {
  title: string;
  heads: string[];
  rows: { key: string; cells: ReactNode[] }[];
}) {
  const ref = useRef<HTMLElement>(null);
  const [overflow, set] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => set(el.scrollWidth > el.clientWidth + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <section
      className="ad-table-wrap"
      ref={ref}
      tabIndex={overflow ? 0 : undefined}
      aria-label={`${title}, scroll for all columns`}
    >
      <table className="ad-table">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, i) => (
                <td key={heads[i]} data-label={heads[i]}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
