# Making tutorial implementation and verification — 26 October 2026

## Delivered software

| Requested part | Implemented behavior | Evidence / limits |
| --- | --- | --- |
| Tutorial entry | Learn to make this beside preview, free saved plans and paid orders | Browser checked all three entry points |
| Shared recipes | One module defines blank sizes, cuts, folds, holes, steps and gift-box hinges; version stored with new kits | Unit checks all templates / several sizes; legacy snapshots use recipe 1 |
| Assembly validation | Flat-net bounds/nonoverlap, fold bounds, gift-box flat-net/hinge correspondence, closed wall/lid/tab positions | Mathematical centerline checks; physical assembly remains pending |
| Real animation | Sequential wall hinges, inward tabs and closing lid; wrap hems/pockets; bookmark bonding/hole/ribbon | Three.js visual browser checks; illustrative ribbon/cloth, not physics |
| Controls | Back/Next, numbered steps, replay, pause, view reset, completion ticks | Keyboard navigation and 2D alternative exercised |
| Personalization | Frozen finished dimensions, allocated material reference colors, YOURS/SHOP labels, tool reminders | 90×60×35 gift-box order and 40×140 bookmark batch checked |
| Cutting service | Purchased outer blanks may be skipped; owned sheets, detailed cuts and ribbon retained | Unit coverage; same underlying cutting-fee decision as checkout |
| Batch guidance | Quantities, cutting/scoring/assembly grouping and drying reminders | 30-bookmark browser example |
| Resume | Private revision-checked step/ticks, frozen recipe/kit fingerprint | Saved free plan reopened after full browser reload at step 5 |
| Accessibility | Native dialog focus/close, keyboard, measured SVG, print-all and reduced-motion behavior | Keyboard/2D and 390×844 layout tested; no screen-reader or physical-print calibration claim |
| AI help | Explicit context-grounded question, strict answer schema, private persistent cache, authored fallback | One live Gemini request succeeded; second identical request reused cache; then AI off |
| Troubleshooting | Text question plus optional bounded re-encoded JPEG; photo consent; uncertain visual suggestions | Consent/invalid-photo tests; no live vision test or diagnosis claim |
| Results | Good/spoiled counts, actual minutes, notes, measured offcuts, estimate comparison | Browser save-draft/reload/finalize/retry; inventory mutation exactly once |
| Economics | Selling price, labor, owned material value, consumables, overhead, fees, contribution and per-good-unit cost | Exact cent-based tests; cash avoided explicitly separate |
| Evidence | Trial instructions and demo script prepared | Real physical samples, novice trials and final recorded sandbox purchase still pending |

## Automated checks

`npm run build`: passes TypeScript and production bundle. Three.js produces the existing large-chunk advisory; renderer is lazy-loaded.

`npm test`: **86 tests: 81 passed, 5 optional tests skipped, 0 failed**. Includes existing stock/checkout/fulfillment regressions plus 11 tutorial tests: recipe dimensions, flat/closed hinges, authored service adaptation, private frozen progress, stale revisions, outcome accounting, rollback, material conflicts, exactly-once offcut credit, economics, AI schema/cache/fallback and HTTP auth/payment/collection gating. Routine suite makes zero live Gemini calls.

## Browser E2E observations

Used isolated local production build on port 4348 and disposable matrix database, fixture AI. No public buyer inventory was changed for this test.

- Preview tutorial rendered a flat gift-box net, raised walls, tabs/lid and measured 2D guide.
- Left/Right keyboard navigation moved the current step. Explain this step returned labeled authored guidance in fixture mode.
- A free three-box plan saved a completion tick and step; a full reload resumed at step 5.
- Recorded 2 good / 1 spoiled / 90 minutes; draft did not consume materials and persisted after reload.
- With $5 selling price, $12/hour labor, $3 owned-material value and $0.50 consumables: revenue $10, total cost $21.50, contribution -$11.50, cost/good $10.75. $6.20 cash avoided remained separate.
- Finalized with a measured 20×20 mm card offcut. Owned sheet/ribbon quantities became zero and exactly one offcut lot appeared; repeating finalization did not create a second credit. Finished batches cannot revert to drafts.
- Opened a previously collected simulated-payment order: tutorial retained 90×60×35 mm dimensions and separate owned/shop allocation labels.
- Notebook-wrap pocket hinges and 30-bookmark hole-punch steps opened correctly.
- Uploaded a generated UI screenshot as a disposable test image: help was disabled until photo consent, then fixture guidance explicitly stated the photo was not sent or assessed. No live vision call was used.
- Phone viewport initially exposed horizontal overflow; corrected minimum grid sizing and dialog box sizing. Recheck: dialog clientWidth = scrollWidth = 320 px in a 390×844 viewport, canvas width 286 px.

## Controlled live AI check

Temporarily enabled AI_MODE=live through the config helper. Used an in-memory test database with normal low quotas. Asked which way the four gift-box tabs turn. Gemini returned an answer grounded in the inward tab step. First response source=ai, cached=false; second source=ai, cached=true; total actual requests=1. Switched AI_MODE back to fixture. No private credentials were printed or committed.

## Remaining real-world evidence

Use MAKING_TRIAL_PACK.md. A software test cannot verify adhesive choice, material tolerances, novice comprehension or actual pickup. Do not label physical examples/trials completed until their measured evidence exists. Payment/fulfillment automation uses explicit fixtures; it is not evidence of a newly completed PayPal sandbox capture this turn.
