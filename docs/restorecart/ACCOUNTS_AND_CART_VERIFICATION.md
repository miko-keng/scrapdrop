# Accounts and saved carts — 29 October 2026

## Implemented

Buyer and seller registration with unique email/username, sign-in using either identifier, salted scrypt password storage, HTTP-only session cookies, rotated sessions/CSRF on authentication, and separate workspaces for registered sellers. Existing configured-owner credentials and legacy shops remain available. Registration does not connect a new PayPal merchant: the application still uses its configured sandbox merchant.

Added SQLite-backed per-shop carts for visitors/accounts, guest-cart attachment on sign-in, stock-aware quantity validation, saved-cart list and private purchase history. Browser requests queue cart saves, prevent checkout while saving, and discard queued writes after leaving the shop. Server prices and stock reservations still control checkout. Signing out keeps account carts private; another account does not inherit them.

Created local public synthetic demo accounts via an explicit idempotent seed script, documented at the top of README.md. The seller receives a separate Sunday Studio Demo draft with example source files; earlier shops/orders were not reassigned or reset. The seed script refuses production and does not reset an existing password. Production account verification/reset and independent merchant onboarding remain out of scope.

## Verification

- RestoreCart: 66 tests passed, no skips/failures. Includes four new HTTP scenarios for registration and hashed credentials, guest/account cart persistence, private purchase history across logout/login, and cross-seller isolation of catalogs/sources/orders/kits/exports/destinations/restored kits.
- Full repository regression: 175 discovered, 170 passed, five existing optional skips, zero failures.
- Typecheck and production build passed. Retained manufacturing bundle-size warnings remain.
- Browser used SQLite snapshot `/tmp/restorecart-account-browser.sqlite` on port 4373. Demo buyer signed in by username; demo seller by email. Only the seller's own draft appeared.
- Buyer saved two red mugs and one tote ($48), refreshed, saw the same quantities/total, and saw the cart in the account page.
- After signing out, another new buyer registered through the real UI and saw no other account's carts or orders. Signing back into demo-buyer restored its three-item $48 cart.
- Account page at 390px viewport had document width 375px, with no horizontal overflow. A visually detected inherited button-link color was corrected and verified as white text on dark green.
- Main development server restarted on port 4370; its sign-in/registration screen verified. Temporary test server stopped.
- No Gemini requests or new PayPal payments/refunds were made. Integration payment paths retain an injected test transport. Browser acceptance is agent-executed, not an independent merchant trial.

Fresh evidence: `tests/evidence/restorecart-buyer-account.png`, `restorecart-seller-account.png`, `restorecart-account-mobile.png`, and `restorecart-accounts-tests.txt`.
