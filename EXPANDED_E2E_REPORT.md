# Expanded E2E campaign — 26 October 2026

## Outcome

**71 browser checks plus 12 input scenarios passed after fixes.** These are checks within shared multi-step journeys, not 83 separate purchases. Raw evidence contains the original failed/replaced attempts as well as successful retests: [browser evidence](tests/evidence/scrapdrop-browser-e2e-2026-10-26.json).

Build passes. Full automated suite: **86 tests, 81 passed, five optional skipped, zero failed**. This suite includes server payment/stock/concurrency/ownership checks; it is separate from the browser count.

Used the production bundle on local port 4350 with a fresh isolated SQLite database and synthetic buyer A, buyer B and shop accounts. No public account inventory was changed by the destructive/concurrency campaign. All browser checkout/collection actions used explicitly labeled simulated payments, with provider credentials disabled in that server. Browser control was performed through CUA. No claim is made that these were a new real PayPal sandbox capture.

## Issues found and fixed

1. **Failed optional 3D module could blank the page.** Reproduced after rebuilding while an old page was open. Added preview error boundaries around the lazy renderer so the planner/order stays usable and the tutorial changes to measured 2D guidance. Retest deliberately withheld only the local generated tutorial module; tutorial controls, diagram and private saved recipe remained available. Restored the file afterward.
2. **Invalid replacement photo retained a previous photo and consent.** An over-size replacement showed an error while the old photo remained selected. Now changing the photo clears the prior image, consent and answer before validation. Stale async photo/help responses are invalidated when the question/photo changes or a photo is removed. Retest with a valid synthetic image followed by an invalid replacement passed.
3. **Results form appeared before collection although its save was refused.** Backend guard already worked. The order UI now gives an explicit after-collection explanation instead of opening unusable fields. Verified on a newly paid/uncollected order.
4. **Tutorial ribbon thickness illustration used shop reference width.** Narrower compatible owned ribbon is allowed by the planner. The tutorial now derives its illustrative ribbon width from the actual first allocated ribbon, as it already does for reference color. Mixed allocations remain an illustrative reference, not a per-unit visual simulation.

## Test-driver corrections, not application defects

- Native date `fill` did not commit in this browser. Verified the actual value, entered the past date using native arrow-key interaction and confirmed rejection.
- Corrected an overly strict ribbon-width expectation: narrower ribbon is allowed; ribbon wider than half the project width is rejected. Retest used 46 mm ribbon on a 90 mm box.
- Replaced one weak shade assertion with the actual selected oat-material basket and its $1.70 total.
- Responsive override assertions initially ran before the browser applied the resize. Invalid attempts are excluded. Retests checked actual innerWidth and dialog overflow: phone 390 px, dialog 320/320 px; tablet 768 px, dialog 698/698 px.

## Representative end-to-end evidence

- Mixed ownership → exact $1.90 shortfall; selected cutting service makes it $4.40 and preserves owned/detail work.
- Free plan → step/tick saved → page reload → resume; two plans independent; stale two-tab progress, inventory and outcome changes rejected.
- 2 good / 1 spoiled / 90 minutes / $5 price / $12 hourly rate / $3 owned cost / $0.50 consumables → $10 revenue, $21.50 cost, -$11.50 contribution and $10.75 per good unit.
- Draft leaves inventory alone; finish gives owned balances [0,0,1] (used sheet/ribbon lots zero, one measured offcut); retry does not deduct/credit again; another saved plan cannot consume those exhausted lots.
- Repeated simulated checkout action → one paid order → frozen shop-only pick/cut list → ready → wrong code refused → correct code collected → reuse refused → actual-results save.
- Four-good paid order with $4.40 service-inclusive purchase, 100 minutes, $12 hourly labor, $5 owned cost and $0.50 consumables → $40 revenue, $29.90 cost, $10.10 contribution and $7.48 per good unit. This differs intentionally from the simplified rehearsal, which leaves cutting service off.
- Server stopped during a progress write: explicit recoverable error. Restarted same database: last successful step 3 retained, failed step 4 did not overwrite it; paid collection/results/economics also persisted.
- Fixture help was labeled and made no live calls. Photo consent, honest no-assessment notice and step-change answer clearing verified.

