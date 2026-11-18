# Stage 3 pre-development report · 2026-11-18

Research before code, as required. Official sources only; no assumptions carried into implementation.

## 1. Next.js server boundary
- Proxy optional; Server Actions and Route Handlers are directly addressable. Verify DAL grants/projections/origin/size at handler entry [nextjs.org/docs/app/guides/authentication](https://nextjs.org/docs/app/guides/authentication) [nextjs.org/docs/app/guides/backend-for-frontend](https://nextjs.org/docs/app/guides/backend-for-frontend) [nextjs.org/docs/app/guides/server-actions](https://nextjs.org/docs/app/guides/server-actions)
- `updateTag` is Server-Action-only; handlers must use `revalidateTag`/`revalidatePath` [nextjs.org/docs/app/api-reference/functions/updateTag](https://nextjs.org/docs/app/api-reference/functions/updateTag)
- Metadata, cache and file conventions per [nextjs.org/docs/app/getting-started/metadata-and-og-images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images)

## 2. Supabase security
- Grants AND Row Level Security required; restrict `EXECUTE` on functions [supabase.com/docs/guides/api/securing-your-api](https://supabase.com/docs/guides/api/securing-your-api)
- User metadata editable; service roles bypass RLS [supabase.com/docs/guides/auth/users](https://supabase.com/docs/guides/auth/users)
- Use `getUser` for valid claims, not unverified cookie/`getSession` [supabase.com/docs/reference/javascript/auth](https://supabase.com/docs/reference/javascript/auth) [supabase.com/docs/guides/getting-started/tutorials/with-nextjs](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs)
- Separate Storage policies [supabase.com/docs/guides/api/securing-your-api](https://supabase.com/docs/guides/api/securing-your-api) Storage path: `supabase/storage`
- Atomic DB work via functions; invoker/permissions, CLI history, no prod seeds [supabase.com/docs/guides/database/functions](https://supabase.com/docs/guides/database/functions) [supabase.com/docs/guides/deployment/database-migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- Transaction pooler: no prepared statements/pipelining [supabase.com/docs/guides/database/connecting-to-postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)
- Indexed joins/partials + EXPLAIN [supabase.com/docs/guides/database/query-optimization](https://supabase.com/docs/guides/database/query-optimization)
- Backups: plan-specific daily/PITR, Storage objects excluded [supabase.com/docs/guides/platform/backups](https://supabase.com/docs/guides/platform/backups)

## 3. Razorpay INR provider
- Paise server order; HMAC-SHA256 `order_id|payment_id`; only `captured`/`paid` counts [razorpay.com/docs/payment-gateway/web-integration/standard/best-practices](https://razorpay.com/docs/payment-gateway/web-integration/standard/best-practices)
- Order creation: unique receipt, multiple attempts, no universal idempotency header; reconcile by receipt+amount [razorpay.com/docs/us/api/orders/create](https://razorpay.com/docs/us/api/orders/create) [razorpay.com/docs/us/api/orders/fetch-all](https://razorpay.com/docs/us/api/orders/fetch-all)
- Webhooks: raw bytes, separate secret, dedup/reordering [razorpay.com/docs/us/webhooks/validate-test](https://razorpay.com/docs/us/webhooks/validate-test) [razorpay.com/docs/us/webhooks/best-practices/](https://razorpay.com/docs/us/webhooks/best-practices/)
- Refunds: `X-Refund-Idempotency`, pending/processed/failed [razorpay.com/docs/api/refunds/create-normal/](https://razorpay.com/docs/api/refunds/create-normal/?preferred-country=IN) [hdfcbank-collectnow-docs.razorpay.com/api/refunds/normal-refunds-idempotent/](https://hdfcbank-collectnow-docs.razorpay.com/api/refunds/normal-refunds-idempotent/)

## 4. fal generation and rights
- `fal-ai/flux-2-pro/edit` reference edit: `image_urls`, `square_hd`, JPEG, $0.03 + $0.015/MP [fal.ai/models/fal-ai/flux-2-pro/edit/api](https://fal.ai/models/fal-ai/flux-2-pro/edit/api) – not source rights.
- Queue: authenticated, persist `request_id`/`status_url`/`response_url`; poll or verified webhook [docs.fal.ai/model-apis/model-endpoints/queue](https://fal.ai/docs/documentation/model-apis/inference/queue)
- `openrouter/router` for verified-fact copy [fal.ai/models/openrouter/router/api](https://fal.ai/models/openrouter/router/api)
- Media expiration: `X-Fal-Store-IO:0` opts history; CDN lifecycle separate [fal.ai/docs/documentation/model-apis/media-expiration](https://fal.ai/docs/documentation/model-apis/media-expiration)

## 5. Meesho terms
- Reseller mention ≠ licence for edits/marks; no blanket catalogue/review/AI rights, blind shipping or authorised feed [meesho.com/legal/terms-conditions](https://www.meesho.com/legal/terms-conditions) §9.1 – manual, verified, licensed path required.

## 6. Deployment
- Env vars: separate preview/prod, redeploy [vercel.com/docs/environment-variables](https://vercel.com/docs/environment-variables)
- Function limits, cron bearer `CRON_SECRET`, Hobby daily/no redirects [vercel.com/docs/functions/limitations](https://vercel.com/docs/functions/limitations) [vercel.com/docs/cron-jobs/manage-cron-jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- Domains: both hosts, account-specific DNS/TLS [vercel.com/docs/projects/domains/add-a-domain](https://vercel.com/docs/projects/domains/add-a-domain)

## 7. Measurement
- GA4 ecommerce: allowlist item/currency/value/transaction_id [developers.google.com/analytics/devguides/collection/ga4/ecommerce](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce)
- Consent: default deny/update/withdraw, Meta revoke/grant, load after consent, no PII [developers.google.com/tag-platform/security/guides/consent](https://developers.google.com/tag-platform/security/guides/consent) [developers.facebook.com/docs/meta-pixel/implementation/gdpr/](https://developers.facebook.com/docs/meta-pixel/implementation/gdpr/)
- Sitemap: canonical, Search Console [developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- Web Vitals p75 field, not lab [web.dev/articles/vitals](https://web.dev/articles/vitals)

## 8. OWASP
- Access, sensitive flows, SSRF, misconfig, supply chain, logging [owasp.org/Top10/2025/](https://owasp.org/Top10/2025/) [api-security.owasp.org/editions/2023/en/0x11-t10/](https://api-security.owasp.org/editions/2023/en/0x11-t10/)

## 9. Stage 3 plan
- Private DAL via `paradelle_runtime`, 4 migrations + RLS/projections/reconciliation, no public schema exposure
- Server routes under `app/api/[...route]` and `app/admin/media/[id]`; bounded SQL; guest + staff boundaries
- Razorpay checkout/settlement/reconciliation/refunds; verified receipt/tracking; media/worker/importer; privacy/measurement; delivery settings
- Tests: isolated PG + optional browser, provider-contract, commerce-browser; never claim live provider success without real acceptance
