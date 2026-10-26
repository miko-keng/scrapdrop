# Your three-minute ScrapDrop demo rehearsal

Your job now is to practise **one story**. The edge cases and failure testing are in EXPANDED_E2E_REPORT.md; you do not need to repeat them.

**Story:** “I need four gift boxes. I already have three small card sheets and ribbon. ScrapDrop shows what fits, sells me only the missing sheet, and guides me through making the batch.”

## Prepare before starting the timer

1. Open https://taskslice.onrender.com/make and sign in to your existing **ScrapDrop buyer** account. Your PayPal login is separate. Refresh to load the latest build, then do one relaxed practice run before timing yourself.
2. For fulfillment, have a shop-operator session ready in **a different browser or private browser window** at `/shop` → Orders & pickup. Two ordinary tabs in one browser share sign-in; signing out in one can affect the other. Keep your account passwords and pickup code out of the recording.
3. Check the shop has an available card sheet and collection window. Choose **3 sheets → 4 gift boxes**. Keep the default 90×60×35 mm size, tools checked, 120 minutes and a future deadline. Leave cutting service off. On fresh sample prices the missing sheet costs **$1.90**; use the actual displayed price if stock changed.
4. Keep Gemini off for ordinary practice. Local recipe help is correctly labeled. For the final submission recording, enable AI_MODE=live on the server, verify an explicit question works, and show the actual Gemini label; switch off afterward. Local .env changes do not change Render. Never describe fixture guidance as a live Gemini result.
5. For a no-spend local rehearsal, run `npm run demo` and open http://127.0.0.1:4321. Buyer: **maker@scrapdrop.test**; shop: **studio@scrapdrop.test**; both use **MakeSomething123!**. These accounts belong to the local demo, not Render or PayPal. Local payment is explicitly simulated.
6. For the final PayPal segment, use the real configured **PayPal sandbox buyer** and its sandbox checkout. A local simulated order is useful for rehearsal but is not evidence of a real sandbox capture.

Use an existing collected test order to practise the tutorial/results segments repeatedly. Save draft results while rehearsing. Each fresh checkout consumes/reserves shop stock, so do the full purchase once when ready rather than buying another kit for every practice attempt.

## Follow this route — aim for 2:50, leaving 10 seconds spare

| Time | What you click/show | What to say |
| --- | --- | --- |
| 0:00–0:15 | The four-box example and your three owned sheets | “Small makers often buy too much because they don’t know how far their leftovers can go.” |
| 0:15–0:35 | **Compare my options** → owned/shop breakdown and top-up basket | “I need four boxes. These three measured sheets and this ribbon are mine. ScrapDrop calculates the fit and asks me to buy only one extra sheet.” |
| 0:35–1:00 | **Learn to make this** → step 2 net, step 4 walls, step 6 lid, step 7 ribbon | “The same measured recipe drives cutting and assembly. This is my chosen size, with real fold hinges. There is also a measured 2D guide.” |
| 1:00–1:30 | Close tutorial → **Review top-up with PayPal** → confirm tools → sandbox checkout | “PayPal sandbox pays for the exact material shortfall. The purchased dimensions and price stay attached to the order.” Use **Use simulated payment** only for the clearly labeled local rehearsal. |
| 1:30–1:50 | Operator browser: order → **Packed exactly · mark ready**. Buyer: **Check status**, copy pickup code. Operator: enter code → **Confirm collection**. Buyer: **Check status** | “The shop packs the purchased material, and a one-use code confirms collection.” Do not show the reusable pickup code in the published video. |
| 1:50–2:10 | Buyer order → **Learn to make this**, step 5 → **Explain this step / troubleshoot** → ask | “Optional help explains this exact step using the saved dimensions and materials. Navigation and animation do not need AI calls.” Show the real source label. |
| 2:10–2:40 | Close tutorial → **Record what you actually made** → use the sample figures below → **Save draft results** | “After making, I compare actual time, output and costs. Cash avoided stays separate from contribution.” If these are rehearsal numbers, call them sample production figures. |
| 2:40–2:50 | Show the results and the completed prototype view | “Use what you own, buy the difference, then make with a plan you can follow.” |

The checkout or login may take longer than its slot. For the final video, trim loading waits and setup/sign-in time while keeping the actual successful checkout and fulfillment transitions visible. The final video must stay under three minutes. Do not rush into paying with a real account; use the sandbox buyer.

### Sample production figures to memorise

For the four-box order, with cutting service OFF and a $1.90 shortfall:

| Field | Enter |
| --- | --- |
| Good pieces completed | 4 |
| Spoiled pieces | 0 |
| Actual hands-on minutes | 100 |
| Selling price per good unit | $10 |
| Labor rate per hour | $12 |
| Cost of owned materials used | $5 |
| Glue and other consumables | $0.50 |
| Other overhead / payment or selling fees | $0 / $0 |

Expected **sample** revenue $40; labor $20; total batch cost $27.40; contribution before tax $12.60; cost/good unit $6.85. With a different purchase amount, total cost is **purchase amount + $25.50**, and contribution is **$40 minus that total**. These are assumptions for demonstrating the calculator, not evidence of actual sales or profit. Cash avoided is a different comparison and must not be added to contribution.

Saving a draft is enough for the three-minute demo. Do not finish batches or credit offcuts repeatedly during rehearsal. If you want to show offcut credit, record a separate collected test order with a measured offcut before filming; explain that it is a separate completed example. Physical box fit is still pending until you actually assemble and document a sample.

## What to skip in the three-minute recording

Do not test invalid budgets, missing tools, oversized materials, two-tab conflicts, all three projects, phone sizes or every tutorial button. I covered those in the engineering campaign. Keep the camera on the single four-box journey. Free-plan save/resume is optional extra practice after the timed run.

## Five checks after rehearsal

- [ ] I can explain the problem in one sentence.
- [ ] I show owned materials versus the exact purchased shortfall.
- [ ] I show a real sandbox result, or clearly label a simulated practice payment.
- [ ] I show the measured assembly tutorial and the actual AI/fixture source honestly.
- [ ] I finish under three minutes and keep passwords/pickup codes out of the video.
