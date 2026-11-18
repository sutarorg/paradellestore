import { z } from 'zod';
import {
  draftSchema,
  fact,
  manualSchema,
  refSchema,
  key,
  settings,
  settingsSections,
  type Scope,
} from './models';
import { draftIssues, manualIssues, meeshoUrl, verifiedFacts } from './rules';
const ref = { ref: refSchema },
  refs = z
    .array(refSchema)
    .min(1)
    .max(50)
    .refine((v) => new Set(v.map((x) => x.id)).size === v.length),
  slot = z.int().min(0).max(4);
const op = <K extends string, S extends z.ZodRawShape>(k: K, s: S) => z.object({ op: z.literal(k), ...s });
export const command = z.discriminatedUnion('op', [
  op('product.save', {
    ref: refSchema.nullable(),
    draft: draftSchema,
    intent: z.enum(['draft', 'publish', 'update']),
  }),
  op('product.transition', { refs, to: z.enum(['draft', 'published', 'archived']) }),
  op('product.delete', ref),
  op('product.duplicate', ref),
  op('stock.adjust', {
    ...ref,
    delta: z
      .int()
      .min(-1000000)
      .max(1000000)
      .refine((n) => n !== 0),
    reason: z.string().trim().min(3).max(500),
  }),
  op('order.fulfil', { ...ref, manual: manualSchema }),
  op('order.refund', { ...ref, amountPaise: z.int().positive(), reason: z.string().trim().min(3).max(500) }),
  op('order.check-refund', ref),
  op('review.moderate', { ...ref, to: z.enum(['published', 'unpublished', 'rejected']) }),
  op('settings.save', {
    revision: z.int().nonnegative(),
    section: z.enum(settingsSections),
    value: z.unknown(),
  }),
  op('import.start', {
    url: z.string().max(500),
    method: z.enum(['extract', 'manual']),
    authorised: z.literal(true),
  }),
  op('import.facts', { ...ref, facts: z.array(fact).min(1).max(50) }),
  op('import.content', { ...ref }),
  op('import.save-listing', { ...ref, draft: draftSchema }),
  op('import.references', { ...ref, referenceIds: z.array(key).max(4), rightsConfirmed: z.literal(true) }),
  op('import.images', {
    ...ref,
    referenceIds: z.array(key).min(1).max(20),
    rightsConfirmed: z.literal(true),
  }),
  op('import.image', {
    ...ref,
    slot,
    action: z.enum(['regenerate', 'remove', 'approve']),
    alt: z.string().trim().min(1).max(240).optional(),
  }),
  op('import.review', { ...ref, id: key, approved: z.boolean() }),
  op('import.finish', { ...ref, draft: draftSchema, intent: z.enum(['draft', 'publish']) }),
  op('import.cancel', ref),
  op('import.retry', { ...ref, stage: z.enum(['extraction', 'content', 'images', 'reviews']) }),
]);
export type Command = z.infer<typeof command>;
export const scopes: Record<string, Scope> = {
  product: 'catalogue',
  stock: 'inventory',
  order: 'orders',
  review: 'reviews',
  settings: 'settings',
  import: 'imports',
};
export function checkCommand(c: Command) {
  switch (c.op) {
    case 'product.save':
    case 'import.finish':
      return draftIssues(c.draft, c.intent !== 'draft');
    case 'import.save-listing':
      return draftIssues(c.draft, false);
    case 'import.start':
      return meeshoUrl(c.url) ? [] : ['Enter a valid Meesho product link.'];
    case 'import.facts':
      return verifiedFacts(c.facts).length ? [] : ['Verify at least one authorised fact.'];
    case 'order.fulfil':
      return manualIssues(c.manual);
    case 'settings.save': {
      const result = settings.shape[c.section].safeParse(c.value);
      if (!result.success) return ['Check the fields in this settings section.'];
      if (
        c.section === 'social' &&
        Object.values(result.data).some(
          (v) => v && !(typeof v === 'string' && URL.canParse(v) && new URL(v).protocol === 'https:'),
        )
      )
        return ['Use full HTTPS social links.'];
      return [];
    }
    default:
      return [];
  }
}
export const receipt = z.object({
  id: key,
  revision: z.int().nonnegative(),
  eventId: key,
  productId: key.optional(),
  outcome: z.enum(['applied', 'queued']),
});
export type Receipt = z.infer<typeof receipt>;
export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

/** A queue acknowledgement is not a commit. */
export function queued(c: Command) {
  return (
    ['import.content', 'import.images', 'import.retry', 'order.refund', 'order.check-refund'].includes(
      c.op,
    ) ||
    (c.op === 'import.start' && c.method === 'extract') ||
    (c.op === 'import.image' && c.action === 'regenerate')
  );
}
