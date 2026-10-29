# Continuity E2E results — 29 October 2026

## Result

57 RestoreCart tests passed. Final full suite: 166 tests, 161 passed, five existing optional tests skipped, no failures. Production build and typecheck passed. The existing large-chunk build warnings remain in legacy manufacturing modules.

One intermediate full-suite run failed the existing ScrapDrop two-process competition test with “Race child failed”. No unrelated source changes were made. Its isolated rerun and two subsequent full-suite runs passed. The failure is recorded rather than treated as a new verified fix.

## Browser campaign

Browser tests used a consistent snapshot of the existing database at /tmp/restorecart-continuity-browser.sqlite on port 4371. No existing source-shop payment was changed and no new live PayPal purchase/refund was made.

- Synthetic seller sign-in and a new practice shop.
- Actual CSV/PDF example upload plus a CSV with Code/Item label/Cost/Money/On hand/Notes headers.
- UI preview initially recognized zero rows from the unusual file, then recognized all three after column mapping. Reconstruction preserved the blue mug's $18/$20 conflict and separate variants.
- Confirmed the seller's $20 answer and note, then physically counted/reserved all three products. The UI reached 3 Ready / 0 Needs information.
- Saved contact, hours and outage message; published and verified them on the buyer storefront. Prepared/copied an announcement without sending it.
- Saved kit version 1; restored it as an isolated, unpublished rehearsal. Allocations and confirmations reset; the source live shop was unchanged.
- Ran the browser rehearsal: two first-run changes, zero repeat changes, no PayPal calls.
- On copied historical sandbox records, closed new checkouts, compared and applied the return: two orders, $70 captured, $18 refunded, $52 net. Resulting original-file inventory: blue mugs 6, red mugs 5, totes 3.
- Repeated comparison: 0 changes / 2 orders already recorded. Resumed the updated local destination after reload and confirmed zero changes again.
- Desktop and 390-pixel buyer/seller layout checks: no document-width overflow. A hidden file input initially caused overflow; CSS specificity was corrected and the fix verified after reload. The seller flow was reordered and competing allocation controls removed.

Screenshots: tests/evidence/restorecart-continuity-return.png and restorecart-continuity-mobile.png.

## Automated coverage beyond the browser walkthrough

New scenarios cover photo-source assignment, required stock counts, invalid/stale count edits, uncommon/duplicate mappings, contact publication privacy, payments/refunds/restock movement separation, later refund deltas, duplicate application, missing/insufficient destination stock, changed records after preview, dropped journal history, conflicting existing refund information and disk restart persistence. Kit coverage includes version reuse/change, included image bytes, tamper rejection, import, operational restoration, isolated restoration, blocked rehearsal publication and no copied sales. Every new route retains auth/CSRF tests. New source contradictions reopen a previously confirmed product.

Payment scenarios use the actual application HTTP endpoints and payment/reconciliation code with an injected deterministic PayPal API transport. They do not establish new live provider transactions. Browser recovery used copies of prior verified sandbox transactions.

## Actual Gemini check

One deliberately bounded live check used the owned sample CSV/PDF and an owned product-card screenshot. gemini-3.5-flash-lite produced three separate variants, matched the image to MUG-BLU and preserved both $18 and $20 candidates. One generation; the repeated reconstruction was cached with zero additional calls. Fixture mode was restored. Evidence: tests/evidence/restorecart-continuity-live.json.

This is a narrow synthetic visual smoke test, not a benchmark for arbitrary merchant photos or scanned documents.

## Remaining boundaries

The return adapter updates Original Store JSON v1 locally. No Shopify/WooCommerce destination was contacted. Hosted HTTPS webhook delivery, real merchant/novice trials, physical mobile hardware and broad vision accuracy remain unverified. No deployment or GitHub push was performed.
