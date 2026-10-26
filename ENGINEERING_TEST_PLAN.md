# ScrapDrop: your test guide and expanded E2E plan

Original planned scope, prepared 26 October 2026 and preserved for reference. The expanded campaign has now run; see EXPANDED_E2E_REPORT.md for actual outcomes and deferred checks. The shorter user rehearsal is TEST_GUIDE_AND_E2E_PLAN.md.

## 1. Where to test and which accounts to use

Hosted UI: https://taskslice.onrender.com/make. Use your existing ScrapDrop test account. ScrapDrop sign-in is separate from PayPal: do not enter a PayPal buyer/seller password into ScrapDrop.

For repeatable testing of inventory deductions, duplicates and shop management, prefer the isolated local demo:

```sh
npm ci --include=dev
npm run demo
```

Open http://127.0.0.1:4321. If another app owns this port, set SCRAPDROP_DEMO_PORT before starting. This demo explicitly uses fixture AI and simulated payments and ignores private provider credentials. Its existing database can retain earlier test results; automated runs will use a new isolated database, rather than deleting shared data.

| Account | Email | Password | Purpose |
| --- | --- | --- | --- |
| Local buyer | maker@scrapdrop.test | MakeSomething123! | Plan, save, order, learn and record results |
| Local shop | studio@scrapdrop.test | MakeSomething123! | Pack orders, mark ready and confirm collection |

These synthetic accounts are local-demo accounts, not guaranteed hosted accounts and not PayPal accounts. Real PayPal sandbox testing uses the separately configured sandbox buyer on PayPal’s sandbox checkout page. The shop operator account must already be configured on Render before hosted fulfillment can be tested.

Keep Gemini off for the main campaign. Outside the explicit local demo, `npm run ai:off` edits AI_MODE=fixture in .env; `npm run ai:on` enables live mode. Restart after changing it. Render uses its own Environment settings, not the local .env. A final optional live AI check comes after deterministic tests pass.

## 2. Your guided test: seven short sessions

You can stop after any session. Capture the screen and expected/actual result if anything differs. Use only synthetic material records when testing inventory mutations.

### Session A — Plan and preview without an account

1. Open Make a project and choose **3 sheets → 4 gift boxes**.
2. Check quantity 4, finished dimensions 90×60×35 mm, three owned 200×300 mm card sheets and a 2,600 mm ribbon segment. Keep tools checked, allow at least 110 hands-on minutes, and choose a future deadline.
3. Click **Compare my options**. Expect four projects, an owned/shop breakdown and only the missing material to buy. On fresh seed stock this is one olive sheet, $1.90 without cutting service. Current shop prices/availability are authoritative.
4. Click **Learn to make this** beside the preview. Expect the same dimensions and quantity, not a generic tutorial.
5. Visit steps 2–7: net, scoring, walls, tabs, closing lid and ribbon. Use Back/Next and numbered controls. Rotate/zoom, reset the view, replay and pause.
6. Switch to **2D cutting guide**. Expect a measured diagram and the same written step. Try Print all steps; the preview should include every authored step and the diagram. Screen/print scale is not a calibrated ruler.
7. Close the tutorial. Its preview is not a saved making plan and should not claim saved progress.

### Session B — Save and resume a free plan

1. Sign in as the local buyer or your hosted test account. Choose **3 gift boxes · no purchase**, then compare.
2. Expect a fully owned, $0 material top-up plan and **Save my making plan**. A plan still needing shop material must use checkout instead.
3. Save it, find the saved plan and open Learn to make this from that saved card.
4. Go to step 5, tick one completed step and wait for **Progress saved**.
5. Close, refresh the whole page, reopen the same saved plan. Expect step 5 and the tick to remain. Changing the draft planner must not change this saved plan’s dimensions.

### Session C — Missing tools, insufficient time and budget

