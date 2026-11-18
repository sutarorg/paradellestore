# Public storefront integration · Stage 3

Private Stage 2/3 contracts supplement this: [merchant studio](admin/README.md), [provider contract](admin/CONTRACT.md), [OpenAPI](admin/openapi.json), [Stage 3 report](STAGE3-REPORT.md), [deployment](production/DEPLOYMENT.md).

## Configuration
`.env.example` is canonical, non-secret. Preview and Production MUST use separate Supabase projects and `rzp_test_` vs `rzp_live_` keys. `DATABASE_URL` is Supavisor transaction pooler (6543) TLS-verified, dedicated `paradelle_app` login granted ONLY `paradelle_runtime`. Never expose `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_HMAC_SECRET`, `CRON_SECRET`, `RAZORPAY_*_SECRET` or `FAL_KEY` to browser or `NEXT_PUBLIC_` prefix. `PRODUCT_IMAGE_HOST` and `SITE_ORIGIN` rebuild-required. Run `node scripts/check-configuration.mjs` before deploy.

No browser code contacts `localhost` or Razorpay SDK directly. Same-origin Server Actions → private DAL or `configuredDB() ? guestCall : STOREFRONT_API_URL`. Browser leaves only for backend-issued Razorpay hosted URL after reviewing a server quote. Arena preview allows its action origin; production allows none extra.

## Database and migrations
Six ordered migrations (`supabase/migrations`):

1. `20261118000100_commerce` — `shop` schema, `paradelle_runtime` role, tables: `profiles`, `staff_sessions`, `store_settings`, `products`, `assets`, `product_images`, `variants`, `stock_history`, `coupons`, `customers`, `addresses`, `checkout_intents` (+ `reservations`), `orders`/`order_items`/`payments`/`payment_events`/`refunds`/`order_fulfilment`, `product_import_jobs`, `product_reviews`, `admin_activity_logs`, `command_receipts`, `work_queue`, `rate_windows`; indexes + `shop.next_order_number()` (`PAR-00001`…).
2. `20261118000200_access_storage` — enable RLS per table, `paradelle_runtime` grants, `authenticated` own-profile policy, private `product-images`/`site-assets` buckets, restrictive `storage.objects` policy (no anon).
3. `20261118000300_projections` — `security_invoker` views `published_catalogue`, `product_register`, `order_register`, `customer_register`, `review_register`, `inventory_register`, `job_register`, `analytics_claims`.
4. `20261118000400_reconciliation` — `checkout_intents.checked_at/provider_state`, `work_queue` manifests, `store_settings.shipping_gst_bps`, `variant_option` uniqueness, ancillary indexes.
5. `20261118000500_evidence` — `assets.renditions`, `order_items` SKU/colour/source-price/discount/tax snapshots, `shop.review_evidence` trigger (licensed ≤10, purchase requires delivered order), revoke email update.
6. `20261118000600_operations` — `fulfilment_revisions` audit, `import_source_once`, `refund_one_inflight`.

Apply with `supabase db push`. `supabase/config.toml` (PG17, no seed, no signup, apex URLs). Create login `paradelle_app → paradelle_runtime`. Insert `auth.users` + `shop.profiles` active rows for each staffer (least privilege).

## Stages
**Stage 2** — publish real products/variants/stock/images/SEO, manual fulfilment, `settingsSchema`.
**Stage 3** — server-owned stock/price validation, serviceability (Indian regions + PINs, `shipping_gst_bps`), quotes/holds, Razorpay order/signature/webhook/reconciliation, receipts/tracking/reviews, media renditions, worker queue, privacy/measurement. Frontend not an auth boundary; rate-limit at service/edge.

## HTTP contracts (`lib/contracts.ts`)

| Method/path relative to API base | Input → success |
|---|---|
| `GET settings` | `settingsSchema` (disabled off) |
| `GET catalogue` | `catalogueSchema` (published only) |
| `POST checkout/quote` | `{lines:{slug,variantId,quantity}[], address:{fullName,mobile,address,city,state: Indian region,pin},email?,termsAccepted}` → `quoteSchema` (opaque ID, paise totals, 15-min reserve, delivery note) |
| `POST checkout/session` | `{quoteId}` → `paymentSessionSchema` (matching quote, hosted `https://api.razorpay.com`/`checkout.razorpay.com` URL) |
| `POST payments/receipt` | `{receipt}` → `receiptSchema` only after captured |
| `POST orders/track` | `{mobile}` → `trackingSchema` masked `PAR-…` results |
| `POST newsletter/contact` | opt-in only |

Prices paise, shipping nullable (unknown≠free), session amount == quote. Public reads `revalidate:60`, POSTs `no-store`, 8s timeout. `409/410` stale, `429` throttle. See `lib/gateway.ts`, `lib/actions.ts`, `lib/server/{checkout,http}`.

Current catalogue adapter: server-side filtering/sorting, 12/pg, facets `category/edit/q/sort/min/max/fabric/size/style/colour/availability/occasion/page` (rupee URLs → paise query, AND across facets, OR inside).

## Payment/privacy
1. Bag = intent, not reservation; reconcile IDs, reject deleted/over-quota.
2. Server quote → review → explicit payment action → server Razorpay order (`receipt` unique, `FAL_DAILY_SUBMISSION_LIMIT` bounded).
3. Backend verifies HMAC/`paid` captured, persists order, returns 24–192 char receipt (`order-success?receipt=`); do not log secrets.
4. Receipt ignores `?paid` flags; requires `verified:true && paymentStatus:captured`.
5. Browser stores no payment URL/receipt/quoteId; one-way digest clears only unchanged bag.
6. Tracking: mobile without OTP, server-masked (last 4 visible in desk only), rate-limited.
7. Measurement: GA4/Meta off by default, 180-day `paradelle:privacy:v1`, sandbox `public/signals.html` with allowlist, per-order `analytics_claims` dedup (see `lib/measurement.ts`, `signals.js`, `completed-purchase.tsx`). No form/URL/address/payment PII in tags.

## Local storage
`paradelle:shopping:v1` (cart ids/qty, wishlist, ≤12 recent, sort, optional address 30d) + `paradelle:privacy:v1`. Sanitised on read; corruption/denial recovers.

## Launch gates
Real media/variants, merchant identity/policies/shipping, canonical TLS, Razorpay methods + verification, tracking, consent-based messaging. Run `QA_PRODUCT_SLUG` published test + provider sandbox E2E before opening. See deployment doc.
