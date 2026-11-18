'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import type { Draft, ProductRecord, Costs } from '@/lib/admin/models';
import { blankDraft } from '@/lib/admin/models';
import { asRef, draftIssues } from '@/lib/admin/rules';
import { Button, Confirm, Heading, InfoBox, PanelHead, Tag, useCommand } from './workbench';
import { ListingFields, ListingPreview, MediaEditor, Pricing, Specs, Variants } from './product-fields';
const sections = [
  'Listing details',
  'Specifications',
  'Images',
  'Sizes & stock',
  'Pricing',
  'Preview',
] as const;
export function ProductEditor({
  record,
  defaults,
  preview = false,
}: {
  preview?: boolean;
  record?: ProductRecord;
  defaults?: Costs;
}) {
  const router = useRouter();
  const [d, update] = useState<Draft>(
      () => record?.draft ?? { ...blankDraft(), ...(defaults ? { costs: defaults } : {}) },
    ),
    [dirty, mark] = useState(false),
    [tab, open] = useState<(typeof sections)[number]>(preview ? 'Preview' : 'Listing details'),
    [confirm, ask] = useState<'publish' | 'cancel' | null>(null),
    [issues, issue] = useState<string[]>([]),
    [pendingPhotos, pending] = useState(false);
  const cmd = useCommand();
  function set(v: Draft) {
    mark(true);
    update(v);
    issue([]);
  }
  useEffect(() => {
    if (!dirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [dirty]);
  const save = async (intent: 'draft' | 'publish' | 'update') => {
    const errs = draftIssues(d, intent !== 'draft');
    if (pendingPhotos && tab === 'Images') errs.push('Upload or remove the selected local previews.');
    issue(errs);
    if (errs.length) return;
    await cmd.run(
      { op: 'product.save', ref: record ? asRef(record) : null, draft: d, intent },
      intent === 'publish' ? 'Product published.' : 'Product saved.',
      (v) => {
        mark(false);
        ask(null);
        router.replace(`/admin/products/${v.id}/edit`);
        router.refresh();
      },
    );
  };
  return (
    <>
      <Heading
        label="Catalogue / Product editor"
        title={record ? 'Edit product' : 'New product'}
        description="A considered listing, built from verified garment details."
      >
        <Tag value={record?.status ?? 'draft'}>{record ? undefined : 'Unsaved draft'}</Tag>
      </Heading>
      <div className="ad-editor-nav">
        {sections.map((s) => (
          <button key={s} type="button" aria-pressed={s === tab} onClick={() => open(s)}>
            {s}
          </button>
        ))}
      </div>
      <section className="ad-panel">
        <PanelHead
          title={tab}
          kicker={`Product record / ${String(sections.indexOf(tab) + 1).padStart(2, '0')}`}
        />
        {tab === 'Listing details' ? (
          <ListingFields d={d} set={set} />
        ) : tab === 'Specifications' ? (
          <Specs d={d} set={set} />
        ) : tab === 'Images' ? (
          <MediaEditor
            photos={d.images}
            change={(images) => set({ ...d, images })}
            rights={d.imageRights}
            onRights={(imageRights) => set({ ...d, imageRights })}
            onPending={pending}
          />
        ) : tab === 'Sizes & stock' ? (
          <Variants d={d} set={set} />
        ) : tab === 'Pricing' ? (
          <Pricing
            value={d.costs}
            set={(costs) => set({ ...d, costs })}
            price={d.pricePaise}
            setPrice={(pricePaise) => set({ ...d, pricePaise })}
          />
        ) : (
          <ListingPreview d={d} />
        )}
      </section>
      {issues.length > 0 && (
        <InfoBox error>
          <strong>Check the listing</strong>
          <ul>
            {issues.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </InfoBox>
      )}
      {cmd.error && <InfoBox error>{cmd.error}</InfoBox>}
      <div className="ad-actionbar">
        <button
          type="button"
          className="ad-textlink"
          onClick={() => (dirty ? ask('cancel') : router.push('/admin/products'))}
        >
          <ArrowLeft size={15} />
          Back to products
        </button>
        <div className="ad-row">
          <Button
            secondary
            busy={cmd.busy}
            onClick={() => save(record?.status === 'published' ? 'update' : 'draft')}
          >
            <Save size={15} />
            {record?.status === 'published' ? 'Save changes' : 'Save draft'}
          </Button>
          {record?.status !== 'published' && (
            <Button
              disabled={cmd.busy}
              onClick={() => {
                const e = draftIssues(d, true);
                issue(e);
                if (!e.length) ask('publish');
              }}
            >
              Publish product
            </Button>
          )}
        </div>
      </div>
      {confirm && (
        <Confirm
          title={confirm === 'publish' ? 'Publish this product?' : 'Discard unsaved changes?'}
          body={
            confirm === 'publish'
              ? 'The verified listing will become visible on the storefront.'
              : 'Leaving the editor will discard local edits. Saved records are not affected.'
          }
          confirm={confirm === 'publish' ? 'Confirm publication' : 'Discard and leave'}
          danger={confirm === 'cancel'}
          close={() => ask(null)}
          busy={cmd.busy}
          error={cmd.error}
          onConfirm={() => (confirm === 'publish' ? void save('publish') : router.push('/admin/products'))}
        />
      )}
    </>
  );
}