## Input scenarios

All 12 datasets in ENGINEERING_TEST_PLAN.md ran through the browser. Feasible plans enabled their correct save/checkout route; out-of-stock or unmakeable designs refused completion. Tested gift-box dimensions 60×40×20 through 200×240×80, several notebook-wrap dimensions, bookmarks 34×119 through 50×200 and quantities 1–100. The 100-bookmark case correctly refused completion with insufficient seed stock. Rotated exact-margin fit and a sheet 1 mm below that threshold were tested separately.

## Live AI and configuration

After deterministic checks, temporarily enabled AI through the .env helper. One real Gemini text request explained the four inward glue tabs; repeating it returned the cached response. Actual model requests: **one**. Then restored AI_MODE=fixture. Routine browser tests made zero live model requests. No live vision request was necessary. Credentials were not printed or included in evidence.

## Limits and deferred checks

- A new real PayPal sandbox approval/capture and webhook round trip was **not** performed in this browser campaign. Payment-provider failures and invariants were exercised by the existing integration suite; local browser payment/fulfillment was simulated.
- Native print preview/printer calibration, an actual OS reduced-motion toggle, screen-reader behavior and hardware WebGL disablement were not independently exercised. Measured 2D content, keyboard controls, responsive layout and missing-module fallback were exercised. Do not equate those with the deferred checks.
- The late-response invalidation change was reviewed and ordinary answer clearing was browser-tested; a delayed live vision response was not injected.
- Physical craft fit, adhesive behavior, real selling profit and novice-user trials remain pending. Use MAKING_TRIAL_PACK.md rather than fabricating evidence.

## Browser check ledger

PASS below is the successful final assertion; FAIL_FIXED retains an original application failure; HARNESS attempts are excluded from passing scenario totals.

