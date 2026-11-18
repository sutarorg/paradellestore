# Research and art direction

Research preceded scaffolding, package installation and asset generation. The findings, plan and proposed architecture were reported in the conversation before implementation.

## Primary reference

The supplied Drive file and repository PNG are the same 1536 × 1024 image (MD5 `865598bd212e0850273bd783fd8fa009`). The three phone panels are visual references, **not** a product feed. The reference's prices, stock count, shipping offer and review implications were not imported.

The homepage image is edge-to-edge: campaign type occupies the dark left side; the lighter garment occupies the right. The centred mobile wordmark and narrow utilities sit above the image, not over it. Circular portraits form the next visual row. The collection uses a spaced heading, filter/sort pair, pill-shaped categories, count, consistent two-column cards and bottom navigation. Product detail is unusually economical: a thin *vertical* thumbnail rail preserves a large main portrait without pushing the buying controls down a second screen.

**Translation:** retain those proportions on phones, including the dark announcement only on the home screen. Expand to a broad courtyard photograph on desktop, a left wordmark, in-line navigation, restrained serif/italic display type and a full-width portrait index. The desktop adaptation is not a row of simulated phones. The reference's account destination becomes guest order tracking. Artwork never carries a product price.

## Design, discovery and decisions

| Evidence reviewed | Design decision |
|---|---|
| Awwwards' [1](https://www.awwwards.com/awwwards/collections/fashion/) fashion collection and the award-winning fashion commerce project Terminal 27 [1](https://www.awwwards.com/sites/terminal-27). | Borrow editorial hierarchy and a clear photographic point of view, not experimental cursors or a loading sequence. One headline, one clear primary action, a short campaign folio and consistent portrait crops. |
| Nicobar's collection names fabric and cut alongside pieces [2](https://www.nicobar.com/collections/all-women). | Use familiar Indian shopping vocabulary. “Cotton” and “Rayon” are fabric entry points; “Anarkali”, “Straight” and “Long” are silhouette/length entry points. These are overlapping categories, not mutually exclusive product types. |
| Baymard's mobile product discovery and list research covers comparison, thumbnails, filtering and sorting [1](https://baymard.com/research/mcommerce-usability). Its product-page research studies variations, size guides and shipping/return information [3](https://baymard.com/research/product-page). | Keep control placement stable across categories. Use cropped listing portraits for comparison and a full-size, contain-fit image for closer inspection. Retain filter state in URLs. Put fit advice next to size selection, and delivery/returns within the product page. |
| Chernev, Böckenholt and Goodman's meta-analysis identifies complexity, decision difficulty, preference uncertainty and decision goals as moderators of choice overload [4](https://myscp.onlinelibrary.wiley.com/doi/10.1016/j.jcps.2014.08.002). | Do not assume “fewer choices” always means better. Give a shopper useful first cuts and reversible filters, then disclose detail on demand. Save a favourite without forcing a buying decision. |
| Baymard's checkout guidance emphasizes a predictable guest flow, early costs, fewer fields and resilient errors [2](https://baymard.com/blog/checkout-flow-ux-optimization). The FTC's [dark-patterns report](https://www.ftc.gov/reports/bringing-dark-patterns-light) is an ethical design reference, not an assertion of Indian legal compliance. | No account fork, upsell, preselected consent, surprise fee, urgency clock or fake social proof. An unknown fee is not ₹0. Require review of a backend-priced total before payment. Preserve form input on recoverable failures. |

## Accessibility, responsive layout and motion

- The [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) informed names, initial focus, Escape, containment and restoration. Search focuses its input; destructive device-data clearing initially focuses **Keep my data**.
- Visible labels, meaningful button names, keyboard-operable native controls, text as well as colour for availability, semantic landmarks, skip navigation and live feedback are shared, not hand-added to individual pages.
- A horizontal category rail suits a thumb better than six tiny compressed columns. The page itself never needs lateral scrolling. Collection results use 2/3/4-column breakpoints. The gallery changes placement, not image proportions. Marketing, supporting text and images retain meaningful reading order.
- Transitions are short, non-blocking and never necessary for navigation. The campaign is manual. [Reduced-motion guidance](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) informed the CSS opt-out.

## Technical findings

- Official [Next.js App Router documentation](https://nextjs.org/docs/app/getting-started/server-and-client-components): fetch and render near the data; keep browser APIs behind small client boundaries. Server pages delegate to shared read adapters and Server Actions. Metadata, responsive `Image`, art-directed `getImageProps` and local font optimisation are used without a third-party CDN dependency.
- Official [React external-store documentation](https://react.dev/reference/react/useSyncExternalStore): keep a stable server snapshot and immutable client snapshots. This avoids hydration mismatches while retaining immediate bag/wishlist updates.
- Official [TypeScript strict configuration](https://www.typescriptlang.org/tsconfig/#strict) and [Tailwind Next.js installation](https://tailwindcss.com/docs/installation/framework-guides/nextjs): strict types, discriminated results and the v4 PostCSS integration. Runtime validation supplements types at the network boundary.
- Google's [Web Vitals guidance](https://web.dev/articles/vitals) and [LCP optimisation guide](https://web.dev/articles/optimize-lcp): make the first hero image discoverable in initial HTML, use responsive sizes and priority rather than a CSS-background waterfall, reserve dimensions and avoid fetching every hidden campaign. Only measured production traffic can establish 75th-percentile LCP, INP and CLS.
- [Google Search Central's ecommerce navigation guidance](https://developers.google.com/search/docs/specialty/ecommerce/help-google-understand-your-ecommerce-site-structure) favours navigable links. Its [Product structured data guidance](https://developers.google.com/search/docs/appearance/structured-data/product) distinguishes actual offers from editorial content. Accordingly, canonical catalogue pages, breadcrumb data and a sitemap connect visible products; campaign photos do not generate merchant offers or ratings.

## Implementation sequence

1. Local typography, colour/spacing system, original campaign art, responsive shell.
2. Category directory, published-data contracts, discovery controls, gallery and purchase components.
3. Versioned device store, authoritative totals and fail-closed payment/tracking contracts.
4. Care content, optional subscription and contact capabilities, metadata and route behaviour.
5. Production browser matrix, interaction and accessibility checks, same-size visual comparison and adjustments.
