import { z } from 'zod';
export const key = z.string().regex(/^[\w-]{1,128}$/);
const text = z.string().trim().max(12000),
  short = z.string().trim().max(240),
  required = short.min(1);
const amt = z.number().int().nonnegative().safe();
const bps = z.int().min(0).max(9999);
const date = z.iso.datetime({ offset: true });
export const rights = [
  'catalogue',
  'imports',
  'orders',
  'inventory',
  'customers',
  'pii',
  'reviews',
  'analytics',
  'settings',
] as const;
export const viewerSchema = z.object({
  id: key,
  name: required,
  role: z.literal('admin'),
  permissions: z.array(z.enum(rights)),
});
export type Viewer = z.infer<typeof viewerSchema>;
export type Scope = (typeof rights)[number];
export type Access =
  | { mode: 'disconnected' }
  | { mode: 'verified'; user: Viewer }
  | { mode: 'denied' }
  | { mode: 'unavailable' };
export type Read<T> =
  | { state: 'ready'; value: T }
  | { state: 'offline' | 'error' | 'forbidden' | 'missing'; message: string };
export const costSchema = z.object({
  source: amt.nullable(),
  extras: amt.nullable(),
  packaging: amt.nullable(),
  shipping: amt.nullable(),
  feeFixed: amt.nullable(),
  reserve: amt.nullable(),
  feeRate: bps.nullable(),
  margin: bps.nullable(),
  tax: z.enum(['unspecified', 'none', 'inclusive']),
  gst: z.int().min(0).max(10000).nullable(),
  endings: z.boolean(),
});
export type Costs = z.infer<typeof costSchema>;
export const blankCosts = (): Costs => ({
  source: null,
  extras: null,
  packaging: null,
  shipping: null,
  feeFixed: null,
  reserve: null,
  feeRate: null,
  margin: null,
  tax: 'unspecified',
  gst: null,
  endings: false,
});
export const mediaSrc = z
  .string()
  .max(2048)
  .refine(
    (s) =>
      /^\/(?!\/)[\w./%-]+$/.test(s) ||
      (/^https:\/\//.test(s) && URL.canParse(s) && !new URL(s).username && !new URL(s).password),
  );
export const photo = z.object({
  id: key,
  src: mediaSrc,
  alt: short,
  width: z.int().positive(),
  height: z.int().positive(),
});
export type Photo = z.infer<typeof photo>;
export const statuses = ['draft', 'published', 'archived'] as const;
export const categoryValues = ['anarkali', 'rayon', 'cotton', 'straight', 'long', 'other'] as const;
export const variant = z.object({
  id: key,
  size: required,
  sku: short,
  stock: z.int().min(0).max(1000000),
  enabled: z.boolean(),
});
export const attrs = [
  'fabric',
  'pattern',
  'sleeve',
  'neckline',
  'length',
  'occasion',
  'colour',
  'care',
  'measurements',
  'specifications',
] as const;
export const attrNames: Record<(typeof attrs)[number], string> = {
  fabric: 'Fabric',
  pattern: 'Pattern',
  sleeve: 'Sleeve length',
  neckline: 'Neck style',
  length: 'Kurti length',
  occasion: 'Occasion',
  colour: 'Colour',
  care: 'Care instructions',
  measurements: 'Measurements',
  specifications: 'Other verified specifications',
};
export const draftSchema = z.object({
  title: short,
  slug: short,
  sku: short,
  shortDescription: text,
  description: text,
  category: z.union([z.enum(categoryValues), z.literal('')]),
  tags: short,
  attrs: z.object({
    fabric: short,
    pattern: short,
    sleeve: short,
    neckline: short,
    length: short,
    occasion: short,
    colour: short,
    care: text,
    measurements: text,
    specifications: text,
  }),
  seoTitle: short,
  seoDescription: text,
  costs: costSchema,
  pricePaise: amt.nullable(),
  variants: z.array(variant).max(40),
  images: z.array(photo).max(20),
  factsVerified: z.boolean(),
  imageRights: z.boolean(),
});
export type Draft = z.infer<typeof draftSchema>;
export const blankDraft = (): Draft => ({
  title: '',
  slug: '',
  sku: '',
  shortDescription: '',
  description: '',
  category: '',
  tags: '',
  attrs: {
    fabric: '',
    pattern: '',
    sleeve: '',
    neckline: '',
    length: '',
    occasion: '',
    colour: '',
    care: '',
    measurements: '',
    specifications: '',
  },
  seoTitle: '',
  seoDescription: '',
  costs: blankCosts(),
  pricePaise: null,
  variants: [],
  images: [],
  factsVerified: false,
  imageRights: false,
});
const base = { id: key, revision: z.int().nonnegative() };
export const refSchema = z.object(base);
export type Ref = z.infer<typeof refSchema>;
export const productRecord = z.object({
  ...base,
  status: z.enum(statuses),
  updatedAt: date,
  draft: draftSchema,
});
export type ProductRecord = z.infer<typeof productRecord>;
export const productRow = z.object({
  ...base,
  title: required,
  slug: short,
  sku: short,
  status: z.enum(statuses),
  category: short,
  pricePaise: amt.nullable(),
  thumbnail: mediaSrc.nullable(),
  sizes: z.array(short),
  stock: amt,
  updatedAt: date,
});
export type ProductRow = z.infer<typeof productRow>;
export const payments = [
  'pending',
  'paid',
  'failed',
  'refund-pending',
  'partially-refunded',
  'refunded',
] as const;
export const fulfilments = [
  'pending-purchase',
  'ordered-on-meesho',
  'shipped',
  'delivered',
  'cancelled',
] as const;
export const activity = z.object({ id: key, label: required, detail: text, at: date, actor: short });
export type Activity = z.infer<typeof activity>;
export const orderLine = z.object({
  id: key,
  name: required,
  image: mediaSrc.nullable(),
  size: short,
  quantity: z.int().positive(),
  unitPaise: amt,
});
export const orderRow = z.object({
  ...base,
  reference: required,
  customer: short,
  mobile: short,
  items: z.array(orderLine),
  date: date,
  totalPaise: amt,
  payment: z.enum(payments),
  fulfilment: z.enum(fulfilments),
});
export type OrderRow = z.infer<typeof orderRow>;
export const manualSchema = z.object({
  status: z.enum(fulfilments),
  sourceUrl: short,
  meeshoRef: short,
  costPaise: amt.nullable(),
  purchaseDate: z.union([z.iso.date(), z.literal('')]),
  carrier: short,
  tracking: short,
  trackingUrl: short,
  notes: text,
});
export type Manual = z.infer<typeof manualSchema>;
export const orderDetail = orderRow.extend({
  address: text,
  subtotalPaise: amt,
  discountPaise: amt,
  paidPaise: amt,
  refundablePaise: amt,
  sourcingPaise: amt.nullable(),
  contributionPaise: z.int().nullable(),
  paymentReference: short,
  paymentAt: date.nullable(),
  manual: manualSchema,
  history: z.array(activity),
});
export type Order = z.infer<typeof orderDetail>;
export const stockRow = z.object({
  ...base,
  productId: key,
  title: required,
  sku: short,
  size: short,
  stock: amt,
  threshold: amt,
  enabled: z.boolean(),
  updatedAt: date,
});
export type Stock = z.infer<typeof stockRow>;
export const adjustment = z
  .object({
    id: key,
    variantId: key,
    productId: key,
    product: required,
    size: required,
    sku: short,
    before: amt,
    delta: z.int(),
    after: amt,
    reason: required,
    at: date,
    actor: required,
  })
  .refine((a) => a.before + a.delta === a.after && a.delta !== 0);
export type Adjustment = z.infer<typeof adjustment>;
export const customerRow = z.object({
  id: key,
  name: required,
  mobile: short,
  orders: amt,
  spendPaise: amt,
  lastOrder: date.nullable(),
});
export type Customer = z.infer<typeof customerRow>;
const reviewerSource = z.enum(['paradelle', 'authorised-feed']);
export const reviewRow = z
  .object({
    ...base,
    productId: key,
    productTitle: short,
    body: text,
    rating: z.int().min(1).max(5).nullable(),
    origin: reviewerSource,
    source: short,
    permission: z.enum(['pending', 'granted', 'denied']),
    verifiedPurchase: z.boolean(),
    status: z.enum(['pending', 'published', 'unpublished', 'rejected']),
    at: date,
  })
  .refine((r) =>
    r.origin === 'paradelle'
      ? Boolean(r.body && r.rating)
      : !r.verifiedPurchase &&
        (r.permission === 'granted'
          ? Boolean(r.body && r.rating)
          : !r.body && r.rating === null && r.status !== 'published'),
  );
export type Review = z.infer<typeof reviewRow>;
export const fact = z.object({
  field: required,
  value: text,
  verified: z.boolean(),
  origin: z.enum(['source', 'manual']),
});
export type Fact = z.infer<typeof fact>;
export const slots = [
  'Main product view',
  'Lifestyle view',
  'Alternative pose',
  'Fabric / detail view',
  'Additional presentation',
] as const;
export const jobState = z.enum([
  'not-started',
  'queued',
  'running',
  'ready',
  'failed',
  'restricted',
  'cancelled',
]);
export type JobState = z.infer<typeof jobState>;
export const slotSchema = z.object({
  slot: z.int().min(0).max(4),
  status: jobState,
  photo: photo.nullable(),
  approved: z.boolean(),
  error: text,
});
export const feedReview = z
  .object({
    id: key,
    body: text,
    rating: z.int().min(1).max(5).nullable(),
    source: required,
    permission: z.enum(['pending', 'granted', 'denied']),
    approved: z.boolean(),
  })
  .refine(
    (r) =>
      r.permission === 'granted' ? Boolean(r.body && r.rating) : !r.body && r.rating === null && !r.approved,
    'Uncleared source text, rating and approval must be omitted',
  );
export type FeedReview = z.infer<typeof feedReview>;
export const stages = z.object({
  extraction: jobState,
  content: jobState,
  images: jobState,
  reviews: jobState,
  approval: z.enum(['pending', 'approved', 'published', 'cancelled']),
});
export const jobRow = z.object({
  ...base,
  sourceUrl: short,
  title: short,
  stages,
  updatedAt: date,
  error: text,
});
export type JobRow = z.infer<typeof jobRow>;
export const jobDetail = jobRow.extend({
  facts: z.array(fact).max(50),
  references: z.array(photo).max(20),
  suggestion: draftSchema.nullable(),
  draft: draftSchema.nullable(),
  images: z
    .array(slotSchema)
    .max(5)
    .refine((a) => new Set(a.map((s) => s.slot)).size === a.length),
  reviews: z.array(feedReview).max(10),
  rightsConfirmed: z.boolean(),
});
export type Job = z.infer<typeof jobDetail>;
export const saleDay = z.object({ day: z.iso.date(), salesPaise: amt });
export type SaleDay = z.infer<typeof saleDay>;
export const summary = z.object({
  revenuePaise: amt,
  paidOrders: amt,
  pendingOrders: amt,
  publishedProducts: amt,
  lowStockProducts: amt,
  importsPending: amt,
});
export type Summary = z.infer<typeof summary>;
export const dashboard = z.object({
  summary,
  sales: z.array(saleDay),
  orders: z.array(orderRow.omit({ mobile: true })).max(10),
  activity: z.array(activity).max(20),
});
export type Dashboard = z.infer<typeof dashboard>;
const rank = z.object({ name: required, value: amt });
export const analytics = z.object({
  grossPaise: amt,
  netPaise: z.int(),
  orders: amt,
  aovPaise: amt.nullable(),
  contributionPaise: z.int().nullable(),
  returnBps: z.int().min(0).max(10000).nullable(),
  refundBps: z.int().min(0).max(10000).nullable(),
  sales: z.array(saleDay),
  products: z.array(rank),
  categories: z.array(rank),
  statuses: z.array(rank),
});
export type Analytics = z.infer<typeof analytics>;
const policyBlock = z.object({ title: required, body: text.min(1) });
export const settingsSections = [
  'identity',
  'contact',
  'pricing',
  'social',
  'policies',
  'seo',
  'profile',
] as const;
export const settings = z.object({
  identity: z.object({ name: required, logo: photo.nullable(), announcement: short }),
  contact: z.object({
    email: z.union([z.email(), z.literal('')]),
    phone: short,
    businessName: short,
    address: text,
    registration: short,
  }),
  pricing: costSchema,
  social: z.object({ instagram: short, facebook: short, pinterest: short }),
  policies: z.record(z.string(), z.array(policyBlock)),
  seo: z.object({ title: short, description: text }),
  profile: z.object({ name: short, email: z.union([z.email(), z.literal('')]) }),
});
export type AdminSettings = z.infer<typeof settings>;
export const blankSettings = (): AdminSettings => ({
  identity: { name: 'PARADELLE', logo: null, announcement: '' },
  contact: { email: '', phone: '', businessName: '', address: '', registration: '' },
  pricing: blankCosts(),
  social: { instagram: '', facebook: '', pinterest: '' },
  policies: {},
  seo: { title: '', description: '' },
  profile: { name: '', email: '' },
});
export const paged = <T extends z.ZodType>(row: T) =>
  z.object({
    rows: z.array(row).max(50),
    total: amt,
    page: z.int().positive(),
    pageSize: z.int().min(1).max(50),
  });
export type PageData<T> = { rows: T[]; total: number; page: number; pageSize: number };
