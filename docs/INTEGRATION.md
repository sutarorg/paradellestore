# Public storefront integration

The private Stage 2 interface and its Stage 3 service contract are documented separately in [the merchant studio handoff](admin/README.md).

## Configuration

Start with `.env.example`. `STOREFRONT_API_URL` is a **server-only** base URL including the API version prefix. Leave it unset in Stage 1. Use a trusted HTTPS API in production. `PRODUCT_IMAGE_HOST` is the exact hostname of the merchant's HTTPS image origin; same-origin media paths also work. `SITE_ORIGIN` defaults to `https://paradelle.store`. Configure these for the build and runtime. Rebuild for image-origin or canonical-origin changes. Run a Next-capable deployment with image optimisation; this application is not a static HTML export.

No browser code contacts `localhost`, a separate API host or the Razorpay SDK. Customer requests use same-origin Server Actions. The browser leaves the site for a validated, **backend-issued hosted prepaid payment URL** only after the shopper reviews a quote. The isolated Arena preview allows its specific action origin; production normally needs no extra allowed origin.

## Stages and ownership

**Stage 2 — merchant administration:** publish real products, assign stable slugs and variant identifiers, manage stock, supply descriptive images, product-specific fit charts, material/care information, delivery and return conditions. Only mark an arrival or bestseller when merchant data supports the designation. Verify review provenance before publishing it. Manage capability switches, legal information, service contacts, shipping amounts, supported methods and policy sections in `settingsSchema`. Do not enable a service before its configuration works.

**Stage 3 — trusted services:** own stock and price validation, serviceability, tax/charges, any promotion, quotes, payment-session creation, signature/webhook verification, reconciliation, real order records, fulfilment updates, tracking rate limiting, contact delivery and marketing consent/unsubscribe. The frontend is not an authorisation boundary. Rate-limit its public actions at the service/edge; never rely on hidden controls or a localStorage flag.

## HTTP contracts

The source of truth is [`lib/contracts.ts`](../lib/contracts.ts). Responses are JSON, validated before display. The gateway strips non-contract properties and never forwards raw backend errors into the UI. Prices and shipping fees are integers in **paise**, not rupees. Nullable shipping is **unknown**, not free. The amount in the payment session must exactly match the reviewed quote.

| Method and path relative to API base | Input → successful response |
|---|---|
| `GET settings` | `settingsSchema`. Optional fields are omitted when not supplied. Capabilities default **off**. |
| `GET catalogue` | `catalogueSchema`: a public `products` array. An actual empty array is valid. Never include internal/customer-only data. Only `published` products and verified native purchase reviews are rendered as customer feedback. Optional `sourceReviews` (at most ten, explicitly approved and permission-granted) are shown separately on the PDP, never as PARADELLE purchases. Optional `seoTitle`/`seoDescription` override PDP metadata when supplied. Registry-backed flags, not a client guess, control the homepage shelves. |
| `POST checkout/quote` | `{ lines: [{slug, variantId, quantity}], address: {fullName, mobile, address, city, state, pin}, email?: string, termsAccepted: true }` → `quoteSchema`: opaque quote ID, INR currency, subtotal, shipping, discount, total, delivery information and expiry. Optional contact email is not saved with the device address and is not a marketing opt-in. Reject unserviceable locations, changed variants or insufficient stock rather than charging a different order. |
| `POST checkout/session` | `{ quoteId }` → `paymentSessionSchema`: matching quote ID and a hosted HTTPS Razorpay payment URL. Validate quote ownership/capability, terms, expiry and immutable total. Make this operation idempotent. Never accept a browser price, or introduce a further charge after review. |
| `POST payments/receipt` | `{ receipt }` → `receiptSchema` **only after verified capture**. Return order reference, quote ID, charged total, purchased lines and delivery information. A provider redirect or client-reported success is not evidence of payment. |
| `POST orders/track` | `{ mobile }`, normalised to 10 Indian digits → `trackingSchema`, limited order summaries. A matched record contains a reference, public status, product names and latest update; carrier and HTTPS tracking URL are optional. No match: `{ "orders": [] }` or 404. |
| `POST newsletter` | `{ email, consent: true }` → `{ subscribed: true }` only after actual subscription. Provide consent recording and unsubscribe handling. |
| `POST contact` | `{ email, message }` → `{ received: true }` only after actual receipt. |

