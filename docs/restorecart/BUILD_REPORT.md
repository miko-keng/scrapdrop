# RestoreCart — implementation and verification report

Updated 29 October 2026. Implementation remains local in the existing ScrapDrop repository, with separate RestoreCart routes, sessions and database.

## Implemented

- Private CSV/PDF/JPEG/PNG uploads with format and size checks; explicit CSV/PDF parsing and manual product entry.
- Gemini function-call reconstruction with source evidence, strict runtime validation, bounded repair, caching and a configuration switch. Seller decisions remain separate from proposals.
- Product/price conflict review, seller-confirmed emergency allocations, published catalog revisions, public shop links and QR codes.
- Server-priced PayPal sandbox checkout, stock holds, canonical capture verification, payment reconciliation, verified-webhook inbox and durable retry scheduling.
- Pickup readiness/collection, full sandbox refund, explicit idempotent physical restock, shop closure and immutable recovery JSON/CSV exports.
- Responsive layouts, reduced-motion support, evidence-dialog keyboard controls and an explicit 390-pixel test harness.
- Setup, practice and hosting instructions in ../../RESTORECART_README.md.

## Automated verification

29 October: `npm run test:restorecart` — **39 passed, 0 failed, 0 skipped**. No actual Gemini generation is used in these tests. Payment responses are injected test fixtures.

27 October full regression: **148 tests, 143 passed, 0 failed, 5 pre-existing optional checks skipped**. Type checking and production build passed. The existing legacy manufacturing/vendor bundles still produce a large-chunk build warning; RestoreCart is loaded as its own lazy client module.

Cases include source conflicts, PDF parsing, duplicate uploads, unsupported files, SKU separation, AI evidence rejection/repair/cache, publication validation, stale catalog revisions, stock contention, private receipts, CSRF, payment mismatch, lost capture response, pending payments, refund/restock separation, abandoned buyer return, duplicate/out-of-order event processing, durable retry backoff and recovery consistency.

## Actual provider verification

### Gemini — 27 October

The configured Gemini model reconstructed the owned example into three variants and retained both $18 and $20 blue-mug price candidates. The successful run used one generate-content request; its repeated reconstruction came from cache. Earlier rejected schema/tool-loop attempts were diagnosed and corrected before this successful check. This is a sample verification, not an accuracy benchmark for arbitrary seller catalogs.

Evidence: ../../tests/evidence/restorecart-live-ai.json. AI mode was restored to fixture afterward. No new Gemini request was made during the 29 October continuation.

### PayPal sandbox — 27 October

Browser testing completed a $52 USD purchase of two blue mugs and one tote, and a separate $18 USD purchase of a red mug. Both have canonical captured records. The $52 order was marked collected. The separate $18 order was fully refunded through PayPal sandbox, then explicitly restocked. No real-money payments were made.

The receipt survived reload and seller sessions/order history survived application restarts. A React development-mode receipt-refresh race found during browser testing was corrected.

### Recovery — 29 October

Recovery was verified against a database copy containing those actual sandbox records. Closing and generating the package reconciled:

- Two captured orders: $70.00 USD total.
- Financial adjustments: $18.00 USD.
- Net sandbox captured amount: $52.00 USD.
- Remaining emergency allocation: blue mugs 1, red mugs 2, totes 1.
- One recorded adjustment; repeat export reused the immutable snapshot.

The source practice database was not closed or changed by this recovery test. Evidence: ../../tests/evidence/restorecart-recovery-check.json.

## Explicit outstanding verification and scope limits

- Hosted HTTPS webhook delivery has not been verified for the new local service. The existing webhook registration points to a different deployment. A new hosted listener and corresponding webhook ID must be configured and tested before claiming end-to-end hosted webhook delivery.
- The 390-pixel browser harness exists, but its visual/interaction campaign was not completed. Physical mobile-device testing, broader keyboard/accessibility trials and novice-user trials remain outstanding.
- Live Gemini was verified on text-based example sources. Image/scanned-PDF interpretation needs a separate deliberate live variation check; do not claim broad vision accuracy from the text-source run.
- CSV import recognizes the documented headers; a general visual column-mapping interface is not implemented.
- Recovery is an export, not an automatic Shopify/WooCommerce import. No external-store test adapter or real connector was implemented.
- The prototype supports one configured merchant, USD and pickup only. It does not calculate taxes, ship goods, redirect an unavailable domain, onboard unrelated PayPal sellers or operate without internet/PayPal availability.
- No GitHub push, repository rename or deployment of RestoreCart has been performed.

