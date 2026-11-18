'use client';
import { PrivateImage } from './private-image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Clock3,
  FileSearch,
  Image as ImageIcon,
  Layers3,
  RefreshCw,
  ScanLine,
  ShieldCheck,
} from 'lucide-react';
import { Modal } from '@/components/modal';
import {
  type Draft,
  type Fact,
  type Job,
  type JobRow,
  type PageData,
  type Photo,
  type Read,
  blankDraft,
  slots,
} from '@/lib/admin/models';
import type { Command, Receipt } from '@/lib/admin/commands';
import {
  asRef,
  draftIssues,
  human,
  importIssues,
  meeshoUrl,
  stamp,
  verifiedFacts,
  type ListQuery,
} from '@/lib/admin/rules';
import { refreshJob } from '@/lib/admin/actions';
import {
  Button,
  Check,
  Confirm,
  DataTable,
  Empty,
  Field,
  Heading,
  InfoBox,
  Pager,
  PanelHead,
  StateBox,
  Tag,
  Toolbar,
  useCommand,
} from './workbench';
import { ListingFields, ListingPreview, MediaEditor, Pricing, Variants } from './product-fields';
const steps = [
  'Source link',
  'Source facts',
  'Listing copy',
  'Image direction',
  'Review rights',
  'Pricing',
  'Final approval',
  'Job tracker',
];
const factFields = [
  ['title', 'Source title'],
  ['price', 'Source price (₹)'],
  ['fabric', 'Fabric'],
  ['pattern', 'Pattern'],
  ['colour', 'Colours'],
  ['sizes', 'Available sizes'],
  ['category', 'Verified category'],
  ['sleeve', 'Sleeves'],
  ['neckline', 'Neckline'],
  ['length', 'Length'],
  ['occasion', 'Occasion'],
  ['care', 'Care instructions'],
  ['measurements', 'Measurements'],
  ['description', 'Source description'],
  ['sourceUrl', 'Original source URL'],
] as const;
const states = ['extraction', 'content', 'images', 'reviews', 'approval'] as const;
type Props = {
  initial: Read<Job> | null;
  jobs: Read<PageData<JobRow>>;
  query: ListQuery;
  initialStep: number;
};
function mergeFacts(list: Fact[], url: string) {
  const items = factFields.map(
    ([field]) =>
      list.find((f) => f.field === field) ?? {
        field,
        value: field === 'sourceUrl' ? url : '',
        verified: false,
        origin: 'manual' as const,
      },
  );
  return [...items, ...list.filter((f) => !items.some((i) => i.field === f.field))];
}
function active(j: Job) {
  return [j.stages.extraction, j.stages.content, j.stages.images, j.stages.reviews].some(
    (s) => s === 'running' || s === 'queued',
  );
}
function Tracker({
  jobs,
  job,
  query,
  retry,
  refresh,
  busy,
}: {
  jobs: Props['jobs'];
  job: Job | null;
  query: ListQuery;
  retry: (s: 'extraction' | 'content' | 'images' | 'reviews') => void;
  refresh: () => void;
  busy: boolean;
}) {
  return (
    <div className="ad-stack">
      {job && (
        <div className="ad-block">
          <div className="ad-split">
            <div>
              <div className="ad-over">Current job</div>
              <strong>{job.id}</strong>
            </div>
            <Button secondary onClick={refresh} busy={busy}>
              <RefreshCw size={14} />
              Refresh status
            </Button>
          </div>
          <p className="ad-break">{job.sourceUrl}</p>
          <dl className="ad-dl">
            {states.map((k) => (
              <div key={k}>
                <dt>{human(k)}</dt>
                <dd>
                  <Tag value={job.stages[k]} />
                  {k !== 'approval' && job.stages[k] === 'failed' && (
                    <button type="button" className="ad-textlink" onClick={() => retry(k)}>
                      Retry {k}
                    </button>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {job.error && <InfoBox error>{job.error}</InfoBox>}
        </div>
      )}
      <Toolbar kind="imports" query={query} base="/admin/importer?step=8" />
      <DataTable
        title="Import jobs"
        heads={[
          'Job',
          'Source URL',
          'Extraction',
          'Content',
          'Images',
          'Reviews',
          'Approval',
          'Updated',
          'Workspace',
        ]}
        rows={(jobs.state === 'ready' ? jobs.value.rows : []).map((j) => ({
          key: j.id,
          cells: [
            j.id,
            j.sourceUrl,
            ...states.map((k) => <Tag key={k} value={j.stages[k]} />),
            stamp(j.updatedAt),
            <Link key="open" className="ad-textlink" href={`/admin/importer?job=${j.id}&step=8`}>
              Open job
            </Link>,
          ],
        }))}
      />
      {(jobs.state !== 'ready' || !jobs.value.rows.length) && (
        <StateBox
          state={jobs}
          noun="import jobs"
          icon={<Clock3 size={22} />}
          filtered={!!(query.q || query.status)}
        />
      )}{' '}
      {jobs.state === 'ready' && <Pager base="/admin/importer?step=8" data={jobs.value} query={query} />}
    </div>
  );
}
export function ImportStudio({ initial, jobs, query, initialStep }: Props) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(() => (initial?.state === 'ready' ? initial.value : null)),
    [step, setStep] = useState(initialStep),
    [url, setUrl] = useState(job?.sourceUrl ?? ''),
    [authority, authorise] = useState(!!job),
    [facts, setFacts] = useState<Fact[]>(() => mergeFacts(job?.facts ?? [], job?.sourceUrl ?? '')),
    [d, writeDraft] = useState<Draft>(() => job?.draft ?? blankDraft()),
    [refs, setRefs] = useState<Photo[]>(job?.references ?? []),
    [rights, right] = useState(job?.rightsConfirmed ?? false),
    [err, error] = useState(''),
    [conflict, setConflict] = useState(false),
    [pollError, pollFail] = useState(''),
    [refreshing, wait] = useState(false),
    [confirm, ask] = useState<{
      title: string;
      body: string;
      action: (alt?: string) => void;
      image?: Photo;
      label: string;
      danger?: boolean;
    } | null>(null),
    [alt, setAlt] = useState(''),
    [zoom, see] = useState<Photo | null>(null);
  const cmd = useCommand(),
    seen = useRef(job?.revision ?? -1),
    draftDirty = useRef(false),
    saved = useRef({ draft: JSON.stringify(job?.draft), facts: JSON.stringify(job?.facts) }),
    factsDirty = useRef(false),
    refsDirty = useRef(false),
    alive = useRef(true),
    refreshLock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function setD(v: Draft) {
    draftDirty.current = true;
    writeDraft(v);
  }
  const apply = useCallback((j: Job) => {
    if (j.revision <= seen.current) return;
    seen.current = j.revision;
    const snapshot = { draft: JSON.stringify(j.draft), facts: JSON.stringify(j.facts) };
    // Worker-only progress is safe to merge; a concurrent change to the evidence or copy being edited is not.
    if (
      (draftDirty.current && snapshot.draft !== saved.current.draft) ||
      (factsDirty.current && snapshot.facts !== saved.current.facts)
    )
      setConflict(true);
    if (!draftDirty.current) writeDraft(j.draft ?? blankDraft());
    if (!factsDirty.current) setFacts(mergeFacts(j.facts, j.sourceUrl));
    if (!refsDirty.current) setRefs(j.references);
    saved.current = snapshot;
    setJob(j);
  }, []);
  useEffect(() => {
    if (initial?.state === 'ready') apply(initial.value);
  }, [apply, initial]);
  const refresh = useCallback(
    async (id: string) => {
      if (refreshLock.current) return;
      refreshLock.current = true;
      wait(true);
      try {
        const r = await refreshJob(id);
        if (!alive.current) return;
        if (r.state === 'ready') {
          apply(r.value);
          pollFail('');
        } else pollFail(r.message);
      } catch {
        if (alive.current) pollFail('Job status could not be refreshed. Use Refresh status to retry.');
      } finally {
        refreshLock.current = false;
        if (alive.current) wait(false);
      }
    },
    [apply],
  );
  const running = job && active(job);
  useEffect(() => {
    if (!job || !running || pollError) return;
    const id = job.id;
    const t = setInterval(() => {
      if (!document.hidden) void refresh(id);
    }, 4500);
    return () => clearInterval(t);
  }, [job, running, pollError, refresh]);
  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);
  function nav(n: number) {
    setStep(n);
    error('');
    cmd.clear();
    const u = new URL(window.location.href);
    u.searchParams.set('step', String(n));
    window.history.replaceState(null, '', u.pathname + u.search);
    if (n === 8) router.refresh();
  }
  const locked = job?.stages.approval === 'published' || job?.stages.approval === 'cancelled';
  const requiredJob = () => {
    if (!job) {
      error('Start or resume an import job before saving or requesting a task.');
      return false;
    }
    if (locked) {
      error('This job is closed. Start a new import for further changes.');
      return false;
    }
    return true;
  };
  const run = async (c: Command, msg: string, done?: (r: Receipt) => void) => {
    error('');
    if (conflict) {
      error('The saved record changed. Review the latest version before continuing.');
      return false;
    }
    const result = await cmd.run(c, msg, (r) => {
      if (c.op === 'import.save-listing') draftDirty.current = false;
      if (c.op === 'import.facts') factsDirty.current = false;
      ask(null);
      if (done) done(r);
      else if (job) void refresh(job.id);
    });
    return result;
  };
  function start(method: 'extract' | 'manual') {
    const u = meeshoUrl(url);
    if (!u) {
      error('Enter a valid HTTPS Meesho product URL with a /p/ product identifier.');
      return;
    }
    if (!authority) {
      error('Confirm you are authorised to use this source.');
      return;
    }
    void run(
      { op: 'import.start', url: u, method, authorised: true },
      method === 'extract' ? 'Extraction queued.' : 'Manual import job created.',
      (r) => router.push(`/admin/importer?job=${r.id}&step=2`),
    );
  }
  function changeFact(field: string, p: Partial<Fact>) {
    factsDirty.current = true;
    setFacts((fs) => fs.map((f) => (f.field === field ? { ...f, ...p } : f)));
  }
  const preview: Draft = {
    ...d,
    images: (job?.images ?? [])
      .filter((s) => s.approved && s.status === 'ready' && s.photo)
      .sort((a, b) => a.slot - b.slot)
      .flatMap((s) => (s.photo ? [s.photo] : [])),
    imageRights: job?.rightsConfirmed ?? false,
  };
  const savedFacts = verifiedFacts(job?.facts ?? []);
  const publish = () => {
    const issues = importIssues(preview, job);
    if (issues.length) {
      error(issues.join(' '));
      return;
    }
    if (job)
      ask({
        title: 'Approve and publish this Kurti?',
        body: 'Publish this checked listing, its five approved images and only explicitly approved, authorised reviews. This makes the product visible to shoppers.',
        label: 'Approve & publish',
        action: () =>
          void run(
            { op: 'import.finish', ref: asRef(job), draft: preview, intent: 'publish' },
            'Import approved and product published.',
            (r) => router.push(`/admin/products/${r.productId ?? r.id}/edit`),
          ),
      });
  };
  const actImage = (slot: number, action: 'regenerate' | 'remove' | 'approve') => {
    if (!job || !requiredJob()) return;
    const body =
      action === 'approve'
        ? 'Confirm usage rights and compare with the reference: colour, print, embroidery, neck, sleeves, length and garment construction must match.'
        : action === 'remove'
          ? 'Remove this output from the job. A new square image in this slot will be needed before publishing.'
          : 'Queue a new output for this slot only. Its previous approval will be cleared.';
    const image = job.images.find((v) => v.slot === slot)?.photo;
    setAlt(image?.alt ?? '');
    ask({
      image: action === 'approve' && image ? image : undefined,
      title: `${human(action)} ${slots[slot].toLowerCase()}?`,
      body,
      label: human(action),
      danger: action === 'remove',
      action: (description) =>
        void run(
          {
            op: 'import.image',
            ref: asRef(job),
            slot,
            action,
            ...(action === 'approve' ? { alt: description?.trim() } : {}),
          },
          action === 'regenerate' ? 'Regeneration queued.' : 'Image decision recorded.',
        ),
    });
  };
  if (initial && initial.state !== 'ready')
    return (
      <>
        <Heading title="Import studio" label="Catalogue / Sourcing" />
        <section className="ad-panel">
          <StateBox
            state={initial}
            noun="import records"
            action={
              <Link className="ad-textlink" href="/admin/importer">
                Open a new workspace
              </Link>
            }
          />
        </section>
      </>
    );
  return (
    <>
      <Heading
        label="Catalogue / Sourcing"
        title="Import studio"
        description="From authorised source to a human-approved PARADELLE listing."
      >
        <button type="button" className="ad-btn light" onClick={() => nav(8)}>
          <Clock3 size={15} />
          Job tracker
        </button>
      </Heading>
      <div className="ad-importgrid">
        <label className="ad-mobile-step">
          Workflow step
          <select aria-label="Workflow step" value={step} onChange={(e) => nav(Number(e.target.value))}>
            {steps.map((s, i) => (
              <option key={s} value={i + 1}>
                {String(i + 1).padStart(2, '0')} · {s}
              </option>
            ))}
          </select>
        </label>
        <aside className="ad-steps">
          <div className="ad-over">
            <Layers3 size={14} />
            Import sequence
          </div>
          {steps.map((s, i) => (
            <button
              key={s}
              type="button"
              aria-current={step === i + 1 ? 'step' : undefined}
              onClick={() => nav(i + 1)}
            >
              <span>{String(i + 1).padStart(2, '0')}</span>
              {s}
              <ChevronRight size={13} />
            </button>
          ))}
          <div className="ad-stepnote">
            <ShieldCheck size={17} />
            <p>Nothing publishes without your approval.</p>
          </div>
        </aside>
        <div className="ad-workarea">
          <section className="ad-panel">
            <PanelHead
              kicker={`Step ${String(step).padStart(2, '0')} / 08`}
              title={
                [
                  'Import a Kurti from Meesho',
                  'Verify source details',
                  'Prepare the listing',
                  'Direct five garment images',
                  'Authorised reviews',
                  'Plan the selling price',
                  'Final listing preview',
                  'Import job tracker',
                ][step - 1]
              }
            />
            {job && (
              <div className="ad-joblabel">
                <span>Job {job.id}</span>
                <Tag value={job.stages.approval} />
              </div>
            )}
            {conflict && (
              <InfoBox error>
                The saved facts or listing changed while you were editing. Your local text is still visible.{' '}
                <button
                  type="button"
                  className="ad-textlink"
                  onClick={() =>
                    ask({
                      title: 'Discard local edits and reload?',
                      label: 'Reload saved job',
                      body: 'This replaces your local edits with the current saved record.',
                      danger: true,
                      action: () => window.location.reload(),
                    })
                  }
                >
                  Review latest version
                </button>
              </InfoBox>
            )}
            {locked && <InfoBox>This job is {job?.stages.approval}. The record is read-only.</InfoBox>}
            {running && (
              <div className="ad-fine" role="status">
                <RefreshCw size={14} className="ad-spin" />A task is queued or running. You can safely leave
                and resume this job.
              </div>
            )}
            {pollError && (
              <InfoBox error>
                {pollError}{' '}
                {job && (
                  <button className="ad-textlink" type="button" onClick={() => refresh(job.id)}>
                    Retry status
                  </button>
                )}
              </InfoBox>
            )}
            <fieldset className="ad-stagefields" disabled={!!locked && step !== 8}>
              <legend className="sr-only">{steps[step - 1]}</legend>
              {step === 1 ? (
                <div className="ad-stack">
                  <div className="ad-import-intro">
                    <span className="ad-ki rose">
                      <ScanLine size={23} />
                    </span>
                    <div>
                      <strong>Begin with the original listing</strong>
                      <p>
                        Extraction reads permitted product information only. If access is restricted, use the
                        manual fact sheet instead.
                      </p>
                    </div>
                  </div>
                  <Field
                    label="Paste your Meesho product URL"
                    type="url"
                    value={url}
                    onChange={setUrl}
                    placeholder="https://www.meesho.com/…/p/…"
                    hint="Example: https://www.meesho.com/taj-kurti-for-women/p/6hnqz1"
                  />
                  <Check
                    label="I am authorised to use the source information for this listing."
                    value={authority}
                    onChange={authorise}
                  />
                  {job ? (
                    <Link href="/admin/importer" className="ad-textlink">
                      Start a separate import
                    </Link>
                  ) : (
                    <div className="ad-row">
                      <Button busy={cmd.busy} onClick={() => start('extract')}>
                        <FileSearch size={15} />
                        Extract Product Details
                      </Button>
                      <Button secondary disabled={cmd.busy} onClick={() => start('manual')}>
                        Start manual job
                      </Button>
                    </div>
                  )}
                  <div className="ad-import-fine">
                    <ShieldCheck size={16} />
                    <span>No restricted pages, access workarounds or automatic orders.</span>
                  </div>
                </div>
              ) : step === 2 ? (
                <div className="ad-stack">
                  <InfoBox>
                    Check each value against the original source. Missing information stays blank. Editing a
                    source value makes it manual and unverified.
                  </InfoBox>
                  <div className="ad-formgrid">
                    {facts.map((f) => (
                      <div className="ad-fact" key={f.field}>
                        <Field
                          label={factFields.find(([k]) => k === f.field)?.[1] ?? human(f.field)}
                          type={['description', 'measurements'].includes(f.field) ? 'textarea' : 'text'}
                          value={f.value}
                          onChange={(value) =>
                            changeFact(f.field, { value, origin: 'manual', verified: false })
                          }
                        />
                        <div className="ad-split">
                          <Tag value={!f.value.trim() ? 'missing' : f.verified ? 'verified' : 'unverified'} />
                          {f.value.trim() && (
                            <Check
                              label="Verified"
                              value={f.verified}
                              onChange={(verified) => changeFact(f.field, { verified })}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="ad-row">
                    <Button
                      busy={cmd.busy}
                      onClick={() => {
                        if (!verifiedFacts(facts).length) {
                          error('Verify at least one authorised source fact.');
                          return;
                        }
                        if (job && requiredJob())
                          void run(
                            { op: 'import.facts', ref: asRef(job), facts },
                            'Verified source facts saved.',
                            () => {
                              factsDirty.current = false;
                              void refresh(job.id);
                            },
                          );
                        else requiredJob();
                      }}
                    >
                      Save source facts
                    </Button>
                  </div>
                </div>
              ) : step === 3 ? (
                <div className="ad-stack">
                  <details className="ad-disclose" open>
                    <summary>Verified evidence ({savedFacts.length})</summary>
                    {savedFacts.length ? (
                      <dl className="ad-dl">
                        {savedFacts.map((f) => (
                          <div key={f.field}>
                            <dt>{human(f.field)}</dt>
                            <dd>{f.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p>
                        No verified facts have been saved to this job. Suggestions cannot invent missing
                        details.
                      </p>
                    )}
                  </details>
                  <div className="ad-row">
                    <Button
                      secondary
                      busy={cmd.busy}
                      onClick={() => {
                        if (!requiredJob() || !job) return;
                        if (!savedFacts.length) {
                          error('Save verified facts before generating copy.');
                          return;
                        }
                        void run({ op: 'import.content', ref: asRef(job) }, 'Listing generation queued.');
                      }}
                    >
                      Generate from verified facts
                    </Button>
                    {job?.suggestion && (
                      <details className="ad-disclose">
                        <summary>Read proposed copy</summary>
                        <p>
                          <strong>{job.suggestion.title}</strong>
                        </p>
                        <p>{job.suggestion.shortDescription}</p>
                        <p>{job.suggestion.description}</p>
                        <dl className="ad-dl">
                          {Object.entries(job.suggestion.attrs)
                            .filter(([, v]) => v)
                            .map(([k, v]) => (
                              <div key={k}>
                                <dt>{human(k)}</dt>
                                <dd>{v}</dd>
                              </div>
                            ))}
                        </dl>
                      </details>
                    )}
                    {job?.suggestion && (
                      <Button
                        secondary
                        onClick={() =>
                          ask({
                            title: 'Use the generated suggestion?',
                            label: 'Use suggestion',
                            body: 'Replace local copy and specifications with the suggestion. Check all fields before approving them.',
                            action: () => {
                              const s = job.suggestion;
                              if (s)
                                setD({
                                  ...d,
                                  title: s.title,
                                  slug: s.slug,
                                  shortDescription: s.shortDescription,
                                  description: s.description,
                                  category: s.category,
                                  tags: s.tags,
                                  attrs: s.attrs,
                                  seoTitle: s.seoTitle,
                                  seoDescription: s.seoDescription,
                                  factsVerified: false,
                                });
                              ask(null);
                            },
                          })
                        }
                      >
                        Review and use suggestion
                      </Button>
                    )}
                  </div>
                  <ListingFields d={d} set={setD} includeSpecs />
                  <details className="ad-disclose">
                    <summary>Sizes, variant SKUs & stock</summary>
                    <Variants d={d} set={setD} />
                  </details>
                  <div>
                    <Button
                      busy={cmd.busy}
                      onClick={() => {
                        if (requiredJob() && job) {
                          const issues = draftIssues(d, false);
                          if (issues.length) error(issues.join(' '));
                          else
                            void run(
                              { op: 'import.save-listing', ref: asRef(job), draft: d },
                              'Listing edits saved.',
                            );
                        }
                      }}
                    >
                      Save listing edits
                    </Button>
                  </div>
                </div>
              ) : step === 4 ? (
                <div className="ad-stack">
                  <InfoBox>
                    Use owned or licensed garment references. Each successful initial job produces exactly
                    five square views. Check garment fidelity before approving each one.
                  </InfoBox>
                  <MediaEditor
                    purpose="reference"
                    max={4}
                    photos={refs}
                    change={(v) => {
                      refsDirty.current = true;
                      setRefs(v);
                    }}
                    rights={rights}
                    onRights={right}
                  />
                  <Button
                    secondary
                    disabled={cmd.busy || !!job?.images.length || !rights}
                    onClick={() => {
                      if (requiredJob() && job)
                        void run(
                          {
                            op: 'import.references',
                            ref: asRef(job),
                            referenceIds: refs.map((r) => r.id),
                            rightsConfirmed: true,
                          },
                          'Licensed references saved.',
                          () => {
                            refsDirty.current = false;
                            void refresh(job.id);
                          },
                        );
                    }}
                  >
                    Save references without generating
                  </Button>
                  <div>
                    <Button
                      busy={cmd.busy}
                      disabled={
                        !!job?.images.length ||
                        job?.stages.images === 'queued' ||
                        job?.stages.images === 'running'
                      }
                      onClick={() => {
                        if (!rights || !refs.length) {
                          error('Add an uploaded, rights-cleared garment reference before generation.');
                          return;
                        }
                        if (requiredJob() && job)
                          void run(
                            {
                              op: 'import.images',
                              ref: asRef(job),
                              referenceIds: refs.map((r) => r.id),
                              rightsConfirmed: true,
                            },
                            'Five square image tasks queued.',
                          );
                      }}
                    >
                      Generate five square images
                    </Button>
                  </div>
                  <div className="ad-slotgrid">
                    {slots.map((name, i) => {
                      const s = job?.images.find((v) => v.slot === i),
                        p = s?.photo;
                      return (
                        <article key={name} className="ad-slot">
                          <div className="ad-slotimg">
                            {p ? (
                              <button type="button" aria-label={`Preview ${name}`} onClick={() => see(p)}>
                                <PrivateImage
                                  alt={p.alt || name}
                                  src={p.src}
                                  width={p.width}
                                  height={p.height}
                                />
                              </button>
                            ) : (
                              <div>
                                <ImageIcon size={21} />
                                <span>NO OUTPUT</span>
                              </div>
                            )}
                          </div>
                          <small>FRAME 0{i + 1}</small>
                          <h3>{name}</h3>
                          <Tag value={s?.approved ? 'approved' : (s?.status ?? 'not-started')} />
                          {s?.error && <p>{s.error}</p>}
                          {s && !locked && (
                            <div className="ad-row">
                              {p && s.status === 'ready' && !s.approved && (
                                <button
                                  type="button"
                                  className="ad-textlink"
                                  onClick={() => actImage(i, 'approve')}
                                >
                                  Approve
                                </button>
                              )}
                              {s.status !== 'queued' && s.status !== 'running' && (
                                <button
                                  type="button"
                                  className="ad-textlink"
                                  onClick={() => actImage(i, 'regenerate')}
                                >
                                  Regenerate
                                </button>
                              )}
                              {p && (
                                <button
                                  type="button"
                                  className="ad-textlink"
                                  onClick={() => actImage(i, 'remove')}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : step === 5 ? (
                <div className="ad-stack">
                  <InfoBox>
                    Only permission-cleared source reviews may be included, up to ten per job. These are not
                    verified PARADELLE purchases.
                  </InfoBox>
                  {job?.reviews.length ? (
                    job.reviews.map((r) => (
                      <div key={r.id} className="ad-block">
                        <div className="ad-split">
                          <strong>{r.source}</strong>
                          <Tag value={r.permission} />
                        </div>
                        {r.permission === 'granted' ? (
                          <>
                            <p>
                              {r.rating}/5 · {r.body}
                            </p>
                            <Button
                              secondary
                              disabled={!!locked}
                              busy={cmd.busy}
                              onClick={() =>
                                run(
                                  { op: 'import.review', ref: asRef(job), id: r.id, approved: !r.approved },
                                  'Review decision recorded.',
                                )
                              }
                            >
                              {r.approved ? 'Withdraw approval' : 'Approve inclusion'}
                            </Button>
                          </>
                        ) : (
                          <p>Not eligible for publication.</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <Empty
                      title="No authorised source reviews"
                      body="Leave this section empty when permission or a genuine source is unavailable."
                    />
                  )}
                  <Link className="ad-textlink" href="/admin/reviews?status=paradelle">
                    Manage genuine customer reviews
                    <ArrowRight size={14} />
                  </Link>
                </div>
              ) : step === 6 ? (
                <div className="ad-stack">
                  <Pricing
                    value={d.costs}
                    set={(costs) => setD({ ...d, costs })}
                    price={d.pricePaise}
                    setPrice={(pricePaise) => setD({ ...d, pricePaise })}
                  />
                  <div>
                    <Button
                      busy={cmd.busy}
                      onClick={() => {
                        if (requiredJob() && job)
                          void run(
                            { op: 'import.save-listing', ref: asRef(job), draft: d },
                            'Listing and pricing saved.',
                          );
                      }}
                    >
                      Save listing & pricing
                    </Button>
                  </div>
                </div>
              ) : step === 7 ? (
                <div className="ad-stack">
                  <ListingPreview d={preview} reviews={job?.reviews ?? []} />
                  <dl className="ad-dl">
                    <div>
                      <dt>Approved images</dt>
                      <dd>{preview.images.length} of five required</dd>
                    </div>
                    <div>
                      <dt>Approved source reviews</dt>
                      <dd>
                        {job?.reviews.filter((r) => r.approved && r.permission === 'granted').length ??
                          'No job selected'}
                      </dd>
                    </div>
                  </dl>
                  <div className="ad-row">
                    <Button busy={cmd.busy} onClick={publish}>
                      <ShieldCheck size={15} />
                      Approve & publish
                    </Button>
                    <Button
                      secondary
                      disabled={cmd.busy}
                      onClick={() => {
                        const issues = draftIssues(preview, false);
                        if (issues.length) {
                          error(issues.join(' '));
                          return;
                        }
                        if (requiredJob() && job)
                          void run(
                            { op: 'import.finish', ref: asRef(job), draft: preview, intent: 'draft' },
                            'Product saved as draft.',
                            (r) => router.push(`/admin/products/${r.productId ?? r.id}/edit`),
                          );
                      }}
                    >
                      Save as draft
                    </Button>
                    <button
                      type="button"
                      className="ad-textlink ad-dangertext"
                      onClick={() =>
                        ask({
                          title: job ? 'Cancel this import job?' : 'Discard local import edits?',
                          label: job ? 'Cancel job' : 'Discard edits',
                          body: 'No product will be published. Unsaved edits will be lost.',
                          danger: true,
                          action: () => {
                            if (job) {
                              void run({ op: 'import.cancel', ref: asRef(job) }, 'Import cancelled.', () =>
                                router.push('/admin/importer?step=8'),
                              );
                            } else {
                              setD(blankDraft());
                              setFacts(mergeFacts([], ''));
                              setUrl('');
                              setRefs([]);
                              right(false);
                              authorise(false);
                              ask(null);
                              nav(1);
                            }
                          },
                        })
                      }
                    >
                      Cancel import
                    </button>
                  </div>
                </div>
              ) : (
                <Tracker
                  job={job}
                  jobs={jobs}
                  query={query}
                  busy={refreshing}
                  refresh={() => job && void refresh(job.id)}
                  retry={(s) => {
                    if (job && requiredJob())
                      void run(
                        { op: 'import.retry', ref: asRef(job), stage: s },
                        'Failed stage queued for retry.',
                      );
                  }}
                />
              )}
            </fieldset>
            {(err || cmd.error) && (
              <div className="ad-result">
                <InfoBox error>{err || cmd.error}</InfoBox>
              </div>
            )}
          </section>
          <div className="ad-stepfoot">
            <span>WORKFLOW / {String(step).padStart(2, '0')}</span>
            <div className="ad-row">
              {step > 1 && (
                <button type="button" className="ad-textlink" onClick={() => nav(step - 1)}>
                  <ArrowLeft size={14} />
                  Previous
                </button>
              )}
              {step < 8 && (
                <Button secondary onClick={() => nav(step + 1)}>
                  Next: {steps[step]}
                  <ArrowRight size={14} />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
      {confirm && (
        <Confirm
          {...confirm}
          confirm={confirm.label}
          busy={cmd.busy}
          error={cmd.error || err}
          onConfirm={() => {
            if (confirm.image && !alt.trim()) {
              error('Describe the garment image before approving it.');
              return;
            }
            confirm.action(alt);
          }}
          close={() => {
            ask(null);
            error('');
          }}
        >
          {confirm.image && (
            <>
              <div className="ad-reference-check">
                {refs[0] && (
                  <figure>
                    <PrivateImage src={refs[0].src} alt={refs[0].alt || 'Garment reference'} />
                    <figcaption>Source reference</figcaption>
                  </figure>
                )}
                <figure>
                  <PrivateImage src={confirm.image.src} alt={confirm.image.alt || 'Generated output'} />
                  <figcaption>Proposed output</figcaption>
                </figure>
              </div>
              <Field label="Image description" value={alt} onChange={setAlt} />
            </>
          )}
        </Confirm>
      )}{' '}
      {zoom && (
        <Modal title="Generated image preview" mode="gallery" close={() => see(null)}>
          <PrivateImage className="ad-fullphoto" alt={zoom.alt} src={zoom.src} />
        </Modal>
      )}
    </>
  );
}