1. Return to a new gift-box draft. Untick glue and do not select “I’ll obtain glue.” Compare: expect a clear missing-tool issue and blocked save/checkout.
2. Select “I’ll obtain glue before making.” Compare again: it may become workable, but the guide must remind you to arrange glue; glue must not silently appear in the purchase.
3. Set available minutes below the displayed estimate. Compare: expect an explicit time problem. Raise the allowance and compare again.
4. For a plan requiring a purchase, set budget below its basket total. Compare: expect a budget problem, never a free/complete plan. Set budget to the exact displayed total and repeat.
5. Turn cutting service on. The service costs extra when purchased sheets are being cut. It must not eliminate owned-sheet cutting, detailed cuts, scoring, gluing or ribbon work.

### Session D — Two other projects

1. Select **A fresh chapter**: enter notebook width 100, height 145, spine 12 mm, quantity 1 and sufficient time. Use matching fabric rather than card; compare.
2. Open the tutorial. Expect fabric hems, pockets, a buyer-supplied notebook reminder and 30 mm pocket / 20 mm hem instructions.
3. Choose **30 event bookmarks** and compare. Open its tutorial: expect two layers, no box folds, hole-punch reminders and batch quantity 30.
4. Try the offered smaller-size alternative if stock allows it. The tutorial must use that option’s actual dimensions, not the original target.

### Session E — Full checkout and collection

Run simulated checkout locally first. Only then repeat once using the real configured PayPal sandbox.

1. As buyer, compare **3 sheets → 4 gift boxes** and choose an available collection window.
2. Review the exact basket and cutting-service selection. Use **Review top-up with PayPal → Use simulated payment** in the local demo. The order must explicitly label simulated payment.
3. Verify the order shows frozen dimensions, purchased materials, amount and collection details. Open Learn to make this; progress can be kept once paid. Production recording must require collection.
4. Sign out; sign in as local shop. In Shop workspace → Orders & pickup, open that order’s pick/cut list. It should contain purchased material only, with the correct service instructions. Mark it ready.
5. As buyer, retrieve the private pickup code. As shop, confirm collection with that code. Reusing the same code must fail.
6. As buyer, reopen the collected order and tutorial. Expect the purchased dimensions to remain unchanged.
7. For real sandbox repetition, use the sandbox buyer at PayPal. Do not label a local simulated order as evidence of a real sandbox capture. Payment-provider interruptions are tested in isolated fixtures, not by creating uncertain public payments repeatedly.

### Session F — Actual results and economics

Use the saved free **three-box** plan from Session B for the numerical example. If you already finalized it, create a fresh synthetic plan first.

1. Expand **Record what you actually made**. Enter 2 good pieces, 1 spoiled piece and 90 actual hands-on minutes.
2. Enter selling price $5 per good unit, labor $12/hour, owned materials $3, consumables $0.50, overhead $0 and payment/selling fees $0.
3. Expected: revenue $10; labor $18; total cost $21.50; contribution -$11.50; cost per good unit $10.75. The plan is free to obtain because it uses owned materials, but it is not free to produce. Cash avoided is a separate comparison, never added to profit.
4. Add a synthetic measured 20×20 mm card offcut, quantity 1, using a card source with sufficient remaining allowance. Save a draft. Owned inventory must remain unchanged.
5. Refresh/reopen. Expect the saved figures and draft to remain.
6. Finish the batch. Used whole owned sheets/ribbon segments should be deducted once and one measured offcut credited. Retry the final action: no second deduction or extra offcut should appear.
7. Try a new draft with good + spoiled less than planned: draft allowed, finishing refused. Try an oversized offcut: save refused with no partial inventory change.

### Session G — Help and basic accessibility

1. Open a tutorial step and **Explain this step / troubleshoot**. With fixture mode, expect labeled local recipe guidance and no claim that Gemini ran.
2. Choose an optional synthetic JPEG/PNG. Expect help disabled until photo consent; after asking in fixture mode, it must explicitly say the image was not assessed.
3. Remove the photo and change steps: stale answers must not masquerade as answers for the new step.
4. Use Tab, Left/Right and Escape. Check visible focus, step movement outside text fields, and return to the original opening button.
5. Try your phone or narrow window. Content and step buttons should remain reachable without sideways scrolling. If you normally use reduced motion, verify steps show stable final poses. Use 2D if WebGL is unavailable.