| ID | Check | Recorded outcome |
| --- | --- | --- |
| B01 | Four-box mixed-material shortfall | PASS |
| B02 | Fully owned free plan | PASS |
| B03 | Missing glue blocks purchase | PASS |
| B04 | Explicitly arranging glue restores route | PASS |
| B05 | One minute below estimate blocks route | PASS |
| B06 | Exact estimated time accepted | PASS |
| B07 | Budget one cent below basket | PASS |
| B08 | Exact budget accepted | PASS |
| B09 | Past deadline blocked | HARNESS |
| B10 | Cutting fee for purchased sheet | PASS |
| B11 | Service retains owned and detailed cutting | PASS |
| B12 | Service does not charge fully-owned plan | PASS |
| B09-R | Past deadline entered through native keyboard | PASS |
| B13 | Invalid quantity and dimension boundaries | PASS |
| B14 | Rotated sheet fits with exact margins | PASS |
| B15 | One millimeter under rotated edge requirement is rejected | PASS |
| B16 | Fabric cannot substitute for gift-box card | PASS |
| B17 | Different card thickness is not allocated | PASS |
| B18 | Wrong ribbon width is not counted | HARNESS |
| B19 | Ribbon shorter than one required cut is not counted | PASS |
| B18-R | Oversized ribbon width rejected | PASS |
| B20 | Owned color restriction honored | PASS |
| B21 | Mixed colors explicitly allowed | PASS |
| B22 | Chosen smaller option drives tutorial | PASS |
| B23 | No resize without permission | PASS |
| B24 | Minimum larger than target rejected | PASS |
| B25 | Extra shop shade requires explicit opt-in | HARNESS |
| B25-R | Only explicitly permitted cheaper shade substituted | PASS |
| B26 | Private free plan saved | PASS |
| B27 | Saved step and tick survive full reload | PASS |
| B28 | Measured 2D fallback equivalent | PASS |
| B29 | Keyboard step navigation | PASS |
| B30 | Escape closes modal and restores focus | PASS |
| B31 | Two plans keep independent tutorial progress | PASS |
| B32 | Stale two-tab progress cannot overwrite | PASS |
| B33 | Stale material editor cannot overwrite inventory | PASS |
| B34 | Zero good units avoid division and incomplete finish | PASS |
| B35 | Actual contribution includes labor and spoilage | PASS |
| B36 | Oversized offcut rejected atomically | PASS |
| B37 | Draft results preserve inventory | PASS |
| B38 | Draft actual data survive reload | PASS |
| B39 | Stale production results rejected | PASS |
| B40 | Final results deduct and credit once | PASS |
| B41 | Repeated finish and legacy mark-made cannot duplicate | PASS |
| B42 | Other plan cannot consume already-used materials | PASS |
| B43 | Checkout requires explicit tools/collection confirmation | PASS |
| B44 | Closing unpaid quote preserves planner | PASS |
| B45 | Repeated simulated checkout produces one paid order | PASS |
| B46 | Server blocks recording before collection | PASS |
| B47 | Paid tutorial retains purchased dimensions | PASS |
| B48 | Another buyer cannot read private order | PASS |
| B49 | Another buyer cannot see saved plans or owned materials | PASS |
| B50 | Buyer cannot manage shop stock | PASS |
| B51 | Allocated stock cannot be silently repriced | PASS |
| B52 | Shop pack list contains purchased shortfall only | PASS |
| B53 | Ready order exposes private one-use pickup to owner | PASS |
| B54 | Well-formed incorrect pickup code refused | PASS |
| B55 | Correct code collects paid materials | PASS |
| B56 | Used pickup code cannot collect again | PASS |
| B57 | Collected paid order accepts actual results | PASS |
| B58 | Paid journey saves post-collection results with costs | PASS |
| B61 | Unavailable 3D download falls back without blank page | PASS |
| B59 | Fixture help uses current authored step without AI | PASS |
| B60 | Changing steps clears prior answer | PASS |
| B62 | Photo requires explicit consent | PASS |
| B63 | Fixture photo response never claims assessment | PASS |
| B64 | Invalid replacement photo clears previous image and consent | FAIL_FIXED |
| B64-R | Invalid replacement clears prior photo and consent | PASS |
| B65 | Phone tutorial has no horizontal overflow | HARNESS |
| B66 | Tablet tutorial has no horizontal overflow | HARNESS |
| B65-R | Actual phone breakpoint is usable | PASS |
| B66-R | Actual tablet breakpoint has no horizontal overflow | PASS |
| I01 | giftbox 90×60×35 quantity 4 | PASS |
| I02 | giftbox 90×60×35 quantity 3 | PASS |
| I03 | giftbox 60×40×20 quantity 6 | PASS |
| I04 | giftbox 120×80×45 quantity 2 | PASS |
| I05 | giftbox 200×240×80 quantity 1 | PASS |
| I06 | wrap 100×145×12 quantity 1 | PASS |
| I07 | wrap 80×120×10 quantity 3 | PASS |
| I08 | wrap 150×210×20 quantity 2 | PASS |
| I09 | bookmark 40×140×2 quantity 30 | PASS |
| I10 | bookmark 34×119×2 quantity 30 | PASS |
| I11 | bookmark 50×200×2 quantity 1 | PASS |
| I12 | bookmark 40×140×2 quantity 100 | PASS |
| B67 | Wrap tutorial has its own pocket and notebook guidance | PASS |
| B68 | Failed progress save is visible and recoverable | PASS |
| B69 | Restart keeps last successful step | PASS |
| B70 | Restart preserves paid outcome draft and economics | PASS |
| B71 | Pre-collection UI now explains when results unlock | PASS |
