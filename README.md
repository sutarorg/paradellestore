# PARADELLE · Storefront & merchant studio

One Next.js application for the guest Kurti storefront at **paradelle.store** and its private merchant workspace under **`/admin`**. There is no seeded catalogue, separate admin deployment, customer login or simulated payment/import backend.

**Stage 2:** [Merchant studio and route map](docs/admin/README.md) · [Stage 3 provider contract](docs/admin/CONTRACT.md) · [OpenAPI 3.1](docs/admin/openapi.json) · [Verification and screenshots](docs/admin/QA.md).

**Try the workspace:** open `/admin`, `/admin/importer` or `/admin/products/new`. The disconnected shell contains no private records, and neither authentication nor writes can succeed until Stage 3 supplies trusted services. Public shopping URLs and the Stage 1 reference composition are unchanged.

## Run locally

Use Node 22.17+ (tested with 22.22.3) and npm.

```sh
npm ci
npm run dev
```

For production: `npm run build` followed by `npm start`. Both servers bind to `0.0.0.0`; customer code uses same-origin navigation and Next Server Actions. Fonts and campaign assets are local and do not need a third-party request at build or runtime. Install dev dependencies in the **build** stage for Tailwind, TypeScript and the font source files.

## Storefront routes

| Route | Experience |
|---|---|
| `/` | Three manually controlled campaigns, six category shortcuts, arrivals, bestsellers, curated edits, brand values, conditional verified reviews and newsletter |
| `/kurtis` | Search, category chips, seven filter dimensions, sorting, product count and crawlable pagination |
| `/kurtis/[slug]` | Published product gallery, fullscreen/swipe, variants and size guide, prices, details, delivery and return terms, verified reviews, related pieces, sticky mobile purchase action |
| `/wishlist` | Browser-saved favourites and recently viewed pieces |
| `/cart` | Live catalogue reconciliation, quantity controls, removal, price breakdown and unavailable-item handling |
| `/checkout` | Guest delivery form, separate address opt-in, terms acknowledgement, authoritative quote, prepaid handoff |
| `/order-success` | Private, uncached receipt lookup; confirmation only for a verified, captured transaction |
| `/track-order` | Guest mobile-number lookup with masked results, validation, unavailable, rate-limit and no-match states |
| `/about` | Brand story and campaign lookbook using the same gallery as a published product |
| `/contact` | Care directory, FAQs and configured contact channels or enquiry form |
| `/shipping-policy`, `/returns-refunds`, `/privacy-policy`, `/terms` | Readable policies with configurable merchant details; the privacy page also lets shoppers clear device data |
| `/sitemap.xml`, `/robots.txt` | Public discovery and crawler directives |

The reference is preserved at `Elegant Paradelle Kurtis UI Presentation.png`. There are **no purchasable pieces until the merchant publishes them**. A missing product returns HTTP 404. Lists distinguish an empty collection from a failed catalogue request. Turning off checkout, tracking or subscriptions never fabricates a successful operation.

## Storefront architecture

- **`app/`** — Server Components, route metadata, sitemap, robots, page/error/loading states. Metadata describes each actual route; category and product links are ordinary crawlable links. Breadcrumb and product JSON-LD is emitted from rendered content, never demo records.
- **`components/`** — shared editorial and commerce UI. Server-rendered shelves, cards and policy layouts; interactive islands for the header, campaign, discovery controls, gallery, purchase, bag, checkout and tracking. Native labelled dialogs support keyboard dismissal, contained focus and focus restoration.
- **`lib/contracts.ts`** — TypeScript models derived from runtime-validated public API contracts. All money crosses the boundary as **integer INR paise**.
- **`lib/gateway.ts`, `lib/actions.ts`** — server-only integration boundary, bounded requests and typed failure states. No browser-facing backend hostname, service key or payment secret.
- **`lib/shop.ts`** — deterministic search, filtering, sorting, pagination, quantity and pricing rules.
- **`lib/device.ts`** — versioned, bounded browser storage, cross-tab updates, expiry, corruption recovery and in-memory fallback. Cart records contain identifiers and quantities, not trusted prices or inventory.
- **`lib/content.ts`, `lib/policies.ts`** — category taxonomy, editorial content and default care information. Merchant policies can replace defaults through store settings.
- **`app/globals.css`, `public/editorial/`** — Tailwind v4, brand tokens, responsive layouts, local campaign art and deliberate portrait crops. Reduced-motion preferences are respected.

## Dependencies

Locked stable versions are in `package-lock.json`. Application: Next.js 16.4.6, React/React DOM 19.3.1, Lucide React 1.75.0 and Zod 4.6.7. Build: TypeScript 6.0.3, Tailwind CSS/PostCSS 4.3.5, PostCSS 8, local Fontsource Cormorant Garamond and DM Sans via `next/font/local`. Quality: Biome 2.6.8, Node test runner with `tsx`, Playwright and axe-core. No carousel, animation, global state or payment SDK is loaded on the landing page.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

With the **unconfigured** production storefront running at port 3000:

```sh
npx playwright install chromium
npm run test:browser
npm run test:admin
```

`QA_BASE_URL` overrides the test origin. `CHROMIUM_PATH` optionally selects an existing Chromium executable. `QA_CAPTURE=1 QA_CAPTURE_DIR=docs/screenshots npm run test:browser` also captures the three viewport classes. The default browser suite uses the genuine empty/unavailable states; do not point it at a production service handling customer tracking requests.

After connecting a **real, published, in-stock piece**, set `QA_PRODUCT_SLUG` and run `npm run test:published` against a test deployment. This exercises the published merchandising path without checking out, paying, emailing or creating an order.

## Handoff

[Download the illustrated Stage 2 handoff (PDF)](docs/PARADELLE-Stage-2.pdf) · [Staff access, private routes, importer and operations](docs/admin/README.md)

[Download the illustrated Stage 1 handoff (PDF)](docs/PARADELLE-Stage-1.pdf)

- [Research findings and visual direction](docs/RESEARCH.md)
- [Stage 2/3 configuration and API contracts](docs/INTEGRATION.md)
- [QA results and reference comparisons](docs/QA.md)
- Screenshots: [mobile](docs/screenshots/mobile-home.png) · [tablet](docs/screenshots/tablet-home.png) · [desktop](docs/screenshots/desktop-home.png)

Private boundary checks: after `npm run build`, run `npm run test:boundary`. This one-shot test boots an isolated loopback instance with empty registers and deliberately rejected writes, then shuts it down. It does not connect to a merchant database. See [admin QA](docs/admin/QA.md) for viewport captures and optional genuine-record staging acceptance.
