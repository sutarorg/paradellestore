import type { Command } from '../admin/commands';
import { type Viewer, slots, type Fact, feedReview, blankDraft, type Draft } from '../admin/models';
import { meeshoUrl, importIssues, verifiedFacts } from '../admin/rules';
import { first, need, secret, uid, audit, json, type Tx } from './base';
import { getDraft, locked, saveProduct } from './catalogue';
import { job } from './studio';
export const IMAGE_MODEL = 'fal-ai/flux-2-pro/edit',
  TEXT_MODEL = 'openrouter/router';
type ImportCommand = Extract<Command, { op: `import.${string}` }>;
export const missingFacts = (facts: Fact[]) =>
  ['title', 'price', 'fabric', 'colour', 'sizes', 'description'].filter(
    (k) => !verifiedFacts(facts).some((f) => f.field === k),
  );
export async function enqueue(
  s: Tx,
  id: string,
  kind: 'content' | 'image' | 'extract',
  slot: number | null = null,
  refs: string[] = [],
) {
  if (kind !== 'extract') {
    secret('FAL_KEY');
    const cap = Number(secret('FAL_DAILY_SUBMISSION_LIMIT'));
    need(
      Number.isSafeInteger(cap) && cap > 0 && cap <= 1000,
      503,
      'Configure a bounded fal submission allowance.',
    );
    await s`select pg_advisory_xact_lock(734512)`;
    const [r] =
      await s`select count(*)::int n from work_queue where kind in ('content','image') and created_at>now()-interval '24 hours'`;
    need(r.n < cap, 429, 'The daily generation allowance is exhausted.');
  }
  await s`insert into work_queue(kind,job_id,slot,model,reference_ids) values(${kind},${id},${slot},${kind === 'image' ? IMAGE_MODEL : kind === 'content' ? TEXT_MODEL : null},${s.array(refs)}::uuid[])`;
}
const blankSlot = (slot: number) => ({
  slot,
  status: 'queued' as const,
  photo: null,
  approved: false,
  error: '',
});
export async function importCommand(s: Tx, v: Viewer, c: ImportCommand) {
  if (c.op === 'import.start') {
    const url = meeshoUrl(c.url);
    need(url, 422, 'A canonical Meesho product link is required.');
    const r = first(
      await s`insert into product_import_jobs(source_url,source_product_id,extraction_status,created_by) values(${url},${url.split('/p/')[1].replace(/\/$/, '')},${c.method === 'extract' ? 'queued' : 'restricted'},${v.id}) returning id,revision`,
    );
    if (c.method === 'extract') await enqueue(s, r.id, 'extract');
    return r;
  }
  const r = await locked(s, 'product_import_jobs', c.ref);
  need(!['published', 'cancelled'].includes(r.status), 409, 'Import job closed.');
  const id = r.id;
  const j = await job(s, id);
  switch (c.op) {
    case 'import.facts': {
      need(verifiedFacts(c.facts).length, 422, 'Verify source facts.');
      need(
        !['queued', 'running'].includes(j.stages.content) &&
          !['queued', 'running'].includes(j.stages.extraction),
        409,
        'Wait for the current task.',
      );
      const missing = missingFacts(c.facts);
      await s`update product_import_jobs set extracted_data=${json(c.facts.map((f) => ({ ...f, origin: 'manual' })))}::text::jsonb,generated_content=null,content_status='not-started',extraction_status='ready',error_message=${missing.length ? `Not verified: ${missing.join(', ')}.` : ''} where id=${id}`;
      break;
    }
    case 'import.content':
      need(
        verifiedFacts(j.facts).some((f) => f.field === 'title'),
        422,
        'Verify the source title first.',
      );
      need(!['queued', 'running'].includes(j.stages.content), 409, 'Generation already pending.');
      await enqueue(s, id, 'content');
      await s`update product_import_jobs set content_status='queued',error_message='' where id=${id}`;
      break;
    case 'import.save-listing':
      await s`update product_import_jobs set draft=${json(c.draft)}::text::jsonb where id=${id}`;
      break;
    case 'import.references': {
      need(!j.images.length, 409, 'References are locked once generation starts.');
      const ids = c.referenceIds.map(uid);
      const assets =
        await s`select id from assets where id=any(${s.array(ids)}::uuid[]) and purpose='reference' and rights_confirmed`;
      need(assets.length === ids.length, 422, 'Upload permitted references first.');
      await s`update product_import_jobs set rights_confirmed=true,reference_ids=${s.array(ids)}::uuid[] where id=${id}`;
      break;
    }
    case 'import.images': {
      need(
        !j.images.length && new Set(c.referenceIds).size === c.referenceIds.length,
        409,
        'Initial set already exists or repeats a reference.',
      );
      need(c.referenceIds.length <= 4, 422, 'Use one to four licensed reference views.');
      const refs = c.referenceIds.map(uid);
      const assets =
        await s`select id from assets where id=any(${s.array(refs)}::uuid[]) and purpose='reference' and rights_confirmed`;
      need(assets.length === refs.length, 422, 'Upload licensed reference photos.');
      await s`update product_import_jobs set rights_confirmed=true,reference_ids=${s.array(refs)}::uuid[],images=${json(slots.map((_, i) => blankSlot(i)))}::text::jsonb,image_generation_status='queued',error_message='' where id=${id}`;
      for (let i = 0; i < 5; i++) await enqueue(s, id, 'image', i, refs);
      break;
    }
    case 'import.image': {
      const im = j.images.find((i) => i.slot === c.slot);
      need(
        im && j.rightsConfirmed && !['running', 'queued'].includes(im.status),
        409,
        'Frame not ready to edit.',
      );
      if (c.action === 'approve') {
        need(
          im.photo && c.alt && im.status === 'ready' && im.photo.width === im.photo.height,
          422,
          'Review the square garment image and enter alt text.',
        );
        im.approved = true;
        im.photo.alt = c.alt;
      } else {
        Object.assign(im, blankSlot(c.slot));
        if (c.action === 'remove') im.status = 'not-started';
        else await enqueue(s, id, 'image', c.slot, r.reference_ids);
      }
      await s`update product_import_jobs set images=${json(j.images)}::text::jsonb,image_generation_status=${c.action === 'regenerate' ? 'queued' : j.images.every((x) => x.status === 'ready') ? 'ready' : 'not-started'} where id=${id}`;
      break;
    }
    case 'import.review': {
      const rev = j.reviews.find((x) => x.id === c.id);
      need(rev && (!c.approved || rev.permission === 'granted'), 422, 'Review permission required.');
      rev.approved = c.approved;
      await s`update product_import_jobs set reviews=${json(j.reviews)}::text::jsonb where id=${id}`;
      break;
    }
    case 'import.retry': {
      need(r.retry_count < 10 && j.stages[c.stage] === 'failed', 409, 'Retry unavailable.');
      if (c.stage === 'images') {
        for (const im of j.images.filter((i) => i.status === 'failed')) {
          Object.assign(im, blankSlot(im.slot));
          const old =
            await s`update work_queue set stage='waiting',attempts=0,run_after=now(),error=null where id=(select id from work_queue where job_id=${id} and slot=${im.slot} and stage='failed' and provider_id is not null and submitted_at>now()-interval '1 hour' order by created_at desc limit 1) returning id`;
          if (!old.length) await enqueue(s, id, 'image', im.slot, r.reference_ids);
        }
        await s`update product_import_jobs set images=${json(j.images)}::text::jsonb,image_generation_status='queued' where id=${id}`;
      } else {
        await enqueue(s, id, c.stage === 'content' ? 'content' : 'extract');
        await s`update product_import_jobs set ${s(c.stage === 'content' ? 'content_status' : 'extraction_status')}='queued' where id=${id}`;
      }
      await s`update product_import_jobs set retry_count=retry_count+1,error_message='' where id=${id}`;
      break;
    }
    case 'import.cancel':
      await s`update work_queue set stage='cancelled',lease=null where job_id=${id} and stage not in('done','failed')`;
      await s`update product_import_jobs set status='cancelled',extraction_status=case when extraction_status in('running','queued') then 'cancelled' else extraction_status end,content_status=case when content_status in('running','queued') then 'cancelled' else content_status end,image_generation_status=case when image_generation_status in('running','queued') then 'cancelled' else image_generation_status end where id=${id}`;
      break;
    case 'import.finish': {
      const publish = c.intent === 'publish';
      if (publish) {
        const problems = importIssues(c.draft, j);
        need(
          !problems.length && !missingFacts(j.facts).length,
          422,
          'Verify required facts, pricing and five garment-faithful frames before publishing.',
        );
      }
      const d = { ...c.draft, sourceUrl: j.sourceUrl };
      const product = await saveProduct(
        s,
        v,
        d,
        r.product_id ? await getDraft(s, r.product_id) : null,
        publish ? 'published' : 'draft',
        id,
      );
      if (publish)
        for (const rev of j.reviews.filter((x) => x.approved)) {
          feedReview.parse(rev);
          const lic = first(
            await s`select licence_reference from licensed_sources where source_url=${j.sourceUrl} and valid_until>now()`,
          );
          await s`insert into product_reviews(product_id,rating,review_text,verification_status,publication_status,source,licence_reference) values(${product.id},${rev.rating},${rev.body},'licensed','published',${rev.source},${lic.licence_reference})`;
        }
      await s`update product_import_jobs set product_id=${product.id},draft=${json(d)}::text::jsonb,status=${publish ? 'published' : 'approved'} where id=${id}`;
      await audit(
        s,
        v.id,
        'Import listing saved',
        'product',
        product.id,
        publish ? 'Published after review.' : 'Saved as draft.',
      );
      break;
    }
  }
  return first(
    await s`update product_import_jobs set updated_at=now(),revision=revision+1 where id=${id} returning id,revision,product_id`,
  );
}
// The language model can select and order approved clauses only. It cannot author a new garment claim.
export function grounded(facts: Fact[], order: string[]): Draft {
  const f = new Map(verifiedFacts(facts).map((x) => [x.field, x.value]));
  const title = f.get('title')?.slice(0, 200) || '';
  need(title, 422, 'A verified title is required.');
  const d = blankDraft();
  const allowed = [
    'description',
    'fabric',
    'pattern',
    'colour',
    'sleeve',
    'neckline',
    'length',
    'occasion',
    'care',
    'measurements',
    'specifications',
  ];
  const pieces = [...new Set([...order, ...allowed])]
    .filter((k) => allowed.includes(k) && f.has(k))
    .map((k) => (k === 'description' ? f.get(k) : `${k[0].toUpperCase() + k.slice(1)}: ${f.get(k)}`));
  for (const k of Object.keys(d.attrs) as (keyof Draft['attrs'])[])
    d.attrs[k] = (f.get(k) || '').slice(
      0,
      ['care', 'measurements', 'specifications'].includes(k) ? 2000 : 240,
    );
  const cat = f.get('category')?.toLowerCase();
  d.category =
    cat && ['anarkali', 'rayon', 'cotton', 'straight', 'long', 'other'].includes(cat)
      ? (cat as Draft['category'])
      : '';
  d.title = title;
  d.slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 145)
    .replace(/-$/, '');
  d.description = pieces.join('. ').slice(0, 12000);
  d.shortDescription = pieces.slice(0, 2).join('. ').slice(0, 400);
  d.seoTitle = title.slice(0, 65);
  d.seoDescription = d.shortDescription.slice(0, 155);
  d.tags = [d.category, d.attrs.fabric, d.attrs.colour, d.attrs.pattern]
    .filter(Boolean)
    .join(', ')
    .slice(0, 240);
  const p = f.get('price');
  if (p && /^\d{1,7}(\.\d{1,2})?$/.test(p)) d.costs.source = Math.round(Number(p) * 100);
  return d;
}
