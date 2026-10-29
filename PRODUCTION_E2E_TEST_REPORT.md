# New production workspace — E2E results

Date: 27 October 2026. Target: current local ScrapDrop source, with an isolated database. These results do **not** certify the currently hosted Render deployment.

## Outcome

The executed production journeys pass after three interface fixes. The final regression suite reports **109 tests: 104 passed, 5 intentionally skipped, 0 failed**. This includes the new full-server campaign (one parent and nine sequential journey tests). The subsequently expanded material/dimension matrix also passed independently: **10/10, no skips**. Type checking and the production build with both sponsor panels enabled passed.

The browser campaign exercised the actual React UI at desktop and 390 × 844 mobile sizes. Its 13 recorded checks are in [the execution ledger](tests/evidence/production-e2e-2026-10-27.json). This was a local demo environment with fixture AI and simulated payment; no live Gemini calls or actual PayPal transactions were made.

## Coverage and observations

| Area | Executed evidence |
| --- | --- |
| Inputs and calculations | 27 combinations of three constructions, quantities 1/7/40, and widths 20/95/400 mm. Three further cases change panel length to 75 mm and sleeve depth to 25 mm. Demand is conserved and purchase lines reconcile. |
| Materials | No owned sheets; fabric rejected as a substitute for card; incompatible owned thickness ignored; two lots with different sizes/colors; strict color and required thickness; rotation-dependent fit. |
| Blockers | Missing glue, zero purchase budget, insufficient hands-on time, invalid quantities, negative dimensions/budget and unsupported construction. Blocked saves rejected. |
| Identity and security | Actual login/session cookies, missing CSRF, foreign origin, anonymous saving, other buyer isolation, operator-only scheduling and fulfillment. |
| Saved recipes/tutorials | Frozen dimensions and recipes; stale progress rejected; saved sleeve product/step survives reload; keyboard Next, part selection, replay, 2D fallback, last-step limits. |
| Purchase and fulfillment | Exact $1.70 shortfall, tools acknowledgement, close/reopen checkout, idempotent simulated payment, duplicate checkout guard, paid instructions, collection gate, operator ready/collect and one-use code. |
| Results and inventory | Invalid counts and oversized offcuts roll back; successful results consume owned sheets exactly once; exact retry is idempotent, changed final results rejected; owned-only production needs no payment; measured offcut credit and zero-good batch. |
| Economics | Browser: 48 good × $3 = $144 revenue. $1.70 purchase + $5 owned card + $0.50 consumables + 84 minutes at $12/hour = $24 entered cost. Contribution is $120. Cash avoided stays separately labeled $3.60. |
| Operations | Canonical schedule validation; resource/predecessor conflicts, unknown operations, impossible date and stale revision rejected; empty schedule persistence; browser bars survive rejected edit, save and reload. |
| Analytics | AG Studio loads the three saved estimate-only jobs and accessible records. Fixture assistant reports zero measured finalized observations rather than inventing a time overrun. HTTP results are labeled demonstration results. |
| Persistence | Restarting the full server preserves sessions, recipes, progress, paid/collected order, finalized results and schedule. |
| Regression | Legacy gift-box example still compares 3 owned sheets to 4 boxes and calculates one $1.90 sheet shortfall. |

The retail mix is 48 parts from four owned sheets and one new sheet, with a 79-minute estimate. Browser checkout, readiness, collection and result finalization all completed successfully. The results above are demonstration inputs, not evidence of actual workshop productivity.

## Defects found and fixed

1. **Saved-job results form kept the previous job's counts/time.** Opening a 2-tag job then the 48-part retail job showed a single count of 2 and 6 minutes. The results component now resets on saved job identity. Retest restored all three 12/24/12 fields and 79 minutes.
2. **Timeline became empty after rejecting a conflict.** A fresh but equivalent schedule array recreated the vendor project configuration. The configuration now remains stable when schedule content is unchanged. Retest retained all seven resource-assigned bars after the invalid edit, save and data reload.
3. **3D guide overflowed mobile.** The preview imposed a minimum grid width; page content extended to 641 px on a 390 px viewport. Grid tracks/children can now shrink. Retest showed a 375 px page within the viewport, including the result screen.

## Practical limitations

- An older saved job correctly refuses a new quote after the saved shelf revision changes. Refresh the workspace, recalculate with the current shelf, and save a new job before buying. The frozen guide remains available.
- This campaign did not repeat native timeline dragging, physical assembly, novice-user trials, OS printing or reduced-motion emulation. Part controls and keyboard Next were checked; this is not a complete accessibility audit.
- No fresh live Gemini, PayPal sandbox capture or webhook delivery was run. Five existing optional tests were skipped: legacy live checkout, expert HTTP, three-sample HTTP, unsupported-task HTTP, and live PayPal sandbox. Their exact names appear in the regression log.
- Sponsor panels build successfully, but their lazy-loaded bundles remain large (roughly 4.58 MB and 5.46 MB before gzip). Build warnings are recorded; this is a loading-performance consideration.
- Current construction geometry remains a prototype; successful calculations/animation do not establish physical fit, strength or actual manufacturing savings.

## Reproduce

Run `npm run test:production` for the disposable full-server HTTP campaign. It creates and removes a temporary SQLite database, seeds three synthetic accounts, starts the real application, and restarts it once. No secrets are needed. Run `npm test` for the broader suite.

The retained browser review environment is [local production](http://127.0.0.1:4361/production), database `/tmp/scrapdrop-production-browser-20261027.sqlite`. Buyer `maker@scrapdrop.test`, operator `studio@scrapdrop.test`; synthetic local password `MakeSomething123!`. Its purchase journey is already collected and results finalized. Use a fresh database for a pristine replay.

## Evidence

- [HTTP journey output](tests/evidence/production-http-2026-10-27.txt)
- [Regression output](tests/evidence/production-regression-2026-10-27.txt)
- [Build output](tests/evidence/production-build-2026-10-27.txt)
- [Browser check ledger](tests/evidence/production-e2e-2026-10-27.json)
- [Mobile completed-results screenshot](tests/evidence/production-mobile-2026-10-27.png)
- [Desktop tutorial-completion screenshot](tests/evidence/production-desktop-2026-10-27.png)
