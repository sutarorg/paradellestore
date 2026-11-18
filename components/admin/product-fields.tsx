'use client';
import { PrivateImage } from './private-image';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, ImagePlus, Maximize2, Plus, Trash2, Upload } from 'lucide-react';
import { Modal } from '@/components/modal';
import { uploadPhoto } from '@/lib/admin/actions';
import {
  categoryValues,
  attrs,
  attrNames,
  type Costs,
  type Draft,
  type Photo,
  type FeedReview,
} from '@/lib/admin/models';
import { commercePrice, contribution, minor } from '@/lib/admin/rules';
import { money } from '@/lib/shop';
import { Button, Check, Field, Select, InfoBox, Empty, Tag, useNotice } from './workbench';
export function MoneyField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: string;
}) {
  return (
    <Field
      label={label}
      value={value == null ? '' : value / 100}
      onChange={(s) => onChange(minor(s))}
      type="number"
      step="0.01"
      min={0}
      hint={hint}
    />
  );
}
export function Pricing({
  value,
  set,
  price,
  setPrice,
  defaults = false,
}: {
  value: Costs;
  set: (c: Costs) => void;
  price?: number | null;
  setPrice?: (n: number | null) => void;
  defaults?: boolean;
}) {
  const costFields = [
    ['source', 'Sourcing cost'],
    ['extras', 'Other sourcing expenses'],
    ['packaging', 'Packaging'],
    ['shipping', 'Shipping'],
    ['feeFixed', 'Fixed payment fees'],
    ['reserve', 'Returns reserve'],
  ] as const;
  const calc = commercePrice(value);
  const current = price != null && calc.ok ? contribution(price, calc) : null;
  return (
    <div className="ad-stack">
      <InfoBox>
        All amounts are in INR per unit. Optional blank costs are excluded from the estimate. Check actual
        fees, tax and shipping before publication.
      </InfoBox>
      <div className="ad-formgrid">
        {costFields.map(([k, label]) => (
          <MoneyField
            key={k}
            label={`${label} (₹)`}
            value={value[k]}
            onChange={(n) => set({ ...value, [k]: n })}
          />
        ))}
        <Field
          label="Payment fee on selling price (%)"
          type="number"
          min={0}
          max={99.99}
          step="0.01"
          value={value.feeRate == null ? '' : value.feeRate / 100}
          onChange={(v) => set({ ...value, feeRate: minor(v) })}
        />
        <Field
          label="Target contribution margin (%)"
          type="number"
          min={0}
          max={99.99}
          step="0.01"
          value={value.margin == null ? '' : value.margin / 100}
          onChange={(v) => set({ ...value, margin: minor(v) })}
        />
        <Select
          label="GST treatment"
          value={value.tax}
          options={[
            ['unspecified', 'Choose treatment'],
            ['none', 'No GST modelled'],
            ['inclusive', 'GST included in selling price'],
          ]}
          onChange={(v) => set({ ...value, tax: v as Costs['tax'] })}
        />
        {value.tax === 'inclusive' && (
          <Field
            label="GST rate (%)"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={value.gst == null ? '' : value.gst / 100}
            onChange={(v) => set({ ...value, gst: minor(v) })}
          />
        )}
      </div>
      <Check
        label="Suggest ₹99 endings only when rounding up adds no more than 10%."
        value={value.endings}
        onChange={(v) => set({ ...value, endings: v })}
      />
      {!defaults && (
        <div className="ad-pricebox">
          <div className="ad-over">Pricing calculation</div>
          {calc.ok ? (
            <>
              <dl className="ad-numbers">
                {[
                  ['Minimum · break-even', money(calc.min)],
                  ['Recommended', money(calc.recommended)],
                  ['Premium · +5 margin points', calc.premium == null ? 'Not feasible' : money(calc.premium)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              {setPrice && (
                <Button secondary onClick={() => setPrice(calc.recommended)}>
                  Use recommended price
                  <ArrowRight size={14} />
                </Button>
              )}
            </>
          ) : (
            <p>{calc.message}</p>
          )}
        </div>
      )}
      {setPrice && (
        <>
          <MoneyField label="Actual selling price (₹)" value={price ?? null} onChange={setPrice} />
          <div className="ad-summaryline">
            <span>
              Estimated contribution <b>{current ? money(current.amount) : '—'}</b>
            </span>
            <span>
              Estimated margin <b>{current?.percent != null ? `${current.percent.toFixed(2)}%` : '—'}</b>
            </span>
          </div>
        </>
      )}
      <details className="ad-disclose">
        <summary>How prices are calculated</summary>
        <p>
          Net sales exclude inclusive GST. Contribution is net sales minus unit costs, reserve and payment
          fees. Recommended price meets your target margin on net sales. Premium targets five additional
          percentage points. These are planning figures, not a discount or MRP.
        </p>
      </details>
    </div>
  );
}
export function ListingFields({
  d,
  set,
  includeSpecs = false,
}: {
  d: Draft;
  set: (d: Draft) => void;
  includeSpecs?: boolean;
}) {
  const patch = (p: Partial<Draft>) => set({ ...d, ...p, factsVerified: false });
  return (
    <div className="ad-stack">
      <div className="ad-formgrid">
        <Field wide required label="Product title" value={d.title} onChange={(title) => patch({ title })} />
        <Field
          label="Product slug"
          value={d.slug}
          onChange={(slug) => patch({ slug })}
          hint="Lowercase words separated by hyphens."
        />
        <Field label="Product SKU" value={d.sku} onChange={(sku) => patch({ sku })} />
        <Select
          label="Category"
          value={d.category}
          options={[['', 'Choose category'], ...categoryValues]}
          onChange={(category) => patch({ category: category as Draft['category'] })}
        />
        <Field
          label="Tags"
          hint="Separate tags with commas."
          value={d.tags}
          onChange={(tags) => patch({ tags })}
        />
        <Field
          wide
          label="Short description"
          type="textarea"
          value={d.shortDescription}
          onChange={(shortDescription) => patch({ shortDescription })}
        />
        <Field
          wide
          label="Full description"
          type="textarea"
          value={d.description}
          onChange={(description) => patch({ description })}
        />
      </div>
      {includeSpecs && <Specs d={d} set={set} />}
      <details className="ad-disclose">
        <summary>Search engine listing</summary>
        <div className="ad-formgrid">
          <Field label="SEO title" value={d.seoTitle} onChange={(seoTitle) => patch({ seoTitle })} />
          <Field
            label="Meta description"
            type="textarea"
            value={d.seoDescription}
            onChange={(seoDescription) => patch({ seoDescription })}
          />
        </div>
      </details>
    </div>
  );
}
export function Specs({ d, set }: { d: Draft; set: (d: Draft) => void }) {
  return (
    <div className="ad-stack">
      <InfoBox>Describe only verified garment details. Leave unknown specifications blank.</InfoBox>
      <div className="ad-formgrid">
        {attrs.map((k) => (
          <Field
            key={k}
            label={attrNames[k]}
            type={['care', 'measurements', 'specifications'].includes(k) ? 'textarea' : 'text'}
            value={d.attrs[k]}
            onChange={(v) => set({ ...d, attrs: { ...d.attrs, [k]: v }, factsVerified: false })}
          />
        ))}
      </div>
      <Check
        label="I have checked the listing and specifications against authorised source information."
        value={d.factsVerified}
        onChange={(factsVerified) => set({ ...d, factsVerified })}
      />
    </div>
  );
}
export function Variants({ d, set }: { d: Draft; set: (d: Draft) => void }) {
  const list = d.variants;
  function replace(i: number, p: Partial<Draft['variants'][number]>) {
    set({ ...d, variants: list.map((v, j) => (i === j ? { ...v, ...p } : v)) });
  }
  return (
    <div className="ad-stack">
      <p className="ad-muted">
        Stock is managed per size, not synchronised from Meesho. Disabled sizes cannot be purchased.
      </p>
      {!list.length && (
        <Empty
          compact
          title="No sizes added"
          body="Add the first size with its own SKU and stock quantity."
        />
      )}
      {list.map((v, i) => (
        <div className="ad-variant" key={v.id}>
          <Field label="Size" value={v.size} onChange={(size) => replace(i, { size })} />
          <Field label="Variant SKU" value={v.sku} onChange={(sku) => replace(i, { sku })} />
          <Field
            label="Stock"
            type="number"
            value={v.stock}
            min={0}
            step="1"
            onChange={(s) => replace(i, { stock: Number(s) })}
          />
          <Check label="Enabled" value={v.enabled} onChange={(enabled) => replace(i, { enabled })} />
          <button
            type="button"
            className="ad-icon"
            aria-label={`Remove size ${v.size || i + 1}`}
            onClick={() => set({ ...d, variants: list.filter((x) => x.id !== v.id) })}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <div>
        <Button
          secondary
          disabled={list.length >= 40}
          onClick={() =>
            set({
              ...d,
              variants: [...list, { id: crypto.randomUUID(), size: '', sku: '', stock: 0, enabled: true }],
            })
          }
        >
          <Plus size={15} />
          Add size
        </Button>
      </div>
    </div>
  );
}
const up = (arr: Photo[], from: number, to: number) => {
  const a = [...arr];
  a.splice(to, 0, ...a.splice(from, 1));
  return a;
};
export function MediaEditor({
  photos,
  change,
  rights,
  onRights,
  purpose = 'product',
  max = 20,
  onPending,
}: {
  photos: Photo[];
  change: (p: Photo[]) => void;
  rights: boolean;
  onRights: (v: boolean) => void;
  purpose?: 'product' | 'reference' | 'logo';
  max?: number;
  onPending?: (v: boolean) => void;
}) {
  const [pending, setPending] = useState<{ id: string; file: File; src: string; alt: string }[]>([]),
    [err, setErr] = useState(''),
    [busy, wait] = useState(false),
    [zoom, see] = useState<{ src: string; alt: string } | null>(null);
  const urls = useRef(new Set<string>());
  const notify = useNotice();
  useEffect(() => {
    const set = urls.current;
    return () => {
      for (const s of set) URL.revokeObjectURL(s);
    };
  }, []);
  useEffect(() => {
    onPending?.(pending.length > 0);
  }, [pending.length, onPending]);
  function select(files: FileList | null) {
    if (!files) return;
    const a = Array.from(files);
    if (
      a.length + pending.length + photos.length > max ||
      a.some(
        (f) => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || !f.size || f.size > 4194304,
      )
    ) {
      setErr(`Choose up to ${max} JPEG, PNG or WebP images, each at most 4 MB.`);
      return;
    }
    const newOnes = a.map((file) => {
      const src = URL.createObjectURL(file);
      urls.current.add(src);
      return { id: crypto.randomUUID(), file, src, alt: '' };
    });
    setPending([...pending, ...newOnes]);
    setErr('');
  }
  async function send() {
    if (!rights) {
      setErr('Confirm image rights before uploading.');
      return;
    }
    wait(true);
    setErr('');
    const saved = [...photos];
    try {
      for (const p of pending) {
        const f = new FormData();
        f.set('purpose', purpose);
        f.set('rights', 'confirmed');
        f.set('file', p.file);
        const r = await uploadPhoto(f);
        if (!r.ok) {
          setErr(r.message);
          break;
        }
        saved.push({ ...r.value, alt: p.alt || r.value.alt });
        change([...saved]);
        setPending((prev) => prev.filter((item) => item.id !== p.id));
        URL.revokeObjectURL(p.src);
        urls.current.delete(p.src);
        notify('Image uploaded to private storage.');
      }
    } catch {
      setErr('Upload was not confirmed. Check storage before retrying.');
    } finally {
      wait(false);
    }
  }
  return (
    <div className="ad-stack">
      <Check label="The business has the right to use these images." value={rights} onChange={onRights} />
      {photos.length + pending.length < max && (
        <label className="ad-drop">
          <ImagePlus size={23} />
          <strong>
            Choose{' '}
            {purpose === 'reference' ? 'reference images' : purpose === 'logo' ? 'a logo' : 'product images'}
          </strong>
          <small>JPEG, PNG or WebP · up to 4 MB each</small>
          <input
            aria-label="Choose image files"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple={max > 1}
            disabled={busy}
            onChange={(e) => {
              select(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      )}
      {err && <InfoBox error>{err}</InfoBox>}
      {pending.length > 0 && (
        <>
          <div className="ad-over">Local previews · not uploaded</div>
          <p className="ad-muted">
            Selected files stay in this view until uploaded. Leaving this section discards local previews.
          </p>
          <div className="ad-mediagrid">
            {pending.map((p, i) => (
              <div className="ad-photocard" key={p.id}>
                <button
                  type="button"
                  className="ad-photozoom"
                  aria-label={`Preview selected image ${i + 1}`}
                  onClick={() => see(p)}
                >
                  <PrivateImage alt={p.alt || 'Selected image preview'} src={p.src} />
                  <Maximize2 size={15} />
                </button>
                <Field
                  label="Image description"
                  value={p.alt}
                  onChange={(alt) =>
                    setPending((prev) => prev.map((x) => (x.id === p.id ? { ...x, alt } : x)))
                  }
                />
                <button
                  type="button"
                  className="ad-textlink"
                  disabled={busy}
                  onClick={() => {
                    setPending((prev) => prev.filter((x) => x.id !== p.id));
                    URL.revokeObjectURL(p.src);
                    urls.current.delete(p.src);
                  }}
                >
                  Remove preview
                </button>
              </div>
            ))}
          </div>
          <div>
            <Button busy={busy} onClick={send}>
              <Upload size={14} />
              Upload selected files
            </Button>
          </div>
        </>
      )}
      {photos.length > 0 && (
        <div className="ad-mediagrid">
          {photos.map((p, i) => (
            <div className="ad-photocard" key={p.id}>
              <button
                type="button"
                className="ad-photozoom"
                aria-label={`Preview image ${i + 1}`}
                onClick={() => see(p)}
              >
                <PrivateImage
                  src={p.src}
                  alt={p.alt || 'Authorised image'}
                  width={p.width}
                  height={p.height}
                />
                <Maximize2 size={14} />
              </button>
              <strong>{i === 0 ? 'Main image' : `Image ${i + 1}`}</strong>
              <Field
                label="Image description"
                value={p.alt}
                onChange={(alt) => change(photos.map((x) => (x.id === p.id ? { ...x, alt } : x)))}
              />
              <div className="ad-row">
                {i > 0 && (
                  <button className="ad-textlink" type="button" onClick={() => change(up(photos, i, 0))}>
                    Set main
                  </button>
                )}
                <button
                  className="ad-icon"
                  type="button"
                  disabled={i === 0}
                  aria-label={`Move image ${i + 1} earlier`}
                  onClick={() => change(up(photos, i, i - 1))}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="ad-icon"
                  disabled={i === photos.length - 1}
                  type="button"
                  aria-label={`Move image ${i + 1} later`}
                  onClick={() => change(up(photos, i, i + 1))}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  className="ad-icon"
                  type="button"
                  aria-label={`Remove image ${i + 1} from listing`}
                  onClick={() => change(photos.filter((x) => x.id !== p.id))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {zoom && (
        <Modal title="Image preview" mode="gallery" close={() => see(null)}>
          <PrivateImage className="ad-fullphoto" src={zoom.src} alt={zoom.alt || 'Image preview'} />
        </Modal>
      )}
    </div>
  );
}
export function ListingPreview({ d, reviews = [] }: { d: Draft; reviews?: FeedReview[] }) {
  return (
    <div className="ad-preview">
      <div className="ad-preview-art">
        {d.images.length ? (
          d.images.map((p) => (
            <PrivateImage key={p.id} src={p.src} alt={p.alt} width={p.width} height={p.height} />
          ))
        ) : (
          <Empty
            compact
            title="No main image"
            body="Approved product imagery will appear here."
            icon={<ImagePlus size={23} />}
          />
        )}
      </div>
      <div className="ad-stack">
        <div className="ad-over">Listing preview · not a live product</div>
        <h3>{d.title || 'Title not entered'}</h3>
        <strong>{d.pricePaise != null ? money(d.pricePaise) : 'Selling price not entered'}</strong>
        {d.shortDescription && <p>{d.shortDescription}</p>}
        <p className="ad-preline">{d.description || 'No full description entered.'}</p>
        <div className="ad-row">
          {d.variants
            .filter((v) => v.enabled)
            .map((v) => (
              <Tag key={v.id} value="size">
                {v.size} · {v.stock > 0 ? 'Available' : 'Out of stock'}
              </Tag>
            ))}
        </div>
        <dl className="ad-dl">
          {attrs
            .filter((k) => d.attrs[k])
            .map((k) => (
              <div key={k}>
                <dt>{attrNames[k]}</dt>
                <dd>{d.attrs[k]}</dd>
              </div>
            ))}
        </dl>
        {reviews
          .filter((r) => r.approved && r.permission === 'granted')
          .map((r) => (
            <blockquote key={r.id}>
              {r.rating}/5 · {r.body}
              <footer>Authorised source: {r.source}</footer>
            </blockquote>
          ))}
      </div>
    </div>
  );
}
