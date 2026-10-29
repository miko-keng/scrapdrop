# Simplified seller workspace — 29 October 2026

## Delivered

Five sections were replaced by Shop editor, Orders and Recovery. Seller navigation no longer exposes the buyer marketplace. The editor toolbar previews the saved draft without checkout, opens the seller's exact published shop, and publishes confirmed changes. Preview supports Escape, keyboard focus containment and reduced-motion preferences inherited from the application.

Import reads CSV/PDF/images through the existing evidence-validated Gemini reconstruction pipeline. Mapping is hidden in the normal flow and exposed only for unrecognized spreadsheets when no products were prepared. The old unsaved-catalog dependency no longer disables the mapping form. Product details, price/photo confirmation and physical stock confirmation live in one form per product; a new transaction saves these together, checks revision/stock commitments/source ownership, and supports deliberate manual additions without inserting blank default products.

Review with Gemini supplies source-backed draft suggestions and targeted questions. Human selection fills a field only. Unsupported suggestions are withheld and clarification is requested; unknown product/source references cannot become catalog changes. Review does not certify stock. Shop contact, pickup, hours and customer status remain manually entered. All save/publication/auth/CSRF boundaries are retained.

Orders has filters for payment checking, preparation, ready pickup, collected and canceled/refunded. Gemini payment explanations use recorded provider-verified facts, display those facts separately and cannot change status or initiate actions. Check PayPal again, fulfillment, full refunds and explicit physical restock remain human-controlled operations. A refund requires an explicit checkbox. Financial outcome and physical stock return remain distinct.

Recovery guides stopping orders, checking unresolved payment/refund outcomes and downloading a readable CSV report. Unpublished drafts cannot be accidentally closed through this UI. The report derives order, item, financial-total and stock rows from the immutable recovery archive and retains formula escaping. Optional original-store file reconciliation is collapsed. No external Shopify/WooCommerce destination is connected.

The separate Rescue kit page was removed. Shop backup in the editor offers versioned download, operational restore and optional practice restore. Existing integrity checks, fresh-count requirements, private ownership, zero restored allocation and isolation from payments/orders are preserved.

## Gemini setting and boundaries

`restorecart.config.json` now permanently saves `ai.mode: live`. Restarting or completing routine tests does not switch it off. Explicit import, review or explanation actions call Gemini; navigation, arithmetic, preview and publication do not. Review/explanation answers are cached. The existing process request budget (6 calls, shared with reconstruction), per-run limits and upstream quotas still apply; persistent enablement is not unlimited usage. Secrets remain in the existing private environment file.

Routine tests force fixture mode unless a deliberately injected model transport is supplied. They did not send requests to Gemini. The single product editor endpoint and all AI assistance routes enforce seller ownership and CSRF protection.

## Verification performed now

75 RestoreCart unit/component/HTTP integration tests passed with zero skips/failures. Typecheck and production build passed. Legacy manufacturing bundle-size warnings remain.

New checks cover atomic product/count saving, invalid allocation rollback, duplicate manual SKUs, source-backed review, no catalog/payment mutation by assistance, private/cross-seller access, image byte/MIME handling, invented suggestions being withheld, cached repetition, contradictory paid explanations being rejected and the readable/private CSV export.

Bounded live debugging used only owned example records in an in-memory database: two initial structured-output HTTP 400 responses, one successful function-call response rejected for an unsupported citation, then a successful corrected review with three validated suggestions and one question. Its repeat was cached with no additional API call. No model-generated values were applied to any seller shop. Non-secret evidence is saved in tests/evidence/restorecart-seller-live-review.json. The function-call format follows the existing reconstruction implementation; structured-output reference consulted: https://ai.google.dev/gemini-api/docs/structured-output.

Visual inspection confirmed the three-section editor, removal of buyer navigation, hidden routine mapping, Orders filters and collapsed optional recovery controls. Narrow-layout measurement was 354 CSS pixels with document width 341: no horizontal overflow. Temporary viewport override was reset. Existing seller records, orders and selected shop were not modified during visual inspection. No PayPal transaction/refund was initiated.

## Explicitly pending

The requested full browser E2E campaign, end-to-end live AI/payment/fulfillment/recovery rehearsal, and final three-minute action/speech/input/file demonstration plan are intentionally deferred to the user's next request. This implementation report does not claim those have already passed. No deployment or GitHub push was performed. Local server remains on port 4370.
