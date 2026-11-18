import { z } from 'zod';
import { slots, fact, feedReview, slotSchema } from '../admin/models';
import { first, need, tx, json, audit, secret, Fault, boundedBytes, type Tx } from './base';
import { grants, supabase } from './auth';
import { storeImage } from './media';
import { grounded, missingFacts } from './imports';
import { razor, refundUpdate } from './checkout';
const directions = [
  'Straight-on full-length catalogue photograph, neutral ivory studio, all garment edges visible.',
  'Natural lifestyle photograph in a quiet Indian courtyard, full outfit visible.',
  'Alternative three-quarter standing pose, clear sleeve and side silhouette.',
  'Close-up textile detail: reproduce only a detail actually visible in the references.',
  'Understated editorial presentation, full garment in soft indirect light.',
];
function queueURL(url: unknown, id: string, suffix: string) {
  const u = new URL(z.string().parse(url));
  need(
    u.protocol === 'https:' &&
      u.host === 'queue.fal.run' &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname.endsWith(`/requests/${id}${suffix}`),
    502,
    'Invalid queue response.',
  );
  return u.href;
}
async function fal(url: string, input?: unknown) {
  const r = await fetch(url, {
    method: input ? 'POST' : 'GET',
    headers: {
      authorization: `Key ${secret('FAL_KEY')}`,
      'content-type': 'application/json',
      'X-Fal-Object-Lifecycle-Preference': json({ expiration_duration_seconds: 86400 }),
      'X-Fal-Store-IO': '0',
    },
    body: input ? json(input) : undefined,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(6500),
  });
  need(r.ok, 502, 'Image or copy provider unavailable.');
  return JSON.parse((await boundedBytes(r, 512000)).toString('utf8'));
}
export async function runOne() {
  const w = await tx(async (s) => {
    const [w] =
      await s`select * from work_queue where (stage in ('queued','waiting') and run_after<=now() or stage='leased' and lease_until<now()) order by case when kind like 'refund%' then 0 else 1 end,created_at for update skip locked limit 1`;
    if (!w) return null;
    const lease = crypto.randomUUID();
    await s`update work_queue set stage='leased',lease=${lease},lease_until=now()+interval '90 seconds',attempts=attempts+1 where id=${w.id}`;
    return { ...w, lease, id: String(w.id) } as typeof w & { lease: string; id: string };
  });
  if (!w) return false;
  const owned = async (s: Tx) => {
    const [r] =
      await s`select id from work_queue where id=${w.id} and lease=${w.lease} and stage='leased' for update`;
    need(r, 409, 'Work claim expired.');
  };
  const done = (s: Tx) => s`update work_queue set stage='done',lease=null,lease_until=null where id=${w.id}`;
  try {
    if (w.refund_id) {
      const f = await tx(async (s) => first(await s`select * from refunds where id=${w.refund_id}`));
      if (!['processed', 'failed'].includes(f.status)) {
        const response = f.provider_id
          ? await razor(`refunds/${f.provider_id}`)
          : await razor(
              `payments/${f.payment_id}/refund`,
              { amount: f.amount, speed: 'normal', receipt: f.id },
              { 'X-Refund-Idempotency': f.id },
            );
        await tx(async (s) => {
          await owned(s);
          await refundUpdate(s, response, f.id);
          await done(s);
        });
      } else
        await tx(async (s) => {
          await owned(s);
          await done(s);
        });
      return true;
    }
    const { j, v } = await tx(async (s) => {
      const j = first(
        await s`select * from product_import_jobs where id=${w.job_id} and status not in ('published','cancelled')`,
      );
      return { j, v: await grants(s, j.created_by, ['imports']) };
    });
    if (w.kind === 'extract') {
      await tx(async (s) => {
        await owned(s);
        const [feed] =
          await s`select * from licensed_sources where source_url=${j.source_url} and valid_until>now()`;
        const facts = z
          .array(fact)
          .max(50)
          .parse(feed?.facts ?? []);
        const reviews = z
          .array(feedReview)
          .max(10)
          .parse(feed?.reviews ?? [])
          .filter((r) => r.permission === 'granted')
          .map((r) => ({ ...r, approved: false }));
        await s`update product_import_jobs set extracted_data=${json(facts)}::text::jsonb,reviews=${json(reviews)}::text::jsonb,reference_ids=${s.array(feed?.reference_ids ?? [])}::uuid[],extraction_status=${feed ? 'ready' : 'restricted'},review_import_status=${feed ? 'ready' : 'restricted'},error_message=${feed ? 'Review source facts and permissions.' : 'No licensed feed for this URL. Enter verified facts and upload permitted reference images.'},revision=revision+1,updated_at=now() where id=${j.id}`;
        await done(s);
      });
      return true;
    }
    if (!w.provider_id) {
      need(!w.submitted_at, 409, 'Prior submission is unconfirmed. Inspect fal history before regeneration.');
      let payload: unknown;
      if (w.kind === 'image') {
        const refs = await tx(
          (s) =>
            s`select bucket,storage_path from assets where id=any(${s.array(w.reference_ids)}::uuid[]) and rights_confirmed and purpose='reference'`,
        );
        need(refs.length && refs.length === w.reference_ids.length, 422, 'Reference images unavailable.');
        const urls = await Promise.all(
          refs.map(async (a) => {
            const { data, error } = await supabase(true)
              .storage.from(a.bucket)
              .createSignedUrl(a.storage_path, 1800);
            need(!error && data, 502, 'Could not authorise reference delivery.');
            return data.signedUrl;
          }),
        );
        payload = {
          image_urls: urls,
          prompt: `${directions[w.slot]} Show the exact kurti from the reference photos. Preserve colour, print, embroidery, pattern placement, neckline, sleeves, length, drape and cut. Do not redesign or add accessories that cover it. No text, logo or watermark. Square composition.`,
          image_size: 'square_hd',
          num_images: 1,
          output_format: 'jpeg',
          enable_safety_checker: true,
        };
      } else {
        const keys = z
          .array(fact)
          .parse(j.extracted_data)
          .filter((f) => f.verified)
          .map((f) => f.field)
          .filter((k) =>
            [
              'description',
              'colour',
              'pattern',
              'fabric',
              'occasion',
              'sleeve',
              'neckline',
              'length',
              'care',
              'measurements',
              'specifications',
            ].includes(k),
          );
        payload = {
          model: 'google/gemini-2.5-flash',
          prompt: `Arrange these verified field names into a natural fashion listing narrative. Return only a JSON array of those field names. Do not add fields. Fields: ${json(keys)}`,
          max_tokens: 200,
        };
      }
      await tx(async (s) => {
        await owned(s);
        await s`update work_queue set submitted_at=now(),input_manifest=${json({ model: w.model, slot: w.slot, objective: w.kind === 'image' ? directions[w.slot] : 'Order verified product clauses', references: w.reference_ids, verifiedFields: j.extracted_data.filter((x: { verified: boolean }) => x.verified).map((x: { field: string }) => x.field) })}::text::jsonb where id=${w.id}`;
      });
      const r = await fal(`https://queue.fal.run/${w.model}`, payload);
      const rid = z
        .string()
        .regex(/^[\w-]{1,128}$/)
        .parse(r.request_id);
      const status = queueURL(r.status_url, rid, '/status'),
        response = queueURL(r.response_url, rid, '');
      await tx(async (s) => {
        await owned(s);
        await s`update work_queue set stage='waiting',provider_id=${rid},status_url=${status},response_url=${response},lease=null,run_after=now()+interval '4 seconds' where id=${w.id}`;
        await s`update product_import_jobs set ${s(w.kind === 'image' ? 'image_generation_status' : 'content_status')}='running',revision=revision+1,updated_at=now() where id=${j.id}`;
      });
      return true;
    }
    const state = await fal(queueURL(w.status_url, w.provider_id, '/status'));
    need(Date.now() - Number(w.submitted_at) < 3600000, 504, 'Generation exceeded its review window.');
    if (state.status !== 'COMPLETED') {
      need(['IN_PROGRESS', 'IN_QUEUE'].includes(state.status), 502, 'Provider task failed.');
      await tx(async (s) => {
        await owned(s);
        await s`update work_queue set stage='waiting',poll_count=poll_count+1,lease=null,run_after=now()+interval '8 seconds' where id=${w.id}`;
      });
      return true;
    }
    const r = await fal(queueURL(w.response_url, w.provider_id, ''));
    if (w.kind === 'content') {
      const order = z
        .array(z.string().max(30))
        .max(20)
        .parse(
          JSON.parse(
            String(r.output)
              .trim()
              .replace(/^```(?:json)?\s*|\s*```$/g, ''),
          ),
        );
      const d = grounded(j.extracted_data, order);
      await tx(async (s) => {
        await owned(s);
        await s`update product_import_jobs set generated_content=${json(d)}::text::jsonb,content_status='ready',error_message=${missingFacts(j.extracted_data).length ? `Missing: ${missingFacts(j.extracted_data).join(', ')}.` : ''},revision=revision+1,updated_at=now() where id=${j.id}`;
        await done(s);
      });
    } else {
      const u = new URL(z.url().parse(r.images?.[0]?.url));
      need(
        u.protocol === 'https:' &&
          (u.hostname === 'fal.media' || u.hostname.endsWith('.fal.media')) &&
          !u.username &&
          !u.password &&
          !u.port,
        502,
        'Unsupported provider media origin.',
      );
      const img = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(8000) });
      need(img.ok, 502, 'Generated image not available.');
      const p = await storeImage(
        await boundedBytes(img, 12 * 1024 * 1024),
        'generated',
        v,
        slots[w.slot],
        true,
      );
      await tx(async (s) => {
        await owned(s);
        const current = first(await s`select images from product_import_jobs where id=${j.id} for update`);
        const images = z.array(slotSchema).parse(current.images);
        images[w.slot] = { slot: w.slot, status: 'ready', photo: p, approved: false, error: '' };
        await s`update product_import_jobs set images=${json(images)}::text::jsonb,image_generation_status=${images.every((x) => x.status === 'ready') ? 'ready' : images.some((x) => x.status === 'failed') ? 'failed' : 'running'},revision=revision+1,updated_at=now() where id=${j.id}`;
        await s`update work_queue set result_asset=${p.id},output_manifest=${json({ assetId: p.id, width: p.width, height: p.height })}::text::jsonb where id=${w.id}`;
        await done(s);
      });
    }
  } catch (err) {
    await tx(async (s) => {
      const [a] = await s`select id from work_queue where id=${w.id} and lease=${w.lease} for update`;
      if (!a) return;
      const message =
        err instanceof Fault ? err.message : 'Task was not confirmed. Check provider status before retrying.';
      const retry = (!!w.refund_id && w.attempts < 5) || (!!w.provider_id && w.attempts < 5);
      await s`update work_queue set stage=${retry ? 'waiting' : 'failed'},error=${message},lease=null,run_after=now()+interval '1 minute' where id=${w.id}`;
      if (!retry && w.job_id) {
        const j = first(await s`select images from product_import_jobs where id=${w.job_id} for update`);
        const imgs = z.array(slotSchema).parse(j.images);
        if (w.kind === 'image' && imgs[w.slot])
          imgs[w.slot] = { ...imgs[w.slot], status: 'failed', error: message, approved: false };
        await s`update product_import_jobs set ${s(w.kind === 'image' ? 'image_generation_status' : w.kind === 'content' ? 'content_status' : 'extraction_status')}='failed',images=${json(imgs)}::text::jsonb,error_message=${message},revision=revision+1,updated_at=now() where id=${w.job_id}`;
      }
      await audit(
        s,
        null,
        'Worker attention required',
        w.refund_id ? 'refund' : 'import',
        w.refund_id ?? w.job_id,
        message,
      );
    });
  }
  return true;
}
export async function maintain() {
  return tx(async (s) => {
    await s`insert into work_queue(kind,refund_id) select 'refund-check',r.id from refunds r where r.status='pending' and r.provider_id is not null and not exists(select 1 from work_queue w where w.refund_id=r.id and (w.stage in ('queued','leased','waiting') or w.created_at>now()-interval '10 minutes')) order by r.updated_at limit 10 on conflict do nothing`;
    await s`delete from checkout_intents where state='expired' and created_at<now()-interval '90 days' and not exists(select 1 from orders where intent_id=checkout_intents.id)`;
    await s`delete from rate_windows where expires_at<now()`;
    await s`delete from staff_sessions where expires_at<=now()`;
    await s`delete from reservations where expires_at<now()`;
    await s`update checkout_intents set state='expired',address=null,email=null where state='quoted' and expires_at<now()`;
    await s`update checkout_intents set address=null,email=null,state='expired' where state='opened' and expires_at<now()-interval '30 days'`;
  });
}
