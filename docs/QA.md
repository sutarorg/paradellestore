# Verification · 18 November 2026

## Stage 3 · isolated service (embedded-postgres 18, Node 22, local Next/Chromium optional)

| Check | Result | Evidence |
|---|---|---|
| Biome lint (120 files) | Passed | `/tmp/paradelle-stage3-fix5` → current `Checked 120 files… No fixes` |
| Next `typegen && tsc --noEmit` | Passed | typecheck logs `Types generated successfully` |
| Domain + admin + store unit | 34 passed | `npm test` |
| `next build` | Passed (static/dynamic) | local build logs |
| `npm audit` | 0 vulnerabilities (locked) | `audit` logs |
| Isolated PostgreSQL 14 checks (transactions, RLS, stock, coupons, checkout, webhook, tracking, PII, fulfilment, importer, views, reconciliation) | **14 passed** | `npm run test:commerce` → `1..14 pass` (`/tmp/paradelle-stage3-commerce9` etc) |
| Optional browser E2E (mobile bag→Standard Checkout fixture→verified receipt→masked tracking; staff detail/revocation; image decode; consent/GA4/Meta dedup) | 14 passed | `npm run test:commerce:browser` (`/tmp/paradelle-stage3-e2e2` 14 pass) |
| Browser matrix (storefront) / Admin matrix | 0 errors/violations, expected 404s, decoded images, axe scans | `test:browser` / `test:admin` logs |
| Boundary / Admin records | 10/10 + records pass (private POST, no PII leakage, 409, revocation) | `test:boundary`, `test:admin:records` |

**Not hosted verification:** no cloud Supabase Auth/Storage migration acceptance, no Razorpay live/test transaction, no fal generation, no DNS/TLS, no production traffic. Isolated concurrency/replay tests do not equal provider transactions. Preview origin `https://3000-…e2b.app` only.

### Manual provider acceptance (run after provisioning)
- Supabase: migrate, `supabase/tests/access-audit.sql` (anon denied, own active profile, runtime immutability), Storage private buckets, Auth sign-in/recover with active-only enumeration safety
- Razorpay: server order create with `receipt`, HMAC `order_id|payment_id`, captured only, webhook raw-bytes/previous-secret rotation, refunds with `X-Refund-Idempotency` status polling
- fal: `flux-2-pro/edit` square image + `openrouter/router` copy, budget `FAL_DAILY_SUBMISSION_LIMIT`, lease/queue manifests, human approval
- Tracking/receipts: 90-day receipt, 45-day masked results, fulfilment history, analytics claims per order/channel

For historical Stage 1 (45×3 routes, 135 decodes, LCP 104ms lab) see `docs/PARADELLE-Stage-1.pdf` and `qa-summary.json`. Stage 2 admin screenshots in `docs/admin/screenshots`.
