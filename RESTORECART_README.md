# RestoreCart

Reconstruct a source-backed product catalog, open a temporary pickup shop, accept PayPal sandbox purchases and export the records for recovery.

This module runs separately from the existing ScrapDrop app. It uses its own database and account sessions; existing ScrapDrop records are retained. This is a single configured merchant prototype, not a platform that onboards independent PayPal sellers.

## Start locally

Requires Node 24 or later and the repository's installed dependencies.

```sh
npm ci --include=dev
npm run dev:restorecart
```

Open [RestoreCart locally](http://127.0.0.1:4370/restorecart).

Demo buyer/seller usernames, emails, passwords and seed instructions are listed at the top of [README.md](README.md#restorecart-demo-accounts-local-practice). Run `npm run restorecart:demo-accounts` once for a new local database. Register private accounts through the UI for hosted use. The configured legacy workspace owner still uses RESTORECART_SELLER_EMAIL / RESTORECART_SELLER_PASSWORD; new seller registrations have isolated workspaces and use the single configured sandbox merchant for checkout.

## Buyer and seller entry points

| Page | Audience and access |
| --- | --- |
| `/restorecart` | Public entry: choose shopping or selling |
| `/restorecart/shops` | Public product discovery across published shops; no sign-in required |
| `/s/:slug` | Buyer storefront: choose quantities, buy now or explicitly Add to basket |
| `/restorecart/basket` | Global basket with seller groups, quantity editing, removal and checkout |
| `/restorecart/account` | Buyer registration/sign-in and purchase history; sign-in redirects to products |
| `/restorecart/seller/sign-in` | Seller registration/sign-in |
| `/restorecart/seller` | Seller workspace: uploads, drafts, publication and order management |

The directory and storefront do not fetch private seller drafts, evidence or order lists, even when previewed in a browser with an active seller session. Seller API mutations still require authenticated seller permissions; navigating to a seller URL does not grant them. Unpublished changes remain private until publication. A receipt returns its buyer to that shop, not the seller dashboard.

## Seller workspace

The seller sees three sections: **Shop editor**, **Orders**, and **Recovery**. The seller header has no buyer-marketplace link. Own-shop previews and publication live in the editor toolbar.

1. Create/select a shop. In **Shop editor**, upload records or choose **Use sample files**, then explicitly select **Import with Gemini**. This sends the selected shop's source records/images to Gemini. Column matching stays hidden unless no products could be identified from an unrecognized spreadsheet.
2. Review the single product list. **Review with Gemini** returns source-backed suggestions and targeted questions. **Use suggestion in draft** only fills a field; it never publishes or confirms physical stock. Unsupported suggestions are withheld rather than applied.
3. Confirm each included product's identity/photo/price, actual physical units counted and units set aside. Explain conflicting prices using source evidence, then **Save product**. Product details and stock confirmation save together atomically. Manual additions use the same form; there is no duplicate full-catalog editor.
4. Enter contact, pickup and opening details manually, then **Save shop details**. **Preview saved draft** opens a non-purchasable own-shop preview. **Publish shop / Publish changes** updates the public version; **View published shop** opens that exact shop. Unpublished edits remain private.
5. **Orders** provides payment/pickup filters, verified status checks and human-operated fulfillment/refund/restock actions. **Explain with Gemini** explains the recorded facts; it cannot change payment status or initiate refunds. Explicit human controls call the existing PayPal verification/refund APIs.
6. **Recovery** guides stopping new orders, resolving payment/refund outcomes and **Download sales report**. The optional original-store file comparison remains collapsed and supports only the documented local Original Store JSON v1 adapter.
7. The editor's **Shop backup** menu offers **Download shop backup**, **Restore shop backup** and optional practice restoration. Backups retain versioning/integrity checks, exclude orders/sessions/payment credentials, and restore an unpublished draft with zero allocated stock. There is no separate Rescue kit navigation page.

The complete E2E campaign and the final three-minute demonstration flow will be prepared separately after this implementation is reviewed.

## Source uploads

- CSV fields: `sku,name,price,currency,stock,description`. Required for automatic explicit mapping: SKU and name. Price/currency must be resolved before publication.
- Quoted CSV fields and rearranged headers are supported. For different column names, expand the file under **Make your spreadsheet readable**, map SKU/name/price/currency/stock/description, optionally record the source date, then reconstruct again. Original source bytes remain unchanged. Source dates do not become physical stock counts.
- Text PDFs are parsed for source inspection. Fixture/off mode only reconstructs explicit lines in the format `SKU | Name | 20.00 | USD`; general prose requires live Gemini or manual entry.
- JPEG/PNG can be used as product images and live Gemini evidence. Scanned PDFs with little extractable text are sent as PDF input only in live mode. Vision results remain unconfirmed until the seller checks them.
- Limits: 10 sources, 5 MB per source, 20 MB total, 10 PDF pages, 500 CSV product rows, 50 variants, 20-megapixel images.
- Sources stay private. Only an image explicitly selected for a published product is publicly served. Illustrative sample art is labeled and does not replace an uploaded product photograph.

## AI control

Gemini is now persistently enabled (`ai.mode: "live"`) in `restorecart.config.json`. It remains on after tests/restarts unless explicitly changed. Existing request budgets, cached answers and provider quotas still apply. Only explicit import/review/explanation actions call Gemini; navigation, preview, arithmetic and publication do not. Routine tests force fixtures and never turn off the saved live setting.

RestoreCart's AI switch is in **restorecart.config.json**, separate from ScrapDrop's older AI_MODE environment flag:

```sh
npm run restorecart:ai:on       # live Gemini on the next deliberate reconstruction
npm run restorecart:ai:off      # explicit import / manual entry; no model calls
npm run restorecart:ai:fixture  # deterministic practice; no model calls
```

The switch itself makes no model request. Set GEMINI_API_KEY and GEMINI_MODEL privately in .env for live use. The existing configured model was verified by the live check; do not paste its key into source code or chat.

Live reconstruction uses bounded function calls, validates evidence and returns source conflicts. Cached repeats do not call Gemini. Prices, stock arithmetic, checkout, navigation and exports never use a model. Changing instructions/model/schema/source hashes invalidates the relevant cache. Restart the server after changing RECONSTRUCTION_AGENT.md or server code.

Routine tests use fixtures and block actual Gemini fetches. A separate deliberate check uses owned example sources and restores the previous mode even if the check fails:

```sh
npm run test:restorecart:live-ai
```

## PayPal configuration

The existing .env app client ID/secret and optional PAYPAL_MERCHANT_ID are reused. App credentials belong on the server. Buyer/merchant account passwords are not app API credentials and must not be copied into browser-facing configuration.

This implementation always calls PayPal's sandbox host and rejects a non-sandbox PAYPAL_ENV. It does not provide a simulated paid-order endpoint. Injected payment providers exist only in automated test code.

The server creates an order from its immutable price snapshot, redirects to PayPal for buyer approval, captures server-side and checks amount, currency, order reference and merchant. Unknown payment outcomes hold stock and use reconciliation rather than a second charge.

For a hosted instance, register this listener against the same sandbox REST app:

```text
https://YOUR-RESTORECART-HOST/api/paypal/webhook
```

Subscribe to:

- CHECKOUT.ORDER.APPROVED
- PAYMENT.CAPTURE.COMPLETED
- PAYMENT.CAPTURE.PENDING
- PAYMENT.CAPTURE.DENIED
- PAYMENT.CAPTURE.REFUNDED
- PAYMENT.CAPTURE.REVERSED

Set PAYPAL_WEBHOOK_ID to that registration's ID in both the host configuration and local .env as appropriate. A webhook registered to the old deployment does not deliver to this local server. The receiving path verifies signatures before queuing durable work. Invalid signatures cannot mutate orders.

Local return-page/API reconciliation can verify a sandbox capture without a publicly reachable webhook. That does **not** establish that hosted webhook delivery has been tested. Keep the two verification claims separate.

## Hosting configuration

Build: `npm ci --include=dev && npm run build`

Start: `npm run start:restorecart`

Required hosted settings:

| Setting | Value / purpose |
| --- | --- |
| NODE_ENV | production |
| PORT | host-supplied listening port |
| RESTORECART_BASE_URL | public HTTPS origin, with no trailing slash |
| RESTORECART_DB_PATH | database file on a persistent disk |
| RESTORECART_SELLER_EMAIL | configured seller login |
| RESTORECART_SELLER_PASSWORD | private strong hosted seller password |
| PAYPAL_ENV | sandbox |
| PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET | existing sandbox app credentials |
| PAYPAL_WEBHOOK_ID | registration for this hosted listener |
| GEMINI_API_KEY / GEMINI_MODEL | if live AI is enabled |

Use a single instance for the SQLite prototype. Sources are stored in the same private database. Ephemeral hosting storage loses records on restart; configure persistent storage before claiming continuity. A production service still needs independent backups, monitoring, licensed dependencies and business/legal configuration.

No automatic deployment, repository rename or replacement of the current hosted ScrapDrop site is performed by this implementation.

## Recovery contract and limitations

Recovery downloads are versioned, consistent snapshots with hashes. They contain paid orders, product lines, remaining emergency allocation and financial adjustments. Repeated download has no side effects. A later adjustment requires a new snapshot; earlier exports remain unchanged.

There is no Shopify/WooCommerce connector in this release. The tested **Original Store JSON v1** adapter applies order/refund/fulfillment and inventory-event changes atomically to a durable local destination, with repeat-safe references, stale-file checks and an updated download. It does not call an external ecommerce API. Preserve its emergency order and inventory event history in subsequent exports. See [the continuity contract](docs/restorecart/CONTINUITY_IMPLEMENTATION.md). Emergency allocation is separate from the original store's total stock; keep reserved physical units out of other sales channels.

Other explicit boundaries: one merchant, USD, local pickup, no shipping integration, no tax calculation, no arbitrary website scraping, no automatic traffic redirection, no automatic customer messages. Judge access and test materials must remain available without a real charge.

## Verification

```sh
npm run test:restorecart
npm test
npm run build
```

See [build and test report](docs/restorecart/BUILD_REPORT.md), [implementation proposal](docs/restorecart/IMPLEMENTATION_PLAN.md) and [scenario plan](docs/restorecart/SCENARIO_CASES.md). Test fixtures are distinct from actual Gemini and PayPal sandbox evidence.
