# Stage 2 verification · 18 November 2026

Tested the production Next.js build in the disconnected configuration, plus a separate one-shot, loopback-only **contract test** of the configured access boundary. No merchant products, reviews, orders, customers or financial records were seeded. No live provider was called. The application preview does not include a test backend.

[Admin browser results](browser-results.json) · [Access-boundary results](boundary-results.json) · [Stage 1 regression results](storefront-regression.json) · [Illustrated handoff](../PARADELLE-Stage-2.pdf)

| Check | Result |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm run build` | Passed; 13 requested admin routes plus a private not-found route, all dynamic. Existing public routes still build. |
| `npm test` | **34/34** passed: 17 existing tests and 17 new tests of contracts, costs, evidence, review permission, stock, queries and transition rules. |
| `npm audit` | **0** reported vulnerabilities in the locked packages at test time. |
| Admin browser matrix | **39 route checks**: 13 routes × desktop 1440×960, tablet 820×1180 and mobile 390×844. Private cache/referrer/robots headers checked on each. |
| Responsive layout | **74 checks** including 360, 430, 768, 1024 and 1280px boundaries, all eight mobile import steps and all seven mobile settings sections. No page-level horizontal overflow. |
| Accessibility | **52** automated WCAG A/AA scans on admin routes, drawers, local photo preview and import steps, **0 detected violations**. Keyboard dismissal, focus restoration, responsive page finder and real native form controls exercised. |
| Admin interactions | **11 groups**; no unexpected browser, JS, HTTP or network errors. Normal browser-cancelled navigation/prefetch requests are recorded separately. |
| Configured boundary | **10 checks** passed with empty registers and deliberately rejected store writes. These verify the adapter, not actual Supabase, RLS or provider behaviour. |
| Shopper regression | **45 route checks**, 69 layouts, 135 image decodes, 54 JSON-LD blocks, 49 internal destinations, **49 axe scans**, 14 interaction groups. **0 unexpected errors / 0 detected accessibility violations**. Both deliberate public 404 paths retained. |

Runtime: Node 22.22.3, Next 16.4.6, Chromium 153.0.8010.0, Playwright and axe-core. Viewport and automated checks do not replace physical-device, assistive-technology or field-performance testing. The local storefront performance sample is in the JSON report; it is not a production Core Web Vitals claim.

## What was exercised

- Desktop sidebar collapse, keyboard page finder/no-match/selection, tablet drawer and return of focus on Escape. Mobile uses a compact eight-step selector, not a scaled-down desktop rail.
- Authentication/recovery form validation, password visibility, honest unavailable messages and no local session when unconfigured. Configured boundary tests covered direct URL access, role checks before cookie issuance, HttpOnly/Secure/Strict/admin-path cookie, absent PII grant, expiry/revocation on an already-mounted editor, and logout.
- Product search/category/status/sort/clear; draft vs publish checks; adding/removing a size; local WebP preview in a dialog, permission gate, rejected upload and removal; exact computed price/margin, explicit recommendation and discard confirmation.
- Import URL/rights checks; authorised manual fact sheet and verification flag; unconfigured extraction/generation cannot succeed; five individually named output slots; permission-cleared review stream; listing/price preview, blocked publication, cancellation confirmation and resumable tracker filters.
- Order, inventory, review and customer filters/sorts; customer query text stays in the private request body. Reporting period and grouping switch without drawing any chart from missing data. All seven settings sections, policy add/remove, social/contact validation and save confirmation.
- Empty vs unavailable vs permission denied vs missing detail; upstream outage, malformed data, Retry, stale revision and ambiguous-success receipt; no raw error message or service token exposed. No private browser storage, public sitemap entry or public shell on admin routes.
- Original storefront navigation, gallery/swipe, collections, guest bag/checkout guards, device persistence, tracking and verified receipt boundaries. The optional checkout contact email is independent of stored device addresses and never opts into marketing.

Accessibility/visual corrections during testing included the full sidebar wordmark width, an accessible icon-only storefront link, the keyboard shortcut's accessible name, explicit select labels and contrast on ungenerated frame captions. The final screenshots are from the passing build.

## Screenshots · actual workspace

| Surface | Captures |
|---|---|
| Overview | [Desktop](screenshots/desktop-overview.png) · [Tablet](screenshots/tablet-overview.png) · [Phone](screenshots/mobile-overview.png) |
| Import studio | [Desktop](screenshots/desktop-importer.png) · [Tablet](screenshots/tablet-importer.png) · [Phone](screenshots/mobile-importer.png) · [Five-frame direction](screenshots/desktop-five-frames.png) |
| Access and catalogue | [Staff sign-in](screenshots/desktop-login.png) · [Products](screenshots/desktop-products.png) · [New product](screenshots/desktop-products-new.png) · [Protected edit without service](screenshots/desktop-products-no-record-edit.png) |
| Operations | [Orders](screenshots/desktop-orders.png) · [Protected order detail without service](screenshots/desktop-orders-no-record.png) · [Inventory](screenshots/desktop-inventory.png) · [Customers](screenshots/desktop-customers.png) · [Reviews](screenshots/desktop-reviews.png) |
| Reporting and configuration | [Analytics](screenshots/desktop-analytics.png) · [Settings](screenshots/desktop-settings.png) |

The dashes are unavailable metrics, not zero revenue. The five image positions show the required job outputs, **not** placeholder products or fabricated generated photos. No private customer screen was populated to produce a screenshot.

## Reproduce

```sh
npm ci
npm run lint && npm run typecheck && npm test && npm run build
npm run contract:admin
# With an unconfigured production instance running at port 3000:
npm run test:admin
npm run test:browser
# One-shot configured access checks; test listener exists only during this command:
NODE_ENV=production npm run test:boundary
```

Use an installed Playwright Chromium or set `CHROMIUM_PATH` to a compatible executable. `QA_BASE_URL` changes the test origin. `QA_CAPTURE=1 QA_ADMIN_CAPTURE_DIR=docs/admin/screenshots npm run test:admin` captures the workspace. The sandbox used its packaged browser libraries via `LD_LIBRARY_PATH`. Do **not** run the disconnected interaction suite against a live merchant account.

## What still requires Stage 3

No genuine protected business records, auth tenant, licensed source feed, storage bucket, fal jobs or Razorpay credentials were supplied. Real password delivery, successful durable CRUD, worker retry/callback, paid/refunded transactions, stock concurrency and actual RLS policies are **not certified by these tests**.

A read-only `npm run test:admin:records` suite is supplied for a staging store with a real product/photo, inventory row, order, customer, review and import job. It needs an authorised, externally managed Playwright storage state (`QA_ADMIN_STORAGE_STATE`) and staging `QA_BASE_URL`. Keep the file outside the repository; never paste session tokens into chat. It opens/cancels selection, duplicate/delete, adjustment and moderation dialogs, checks product/order history and resumes a real job; it does **not** submit changes or capture PII. This suite and the existing `test:published` suite were **not run** without genuine records.

Before release, separately execute controlled authorised write, refund, upload, extraction and publication cases against the actual Stage 3 services, including stale revisions, partial worker failure, missing source permission, duplicate callback and failed provider verification. Follow the [provider release checklist](CONTRACT.md#before-enabling-production).
