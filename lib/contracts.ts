import { z } from 'zod';

const text = z.string().trim().min(1);
const amount = z.number().int().nonnegative().safe();
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(150);
const imageSrc = z.string().refine(
  (s) =>
    /^\/(?!\/)[\w./%-]+$/.test(s) ||
    (s.startsWith('https://') &&
      (() => {
        try {
          return new URL(s).hostname === process.env.PRODUCT_IMAGE_HOST;
        } catch {
          return false;
        }
      })()),
  'Unsupported media origin',
);
export const photoSchema = z.object({ src: imageSrc, alt: text });
export const variantSchema = z.object({
  id: text,
  size: text.nullable(),
  colour: text.nullish(),
  pricePaise: amount.positive().nullish(),
  stock: z.number().int().nonnegative(),
});
export const reviewSchema = z.object({
  id: text,
  displayName: text,
  body: text,
  rating: z.number().int().min(1).max(5),
  verified: z.boolean(),
});
export const authorisedReviewSchema = z.object({
  id: text,
  body: text,
  rating: z.int().min(1).max(5),
  source: text,
  permission: z.literal('granted'),
  approved: z.literal(true),
});
export const productSchema = z.object({
  seoTitle: text.nullish(),
  seoDescription: text.nullish(),
  sourceReviews: z.array(authorisedReviewSchema).max(10).default([]),
  id: z.uuid().optional(),
  slug: slugSchema,
  name: text,
  published: z.boolean(),
  publishedAt: z.iso.datetime({ offset: true }),
  pricePaise: amount.positive(),
  mrpPaise: amount.nullish(),
  images: z.array(photoSchema).min(1),
  variants: z.array(variantSchema).min(1),
  description: text,
  categories: z.array(text),
  fabric: text,
  style: text,
  colour: text,
  occasion: z.array(text),
  specifications: z.record(z.string(), text).default({}),
  sizeGuide: z
    .object({
      heading: text,
      columns: z.array(text).min(1),
      rows: z.array(z.array(text).min(1)).min(1),
      note: text.optional(),
    })
    .nullish(),
  deliveryNote: text.nullish(),
  returnNote: text.nullish(),
  taxNote: text.nullish(),
  newArrival: z.boolean().default(false),
  bestseller: z.boolean().default(false),
  reviews: z.array(reviewSchema).default([]),
});
export type Product = z.infer<typeof productSchema>;
export type ProductTile = Pick<
  Product,
  'id' | 'slug' | 'name' | 'images' | 'pricePaise' | 'mrpPaise' | 'newArrival' | 'bestseller'
>;
export type ShopProduct = ProductTile & Pick<Product, 'variants'>;
export const asTile = (p: Product): ShopProduct => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  images: [p.images[0]],
  variants: p.variants,
  pricePaise: p.pricePaise,
  mrpPaise: p.mrpPaise,
  newArrival: p.newArrival,
  bestseller: p.bestseller,
});
export const catalogueSchema = z.object({ products: z.array(productSchema) });
export const settingsSchema = z.object({
  announcement: text.default('Enjoy a seamless prepaid shopping experience.'),
  supportEmail: z.email().nullish(),
  supportPhone: text.nullish(),
  businessName: text.nullish(),
  businessAddress: text.nullish(),
  registration: text.nullish(),
  identityName: text.optional(),
  logo: photoSchema.nullish(),
  seoTitle: text.nullish(),
  seoDescription: text.nullish(),
  social: z.record(z.string(), z.url({ protocol: /^https$/ })).default({}),
  flatShippingPaise: amount.nullish(),
  freeShippingFromPaise: amount.nullish(),
  checkoutEnabled: z.boolean().default(false),
  trackingEnabled: z.boolean().default(false),
  newsletterEnabled: z.boolean().default(false),
  contactEnabled: z.boolean().default(false),
  paymentMethods: z.array(z.enum(['UPI', 'Debit card', 'Credit card', 'Net banking'])).default([]),
  policies: z.record(z.string(), z.array(z.object({ title: text, body: text }))).default({}),
});
export type Settings = z.infer<typeof settingsSchema>;
export const addressSchema = z.object({
  fullName: text.min(2).max(100),
  mobile: z.string().regex(/^[6-9]\d{9}$/),
  address: text.min(8).max(350),
  city: text.max(100),
  state: text.max(100),
  pin: z.string().regex(/^[1-9]\d{5}$/),
});
export type Address = z.infer<typeof addressSchema>;
export const cartLineSchema = z.object({
  slug: slugSchema,
  variantId: text.max(160),
  quantity: z.number().int().min(1).max(99),
});
export type CartLine = z.infer<typeof cartLineSchema>;
export const quoteSchema = z
  .object({
    id: text,
    currency: z.literal('INR'),
    subtotalPaise: amount,
    shippingPaise: amount,
    discountPaise: amount,
    totalPaise: amount.positive(),
    taxPaise: amount.optional(),
    delivery: text,
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .refine((q) => q.totalPaise === q.subtotalPaise + q.shippingPaise - q.discountPaise);
export type Quote = z.infer<typeof quoteSchema>;
const httpsUrl = z.url({ protocol: /^https$/ });
export const paymentSessionSchema = z.object({
  quoteId: text,
  paymentUrl: httpsUrl.refine((s) => {
    const u = new URL(s);
    return (
      !u.username &&
      !u.password &&
      ['rzp.io', 'rzp.me', 'razorpay.com', 'pages.razorpay.com', 'api.razorpay.com'].includes(u.hostname)
    );
  }),
});
export const standardSessionSchema = z.object({
  quoteId: z.uuid(),
  keyId: z.string().regex(/^rzp_(?:test|live)_[A-Za-z0-9]+$/),
  orderId: z.string().regex(/^order_[A-Za-z0-9]+$/),
  amount: z.int().positive(),
  currency: z.literal('INR'),
});
export const trackingSchema = z.object({
  orders: z.array(
    z.object({
      reference: text,
      status: text,
      items: z.array(text),
      update: text,
      carrier: text.nullish(),
      trackingUrl: httpsUrl.nullish(),
    }),
  ),
});
export const receiptSchema = z.object({
  verified: z.literal(true),
  paymentStatus: z.literal('captured'),
  reviewEligible: z.boolean().optional(),
  shippingPaise: amount.optional(),
  taxPaise: amount.optional(),
  reference: text,
  quoteId: text,
  totalPaise: amount,
  items: z
    .array(
      z.object({
        productId: z.uuid().optional(),
        revenuePaise: amount.optional(),
        name: text,
        size: text.nullable(),
        quantity: z.int().positive(),
        lineTotalPaise: amount,
      }),
    )
    .min(1),
  delivery: text,
});
export type Receipt = z.infer<typeof receiptSchema>;
export type Tracking = z.infer<typeof trackingSchema>['orders'];
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; kind: 'unavailable' | 'invalid' | 'limited' | 'conflict' | 'missing'; message: string };