Public reads use a short revalidation window (60 seconds) and request deduplication. Personal lookups and all POSTs use `no-store` and a bounded timeout. A malformed response, timeout, 5xx or unavailable service cannot become a successful payment, registration or order. 409/410 invalidates the checkout attempt; 429 asks the shopper to wait; tracking distinguishes a true no-match from an outage. See `lib/gateway.ts` and `lib/actions.ts`.

The current catalogue adapter suits a curated assortment: it fetches the public snapshot on the server, applies deterministic filtering/sorting there, and renders **12 results per page**. It does not ship the whole catalogue to a shopper's browser. If the catalogue outgrows a cached snapshot, put indexed querying and facet aggregates behind that adapter while preserving URLs, page sizes and the view models. Supported URL fields: `category`, `edit`, `q`, `sort`, `min`, `max`, repeated `fabric/size/style/colour/availability/occasion`, and `page`. Filter prices in URLs are rupees. Different facets combine with AND; selections within a facet combine with OR. Size matching requires available stock.

## Payment and privacy boundary

1. The browser bag is an intention to buy, not a reservation. Reconcile stored IDs with current published catalogue records. Reject deleted variants and quantities above stock.
2. Collect a delivery address only when checkout is enabled. Quote on the server, display its final breakdown and delivery note, then request a prepaid session only on explicit payment action.
3. Stage 3 generates and verifies the Razorpay payment/order independently, handles retries and webhooks, and produces an unguessable, time-limited receipt capability. Persist the actual order **on the backend**. Redirect to `/order-success?receipt=…`. Use 24–192 URL-safe alphanumeric/underscore/hyphen characters for the capability. Do not log receipt or tracking secrets.
4. The receipt page ignores `paid`, `success` and similar query flags. It verifies with the server and requires both `verified: true` and `paymentStatus: "captured"`. Otherwise it offers tracking rather than suggesting another immediate payment.
5. The browser stores neither the payment URL nor the receipt nor raw quote ID. A one-way quote digest and the bag fingerprint allow clearing just the unchanged bag associated with a confirmed checkout. Later shopping is not erased by an older receipt. If persistent storage or hashing is unavailable, the bag is not automatically cleared on another visit.
6. Tracking uses a mobile number **without OTP or customer login**. Enforce strict rate limits, small response limits and data minimisation on the backend. Never return addresses, phone numbers, emails, receipt capabilities or payment identifiers. Provide only shopper-safe product/status text. The server adapter masks references before they reach the browser.

## Local storage

`paradelle:shopping:v1` holds only cart references/quantities, wishlist IDs, up to 12 recently viewed IDs, preferred sort, optional address and checkout reconciliation data. Data is sanitised on read; unsupported/corrupt values are discarded. Local persistence is convenience, not secure authentication. Address storage is explicitly optional, expires after 30 days and can be cleared in checkout or privacy settings. No cross-device synchronisation is claimed. No payment fields, order history, OTPs or card credentials are stored.

## Launch gates

Supply real catalogue media and variants; approve merchant identity, support channels, legal policies, shipping fees/serviceability and tax presentation; configure the canonical domain and TLS; enable Razorpay prepaid methods and backend verification; connect tracking and optional consent-based messaging. Run the published-product test and authorised provider sandbox end-to-end tests before opening sales. Review policy copy with the actual merchant. Monitor deployed Core Web Vitals and real-device accessibility rather than treating a local lab reading as a production guarantee.
