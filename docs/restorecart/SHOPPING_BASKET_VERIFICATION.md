# Shopping flow and basket verification — 29 October 2026

## Changes

Buyer sign-in/registration goes directly to Explore products. The account page is a compact optional order-history page rather than a welcome screen. A global basket icon and live item count appear on buyer pages. Product cards support quick-add, and shop pages offer Add to basket directly below Checkout with PayPal.

Choosing quantities is a draft selection. Add to basket atomically increments the saved quantities without replacing other selected products; invalid multi-item additions fail without partial writes. A product URL preselects one unit of the viewed product. Immediate checkout purchases the current selection independently of the saved basket.

The global basket lists saved items grouped by seller, current unit prices, quantity selectors, removal, seller subtotals, pickup details and separate PayPal sandbox checkout per seller. Saving does not reserve stock. Stock availability uses the same current seller allocation as checkout. Unavailable saved lines remain visible with warnings and disable that seller's checkout. Public/guest baskets use the current session; signed-in baskets use the single buyer account across shops.

## Verification

- 69 RestoreCart tests passed, including stock limits, invalid SKUs, CSRF, foreign price-field rejection, incremental additions, atomic multi-item rollback, quantity editing, removal, private basket totals, changed stock and closed shops.
- A single buyer session maintains a basket across two independently registered sellers and sees unified purchase history.
- Full regression: 178 discovered, 173 passed, five existing optional skips, zero failures.
- Typecheck and production build passed; retained manufacturing bundle-size warnings remain.
- Browser E2E used a separate SQLite snapshot on port 4374. Quick-add changed the badge 1→2; changing red mug quantity changed total $38→$56; removing blue mug changed it to $36 and badge 2.
- Signing out hid the basket. Buyer sign-in returned directly to Explore products and restored the saved badge.
- Opening the blue mug product link preselected one unit. Add to basket below PayPal preserved two saved red mugs and added one blue: three items / $56. Refresh preserved quantities and totals.
- 390px viewport check: document width 375px, no horizontal overflow. Desktop/mobile screenshots saved under tests/evidence/restorecart-shopping-basket*.png; product actions saved separately.
- Main demo server restarted on port 4370. Browser tests did not click PayPal checkout or initiate new payments/refunds; no Gemini requests were made. Automated payment tests use deterministic injected transport.

No hosted deployment or GitHub push was performed. This remains seller-grouped checkout with the single configured sandbox merchant; it is not independent merchant onboarding or combined multi-seller settlement.
