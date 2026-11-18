# Stage 1 verification · 18 November 2026

Tested the production Next.js build, without a catalogue API or payment provider configured. The production preview is the customer storefront, not a test harness. The original repository reference is unchanged.

[Illustrated handoff (PDF)](PARADELLE-Stage-1.pdf) · [Machine-readable browser results](qa-summary.json)

## Results

| Check | Result |
|---|---|
| Biome lint, warnings treated as errors | Passed |
| Next route type generation and `tsc --noEmit` | Passed |
| Node domain, storage and contract tests | **17 passed** |
| `next build` | Passed; static, revalidated and dynamic routes generated |
| `npm audit` | No reported vulnerabilities in the locked dependencies at test time |
| Browser route matrix | **45 checks:** 15 paths × 3 viewport classes, including genuine HTTP 404s for a missing product and an unknown page |
| Responsive layout | **69 checks**, no page-level horizontal overflow; widths 360, 390, 404–410 (reference views), 430, 768, 820, 1024, 1280 and 1440px exercised |
| Art and navigation | **135 image-decode checks**, 49 internal URL/fragment targets, sitemap, robots and favicon checked |
| Structured data | 54 rendered JSON-LD blocks parsed across the layout matrix; no product offers on editorial pages |
| Accessibility | **49 axe scans**, zero detected WCAG A/AA violations in tested states; includes four open dialogs. Keyboard, Escape, focus restoration and swipe checked separately |
| Browser/HTTP | No unexpected console errors, uncaught page errors, HTTP failures or failed requests. Intentional 404s and browser-cancelled navigation/prefetch requests are recorded separately |

Primary viewports: **410 × 974**, **820 × 1180**, **1440 × 960**, device scale factor 1. Chromium 153.0.8010.0, Playwright, Node 22.22.3. These are browser viewport checks, not a claim of physical iOS/Android or screen-reader certification.

### Interaction coverage

- Campaign arrows and direct slide selection; menu, search, category, wishlist and bag navigation; native search focus and keyboard dismissal.
- Price validation, facet selection, apply/remove/reset, sort updates, URL state, sort persistence across reloads and fresh navigations.
- Shared garment/lookbook gallery: thumbnail selection, fullscreen, arrow keys, arrow buttons, dismissal, restored focus and a browser touch swipe.
- Bag and wishlist storage mutations, quantity limits, recent-view deduplication, browser reopening/reload semantics, stale references, quantity changes, removal and unavailable-item checkout gating. Unit tests use opaque identifiers, not product fixtures or invented merchandise.
- Guest tracking: invalid mobile number, service unavailable and no number persisted. Receipt page refuses client success flags and unverified receipt tokens.
- Privacy clear/cancel, corrupted JSON and storage-denied browsing. Confirmed-checkout cleanup matches a one-way quote digest and unchanged bag, without storing a payment secret.
- Customer-care accordions, internal links and precise anchor targets. Disabled communications services do not offer a pretend send/subscribe action.

## Reference comparison

Images were compared at the size of each phone panel, **not** at the 1536px width of the whole presentation. Outer presentation margins, rounded device frames and drop shadows are not part of the website.

| Surface | Reference and correction |
|---|---|
| Home, 410 × 974 | The final announcement is 29px and header 56px; the hero starts at **y=85** and is **324.7px** tall (reference approximately 85 and 325). The category portrait ring measures **64px**. Adjusted the mobile wordmark, removed the desktop hero eyebrow, restored upright mobile headline type and tuned the mobile crop. |
| Collection, 404 × 974 | Aligned the inner header to **63px**, kept the filter/sort pair on one row, shortened the initial sort control label, and positioned the chips and count above the listing region. The reference's example stock is intentionally replaced by a truthful empty state and a labelled editorial image. |
| Gallery, 408 × 974 | The shared gallery has a **56px** thumbnail rail, **13px** gutter and **305 × 407px** main portrait, compared with roughly **59px**, **14px**, **306 × 404px** in the reference. Inspected the actual component on the editorial lookbook; no fictional priced PDP was created. |

[Home: reference vs implementation](screenshots/home-reference-comparison.jpg) · [Collection comparison](screenshots/collection-reference-comparison.jpg) · [Gallery comparison](screenshots/gallery-reference-comparison.jpg)

The original's sample free-shipping offer, inventory count and product prices were not copied. The product/checkout/confirmation templates cannot be truthfully demonstrated with filled order data until real services are connected.

## Screenshots

- [Mobile homepage — 410 × 974](screenshots/mobile-home.png)
- [Tablet homepage — 820 × 1180](screenshots/tablet-home.png)
- [Desktop homepage — 1440 × 960](screenshots/desktop-home.png)
- [Mobile collection](screenshots/mobile-collection.png) · [Desktop collection](screenshots/desktop-collection.png) · [Mobile lookbook](screenshots/mobile-lookbook.png)

## Performance and remaining validation

In one **local, unthrottled** desktop sample after the route sweep, the browser observed LCP 104ms, CLS 0 and response start 3ms. This is a development diagnostic, **not** production field performance, a percentile, or an INP result. Measure LCP, INP and CLS at the 75th percentile on the deployed origin under real traffic.

A published product and actual provider responses were not supplied. Live inventory freshness, successful quote/session creation, verified capture, refund/fulfilment events, tracking matches and actual email delivery remain integration acceptance tests, not claims made by this frontend. `npm run test:published` is available for a genuine in-stock slug. Use provider-authorised test transactions only after the backend is connected. See [integration contracts](INTEGRATION.md) and [reproduction commands](../README.md).