Preserve existing paid records when practicing; create a new rescue shop rather than deleting payment history.

## Buyer and seller separation — 29 October 2026

Implemented a role chooser at `/restorecart`, a public searchable directory at `/restorecart/shops`, and a dedicated authenticated workspace at `/restorecart/seller` (sign-in at `/restorecart/seller/sign-in`). Storefront preview links open a separate tab. Receipt navigation returns to the order's shop. Buyers do not fetch seller workspace data; public session responses exclude seller setup, practice credentials and AI configuration. Public directory records come exclusively from live published snapshots, so draft edits and unpublished shops stay private. Existing seller API authorization remains enforced on the server.

Verification:

- RestoreCart automated tests: 44 passed, including five new public-session, directory, publication-boundary, unauthorized-access and receipt-navigation cases.
- Full regression suite: 153 tests; 148 passed, 5 existing optional tests skipped, zero failures.
- Production build passed. Existing large-chunk warnings remain in the other application's production modules.
- Browser: role chooser, anonymous directory, no-match search and clear, public shop without management controls, direct seller-route sign-in, local practice login, authenticated workspace, separate-tab preview target, public buyer view while the seller remains signed in, and sign-out returning to sign-in without private controls verified.
- No new live Gemini or PayPal transaction calls were used. This change is local; it has not been deployed.

## Product discovery fix — 29 October 2026

The shop directory previously searched only the shop name and one preview product. It now receives a narrow public projection of every published product (name, description, SKU, price, currency, image, stock availability and inferred categories). No private sources or draft fields are included. Shop cards describe their published collection and list product categories; category labels use local keyword rules with a General goods fallback. This is not a Gemini classification call.

Keyword search checks all published products, matches case-insensitive words/prefixes and common plurals, and recognizes tote/tote bag. Results show product name, price, shop, description and category, followed by related shops. Links scroll directly to the matching storefront product. Sold-out products remain clearly labeled. No cross-shop cart or checkout behavior changed.

Validation: 47 RestoreCart tests passed; typecheck and production build passed. Browser checks confirmed the directory description/categories, tote and tote bag returning Natural tote ($12, Sunday Studio), mugs returning both $20 blue and $18 red mugs, and a product result opening/scanning to the correct storefront item. Automated tests also cover multiple shops, food categories, sold-out products, no matches and unpublished-data isolation. No live AI or PayPal calls were needed.

## Product-only browsing — 29 October 2026

Replaced the shop/related-shop directory cards with products throughout. Merchant identity is a prominent separate shop link on each card. Added Best match, numeric price ascending/descending and name sorting, category and in-stock filters, compact discovery controls and URL persistence. Research and proposed differentiation are in COMPETITOR_RESEARCH.md; those future features were not implemented by this interface change.

Validation: 49 RestoreCart tests passed; typecheck and production build passed. Browser checks verified $12/$18/$20 ascending and descending ordering, combined category/stock/search filtering, empty-state reset and persistence after reload. No new live AI or PayPal transaction calls were used.


## Five-step continuity release — 29 October 2026

Implemented mapped imports/readiness, targeted answers/photo confirmation, physical count timestamps, local Original Store JSON v1 reconciliation with durable duplicate prevention, portable versioned kits/isolated rehearsal and published contact/announcement drafts. See CONTINUITY_IMPLEMENTATION.md and CONTINUITY_E2E_REPORT.md for the contract, results and limits. The prior “no visual column mapping” limitation is superseded by this release; external-store connectors remain unimplemented.

Final tests: 57 RestoreCart passed; full suite 161 passed / 5 existing optional skips / 0 failures. Build passed. One actual Gemini generation passed the owned visual smoke check, with zero calls on cached repeat, and fixture mode was restored. Browser tests used a database snapshot and preserved the main practice shop.