## 3. What I will test beyond your manual guide

**Target: 60 browser E2E scenarios in 12 groups, plus 12 parameterized input datasets and focused server-side failure tests.** These are planned checks, not an already-passing claim. Some scenarios contain several assertions. I will report actual executed/passed/failed/skipped counts rather than treating one screenshot as a whole successful journey.

| IDs | Group: five E2E scenarios each | What must hold |
| --- | --- | --- |
| E01–E05 | Each of three projects; all-owned plan; all-shop plan | Correct recipe, dimensions, quantity, tool set and basket route |
| E06–E10 | Mixed ownership; rotated fit; undersized sheet; wrong material type; wrong thickness/ribbon width | Incompatible material is not counted; layouts honor margins and cut gaps |
| E11–E15 | Quantity boundaries; dimension boundaries; exact/below budget; exact/below time; invalid/past deadline | Invalid data produces actionable errors; no impossible $0 success; valid boundaries accepted |
| E16–E20 | Resize off; allowed smaller option; forbidden smaller size; selected extra shade; unavailable shade/stock | Alternatives honor explicit constraints and propagate their actual recipe dimensions |
| E21–E25 | Missing tool; promised tool; service off; service on with mixed sources; service selected with no purchase | No invented tool supply; only purchased outer-blank work is skipped/charged |
| E26–E30 | All step controls; recipe-specific animation; saved resume after reload/sign-in; independent progress for two plans; old/frozen recipe data | Correct step/state survives; controls and guides refer to the same plan |
| E31–E35 | Buyer/other buyer/shop isolation; signed-out saved-record access; two-tab stale progress; two-tab stale owned inventory; two-tab stale production result | Private data stays private; conflicts are visible and do not silently overwrite |
| E36–E40 | Draft results/reload; successful finish; duplicate finish plus legacy Mark made; invalid outcome/offcut rollback; zero-good and negative-contribution economics | Inventory and offcuts commit once; cost math remains valid even for failed batches |
| E41–E45 | Top-up → payment → ready → collected → tutorial/results; cancel before payment; repeated checkout action; stock/price changes after quote; frozen paid order after later edits | Exact charge and material allocation; no unpaid access, oversell or rewritten purchased dimensions |
| E46–E50 | Pickup attempted before ready; wrong code; reused code; collection-window availability; results attempted before collection | Fulfillment follows its intended states; no early production record or duplicate collection |
| E51–E55 | Fixture help; cached model answer; quota/provider/schema fallback; photo consent/remove/oversize; step change while a delayed answer is in flight | No background model calls or fabricated success; stale response cannot attach to another step |
| E56–E60 | Keyboard/focus; phone/tablet layout; reduced motion; WebGL-unavailable 2D path; print-all and page reload after temporary server failure | Core task remains usable; errors are recoverable and do not erase saved state |

### Parameterized material/dimension/quantity datasets

These deliberately include feasible and infeasible plans. A correct refusal is a passing outcome; quantity 100 does not imply seeded shop stock must supply 100 pieces. Budget boundary tests derive the exact current quote before testing one cent below / equal to it.

| Dataset | Project / dimensions (mm) | Quantity | Materials / purpose |
| --- | --- | --- | --- |
| I01 | Gift box 90×60×35 | 4 | Three owned 200×300 card sheets + 2,600 mm ribbon; one-sheet shortfall |
| I02 | Gift box 90×60×35 | 3 | Same owned materials; no purchase and saved progress |
| I03 | Gift box 60×40×20 | 6 | Smaller boxes on mixed sheet sizes; repeat/grouping and rotation |
| I04 | Gift box 120×80×45 | 2 | Owned 200×300 sheets too small; shop 300×420 reference if available |
| I05 | Gift box 200×240×80 | 1 | Larger blank than seed stock; honest incomplete/unavailable path |
| I06 | Wrap 100×145×12 | 1 | Fabric and ribbon only; notebook supplied by buyer |
| I07 | Wrap 80×120×10 | 3 | Measured 350×260 fabric sheets; repetition and layout orientation |
| I08 | Wrap 150×210×20 | 2 | Different fabric sizes/shades; constrained fit or explicit refusal |
| I09 | Bookmark 40×140×2 | 30 | Worked batch with card, two ribbon lengths and hole punch |
| I10 | Bookmark 34×119×2 | 30 | Smaller allowed dimensions; tutorial and purchasing agree |
| I11 | Bookmark 50×200×2 | 1 | Different strip geometry, hole position and 200 mm ribbon requirement |
| I12 | Bookmark 40×140×2 | 100 | Large demand; time/stock constraint and no silent quantity reduction |

