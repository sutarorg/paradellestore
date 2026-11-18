# PARADELLE merchant studio · Stage 2

**Entry:** `/admin` · **Staff access:** `/admin/login` · **Flagship workflow:** `/admin/importer`

This is the private-facing frontend in the **same Next.js app** as the guest storefront. There is no second project, seeded database, demo mode or customer account system. Start it with the commands in the [repository guide](../../README.md).

**What you can do now:** navigate the entire workspace, edit a local listing, inspect image files before upload, validate source facts, plan a selling price, compare a draft listing and exercise confirmations. Local edits are not database records. With private services unset, staff sign-in, uploads, job submission, saves and publication cannot succeed. No numbers stand in for unknown business results.

**With a Stage 3 provider connected:** secure server-side reads populate the same components; an authorised command or queue receipt drives each success state. A missing/invalid cookie redirects protected routes to staff sign-in. A verified user without the required scope cannot read or write that resource. Never rely on hiding a navigation item for access control.

[Illustrated handoff](../PARADELLE-Stage-2.pdf) · [Pre-development research](RESEARCH.md) · [Provider contract](CONTRACT.md) · [OpenAPI 3.1](openapi.json) · [QA and screenshots](QA.md)

## Route and component map

| Route | Primary component | Scope of the screen |
|---|---|---|
| `/admin/login` | `Login` | Admin email/password, show/hide, recovery request, no signup. |
| `/admin` | `Overview`, `Sales`, `Period` | Six KPIs, real daily/weekly/monthly sales, orders with separate statuses, activity, four operational shortcuts. |
| `/admin/products` | `ProductsIndex` | Query-backed search, category/status filters, sort and pages; current-page selection, bulk transitions, per-record preview/edit/duplicate/visibility/archive/delete. |
| `/admin/products/new` | `ProductEditor` | Unsaved draft with store pricing defaults when available; six editor sections. |
| `/admin/products/[id]/edit` | `ProductEditor`, `ListingPreview` | Actual record and revision, photo order/main/alt, size-level SKUs and stock, checks before publication. `?view=preview` opens private preview without publishing. |
| `/admin/importer` | `ImportStudio`, `Tracker` | Eight steps; verified source evidence, editable copy, five individually approved square frames, permission-cleared reviews, pricing, approval and asynchronous status/retry. `?job=<id>&step=8` resumes a saved job. |
| `/admin/orders` | `OrdersIndex` | Search, order/payment/fulfilment filters, variant quantities and values. `?customerId=<opaque-id>` shows one customer's order history. |
| `/admin/orders/[id]` | `OrderDesk` | Restricted address/mobile, item images, payment reference and economics, manual purchase/tracking, refund request/status check, dated history. |
| `/admin/inventory` | `InventoryIndex` | Product total and variant stock, low/out alerts, projected adjustment result, mandatory reason and before/change/after history. |
| `/admin/customers` | `CustomersIndex` | Protected genuine purchase history, spend, mobile and last order. Text searches stay out of URLs and browser storage. |
| `/admin/reviews` | `ReviewsIndex` | Linked product, rating, provenance, verified-purchase status and moderation. Source feedback never acquires a PARADELLE purchase badge. |
| `/admin/analytics` | `Reports`, `Sales` | Gross/net sales, orders, AOV, contribution, return/refund rates, product units, category net sales and fulfilment counts. Charts render only from supplied values, with a data table. |
| `/admin/settings` | `Preferences` | Store identity/logo, contacts, pricing defaults, social links, policies, SEO and the current staff profile. Only the confirmed section is sent. |

## Structure

- `app/layout.tsx`: shared local fonts, HTML and body. `app/(store)/layout.tsx`: shopper navigation, main and footer. The route group did not change any public URL.
- `app/admin/layout.tsx`: dynamic rendering, private metadata and scoped styles. `app/admin/(desk)/layout.tsx`: session gate and `Shell`; loading, retry and not-found boundaries. `app/admin/login` stays outside the desk chrome.
- `components/admin/shell.tsx`, `workbench.tsx`: sidebar, mobile/tablet drawer, keyboard page finder, filters, tables, paging, form controls, confirmations, notifications and record states. A single native dialog primitive is shared with the storefront.
- `components/admin/product-fields.tsx`: listing, verified attributes, variants, local previews/private uploads, price calculator and the shared product preview. `private-image.tsx` deliberately bypasses public optimisation caches for private delivery URLs and blob previews.
- `lib/admin/models.ts`, `commands.ts`, `rules.ts`: Zod read/write schemas, typed commands, publication and fulfilment rules, bounded queries, INR arithmetic and grouped sales. `gateway.ts`, `actions.ts`: server-only transport, authorisation, no-store reads, restricted writes/uploads and queue acknowledgements.
- `public/admin/atelier.webp`: locally served, original AI-generated textile/block still life for the studio masthead and sign-in composition. It is **not** a product asset or generation result from a merchant job.
- `tests/admin*.{ts,mjs}`, `scripts/admin-contract.ts`: domain, browser, access-boundary and optional read-only staging checks; machine-readable contract generation.

## Integration boundary

Keep `PARADELLE_ADMIN_API_URL` empty for the disconnected workspace. Set it **on the server only** after the trusted same-application Stage 3 endpoints exist. `STOREFRONT_API_URL` is a different, public projection with no staff credentials. Live Supabase authentication/database/storage, rights-cleared ingestion, fal workers, Razorpay verification/refunds, and actual stock/order mutations are **not part of Stage 2**. The [contract](CONTRACT.md) specifies their required behaviour and release checks.
