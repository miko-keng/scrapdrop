# RestoreCart verification — 29 October 2026

## Result

All executed automated tests passed. The browser scenarios below also passed after one price-entry usability fix. Acceptance scenarios were executed by the coding agent, not by independent merchants.

| Layer | Current result |
| --- | --- |
| RestoreCart unit/component suite | 38 passed, 0 failed |
| RestoreCart HTTP integration suite | 24 passed, 0 failed |
| Complete repository regression, after the fix | 171 discovered: 166 passed, 5 optional skips, 0 failed |
| Typecheck and production build | Passed (`npm run build` includes TypeScript checking) |
| Browser E2E / agent acceptance | Passed for the scenarios listed below |

The 62 RestoreCart tests are a subset of the full repository suite; these figures must not be added together. The component group includes a durable database restart test. The five optional skips belong to older live checkout / legacy HTTP suites and are visible in the saved regression log. No RestoreCart test was skipped.

## Isolation and provider boundaries

Browser mutations used a consistent SQLite backup at `/tmp/restorecart-acceptance-20261029.sqlite`, served on port 4372. The source installation on port 4370 was not used for test stock/order mutations. Final read-only check: Sunday Studio remains live with its original two orders.

Routine reconstruction used fixture mode: zero new Gemini requests in this campaign. The preceding narrowly scoped live Gemini smoke check is recorded separately in CONTINUITY_E2E_REPORT.md and tests/evidence/restorecart-continuity-live.json; it is not counted as a newly executed live check here.

HTTP integration executes actual application routes, SQLite persistence and payment/reconciliation logic using an injected deterministic PayPal transport. Browser return scenarios use copies of historical sandbox transactions. No new PayPal checkout, charge, refund or hosted webhook delivery was performed in this campaign.

## Agent acceptance and browser E2E scenarios

| Scenario | Expected / observed result |
| --- | --- |
| Create fresh practice shop, load CSV/PDF, upload owned variant image | Three separate SKUs reconstructed; blue mug retained $18/$20 conflict and suggested exact-SKU photo |
| Confirm price and photo | Seller note and explicit confirmation required; blue mug became Ready after physical count |
| Reserve more than physical count | Count 1 / allocation 3 rejected; no invalid allocation saved |
| Confirm separate physical counts | Blue count 6 / reserve 2; red count 5 / reserve 2; timestamps and sellable quantities displayed |
| Publish with unresolved included tote | Publication rejected with targeted recovery/count message |
| Exclude uncertain tote | Readiness became 2 Ready / 0 Need information / 1 Excluded |
| Publish confirmed subset | Buyer saw only blue $20 and red $18, two units each; tote absent |
| Public shop and contact announcement | Pickup, contact, hours and outage status visible; announcement copied without being sent |
| Change contact draft without republishing | Buyer reload retained published status; unpublished draft did not appear |
| Versioned rescue kit | Version 1 saved, owned image/source included; unchanged save reused version 1 |
| Portable kit download | Actual UI download completed; fresh-install import separately verified by HTTP integration |
| Isolated rehearsal | Restored unpublished draft; allocations/counts/confirmations reset; image/source evidence retained; no copied orders |
| Rehearsal return and publication block | Two first-run changes, zero repeat changes; publishing disabled, payments disabled, Orders empty |
| Whole-number price after fix | Entering `20` accepted and persisted through product-answer route as `20.00` |
| Close copied historical shop and compare return | $70 captured / $18 refunded / $52 net; six changes; inventory blue 6, red 5, tote 3 |
| Apply and repeat return | Two orders returned once; repeat comparison zero changes, two already recorded |
| Reload and resume return | Saved local destination automatically resumed; repeated comparison still zero changes |
| Missing destination SKUs | Conflict explanations displayed; Apply disabled |
| Buyer search and combined filters | `mugs` + Home & kitchen + in-stock + ascending price returned red $18 before blue $20, with clear shop attribution |
| Unknown search term | Zero results and clear-filters control, no irrelevant related shops |
| Responsive seller view | At 390px viewport document width 375px: no horizontal overflow |

The in-app browser stalled temporarily around the native close-shop confirmation and required a new verification tab. The copied shop was confirmed closed before the return tests continued; no direct database mutation was used to bypass that step. Download automation also had substantial latency. These were recorded as automation interruptions rather than ignored test failures.

## Additional automated coverage

- Flexible column mapping, invalid/duplicate headers, original source preservation, reported source dates distinct from physically counted inventory.
- Stale counts, changed allocation invalidating confirmation, insufficient count, exact current variant photo confirmation, exclusions and unresolved price conflicts.
- New contradictory source evidence reopening a previously confirmed answer.
- Auth, CSRF, private source/receipt isolation, seller/buyer separation, published snapshots versus draft changes.
- Cart quantities/totals, concurrent last-unit purchases, immutable paid orders, one-use pickup, refunds distinct from explicit restocking.
- Pending payment and pending refund block both final export and new return comparison.
- Return previews detect missing/insufficient stock, stale original-store revisions, changed source state, conflicting refund history and lost inventory-event history; rejected applications leave destination unchanged.
- Same preview retry is safe, two competing previews cannot deduct stock twice, later refunds generate only their new delta, journal survives database restart.
- Kit content versioning, source/image integrity and tamper checks, import, operational restore, isolated rehearsal and no copied payment records.
- NEW: portable kit imported into a fresh separate installation preserves image bytes/hash and remaps source references, while zeroing allocations/confirmation and blocking premature publication.
- NEW: two independently created return previews competing for the same destination produce one success and one conflict; one order and one inventory deduction remain.

## Fix found and verified

The targeted price form required two decimal places and rejected `20` through browser validation. It now accepts whole numbers or one/two decimal places, advertises decimal input, and normalizes the submitted amount to two decimals. Verified in the actual browser with `20`; complete regression/typecheck/build were rerun afterward. Server-side monetary validation remains in place.

## Reproduce automated tiers

```sh
NODE_ENV=test node --import tsx --test tests/restorecart-directory.test.ts tests/restorecart.test.ts tests/restorecart-continuity.test.ts
NODE_ENV=test node --import tsx --test tests/restorecart-http.test.ts
npm test
npm run build
```

## Evidence

Fresh logs and screenshots live in `tests/evidence/restorecart-verification-*`. Screenshots cover the buyer subset, isolated rehearsal, zero-duplicate return and mobile seller view.

## Remaining validation limits

The destination adapter updates local Original Store JSON v1. It does not write to Shopify/WooCommerce. This campaign does not establish hosted HTTPS webhook delivery, arbitrary merchant-photo interpretation, independent merchant usability acceptance, or physical mobile-device behavior. No deployment or GitHub push was performed. Existing large-chunk warnings in legacy manufacturing analytics remain; production build passes.