Additional invalid input values: quantity 0, 101, fractions and blank fields; dimensions below/above supported limits; zero-sized material; duplicate material IDs; invalid dates; negative money; excessive offcut counts/size; good+spoiled above planned. Where the browser prevents entry, I will also verify rejection at the server boundary.

## 4. Server and concurrency checks alongside browser E2E

These are integration tests, not a substitute for a user completing the UI:

- Two buyers competing for the final stock unit; only one allocation/capture can succeed. Account for any pre-existing reservations.
- Duplicate/reordered payment notifications, canonical wrong amount/currency/merchant, delayed/uncertain capture, cancellation/hold expiry and retry after restart. Use controlled payment fixtures; never mark sandbox payments as verified solely from client state.
- Paid order recipe/dimensions remain immutable after price, stock or draft changes. Reject unsupported future recipe versions; use frozen printable instructions rather than silently replacing them.
- Transaction rollback if owned material changed or offcut credit cannot fit inventory limits. Material deductions, result save and credits must all succeed or all fail.
- Missing/invalid auth, forged target IDs, revision mismatch and unrecognized fields. Check ownership on every private read/write, including help using a saved target.
- Tutorial AI context contains the selected recipe, frozen dimensions, allocations and required/available tools. Cache keys distinguish different owners, dimensions, steps, questions, photos and model configuration.
- Photos have bounded encoding/dimensions, metadata removed, explicit consent and no raw-image persistence. Photo suggestions must remain uncertain even if a mocked model returns certainty.
- Browser-level temporary errors use a dedicated local test backend or test-only fault fixtures. Any needed test fault injection stays out of public production routes. Report unsupported device/network emulation honestly rather than claiming it ran.

## 5. Execution order, Gemini usage and evidence

1. Create an isolated test database and synthetic buyer A, buyer B and shop accounts. Record the commit/build and fixture stock; do not reset shared/public records.
2. Run type/build and focused unit/integration checks; fix failures first. Routine tests force fixture AI and make zero live calls.
3. Execute the 60-scenario browser campaign and input datasets. Re-run affected journeys after a fix; keep before/after evidence.
4. Check the hosted build with a small non-destructive smoke pass. Do not run destructive/concurrency tests against Render’s shared data.
5. Temporarily turn Gemini on for **one text-help request** and repeat it to verify cache reuse. Optional **one image request** only if a synthetic/authorized photo is needed to verify that feature; do not send personal photos. Do not repeatedly spend quota on animation/navigation.
6. Turn Gemini off again and verify the config. Provider/quota failure is recorded as a fallback result, not called AI success. Budget consumption includes failed requests.
7. Complete one separately identified real PayPal sandbox purchase-to-pickup journey when sandbox credentials and checkout are available. If checkout requires human login/verification, leave that action to the user and label the path pending rather than substitute a fixture silently.
8. Deliver a report listing executed IDs, inputs, expected/actual, pass/fail/skip, screenshots, relevant redacted logs, model call count, payment source and any remaining defects. Do not include credentials or reusable pickup codes.

Release bar: no unresolved failures involving charges, privacy, stock integrity, saved data or core making flow; all supported project families exercised; fallback/device failures disclosed; exactly-once deduction/credit and contribution math verified. Physical box fit and novice usability require MAKING_TRIAL_PACK.md and remain separate pending real-world evidence.
