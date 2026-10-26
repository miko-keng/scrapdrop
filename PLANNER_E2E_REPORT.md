# Planner button and free-plan browser E2E verification

Date: 26 October 2026. Browser automation used the real rendered production client and local Express/SQLite server at `http://127.0.0.1:4346`. AI mode was fixture. The local synthetic buyer was `maker@scrapdrop.test`; no real PayPal payment or Gemini request was made.

## Root cause and correction

Previously `Compare my options` was disabled by `busy || !confirmed`. Every input edit cleared `confirmed`, requiring the buyer to recheck a checkbox without an explicit explanation. The checkbox and its gating state are removed. Comparison is now disabled only during an in-flight planner operation; validation/readiness remains enforced by the server.

`Save my making plan` was implemented, but appeared only for the selected computed zero-purchase option. Paid options correctly used checkout. Added an explicit no-purchase worked example, explanatory comparison/basket copy, an always-visible saved-plan section with empty-state guidance, and scrolling to that section after saving. The zero-purchase heading describes material coverage rather than claiming all required tools are owned.

## Actual browser scenarios

| Scenario | Actions | Observed result |
| --- | --- | --- |
| Initial comparison | Open `/make` without selecting tools | Compare enabled; result shows missing tools and disables continuation rather than comparison. |
| Paid shortfall | Select `3 sheets → 4 gift boxes`; compare | USD 1.90 for one sheet; checkout enabled; no misleading free-save action. |
| Edit and compare again | Change finished quantity from 4 to 3 | Previous result cleared; Compare stays enabled without another checkbox. |
| Zero-purchase result | Compare the edited three-box plan | USD 0.00; Save my making plan enabled. |
| Real save and persistence | Click Save; reload; open saved instructions | New plan appears with ready-to-make status and retains its immutable three-box guide. |
| Complete saved plan | Click Mark batch made | Whole owned sheets/segment balances become zero; action changes to disabled Made. |
| Direct no-purchase example | Select `3 gift boxes · no purchase`; set budget USD 0; compare | USD 0.00 result and enabled save action. |
| Budget failure | Four-box example, budget USD 1; compare | Budget warning; checkout disabled; Compare remains enabled. |
| Guest authentication | Sign out; return to planner; select no-purchase example; compare; save | Sign-in form opens. |
| Sign-in and resume | Sign in as local buyer; click Save again | Draft retained; save succeeds and new saved-plan entry appears. |

## Repeatable smoke test

1. Run `npm run build` and `npm run demo`. The launcher seeds synthetic buyer/operator accounts, disables PayPal/Gemini credentials and uses a separate demo database.
2. Sign in with the local buyer documented in README.
3. Run the scenarios above. For persistence, reload before opening instructions. For consumption, do not reset/reapply the sample before checking the whole-unit balance.
4. Repeat a failed readiness case after fixing its field; comparison must remain available and the continuation action should enable only when the corrected selected plan is ready.

The full automated backend suite remains 75 tests: 70 passed, zero failed, five optional legacy/live skipped. Build and TypeScript passed. The browser scenarios above are additional end-to-end UI coverage, not included in that unit/integration test count. Local tests use disposable demonstration inventory. This change does not alter PayPal capture, stock reservation, quote validation or free-plan server readiness checks.
