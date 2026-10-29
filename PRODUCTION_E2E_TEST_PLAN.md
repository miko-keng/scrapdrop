# Production E2E campaign — 27 October 2026

## Scope and environment
Test the new `/production` manufacturing workspace with the actual Express server, session cookies, CSRF protection, SQLite persistence, commerce routes and operator permissions. Browser checks use the real React interface. HTTP journey checks complement browser checks; they are not described as browser automation.

Use a new disposable database and local demo server. Fixture AI and explicitly simulated payments prevent charges and Gemini quota usage. Never change the hosted deployment or personal data. Live PayPal webhook delivery, live Gemini quality, physical assembly and novice trials remain separate validations.

## Automated full-server journeys
1. Anonymous plan succeeds; saving requires login. Missing CSRF and foreign origins fail. Login rotates the session. A second buyer cannot access saved plans or orders; buyers cannot change the operator schedule.
2. Compare the retail mix: 48 parts, four owned sheets, one additional sheet, $1.70. Reconcile quantities and line totals. Vary each construction, dimensions, quantity, thickness, color, tools, budget, available time and rotation. Invalid values must fail cleanly; blocked plans cannot be saved.
3. Save a frozen job; change tutorial progress, reject stale/invalid progress, and preserve recipe dimensions. Explanation and planning fixtures return scoped, cached answers without provider credentials.
4. Quote the exact shortfall; require tool acknowledgement; simulated payment is idempotent. Instructions use the saved recipes. Final production results remain blocked until operator readiness and collection. Codes redeem once. A duplicate checkout cannot purchase the same job twice.
5. Reject incorrect good/spoiled totals and impossible offcuts without consuming inventory. Finalize valid results, reconcile contribution and material usage, repeat the identical request without double consumption, reject changed results.
6. Finalize an owned-only job without payment. Test a zero-good batch and measured reusable offcut. Confirm analytics distinguish demonstration results from actual observations.
7. Save canonical operator operations, reject overlaps, unknown operations, impossible dates and stale revisions. Persist an empty schedule intentionally.
8. Restart the same server/database and verify jobs, tutorial progress, orders, results and schedule survive.

## Browser journeys
1. Sign in as the disposable maker; load the retail example, compare, inspect cutting sheets and all three constructions. Check the 3D/2D guide, step controls, tool reminders and saved progress after reload.
2. Save jobs with different product names/counts and switch between them. Actual-result fields must match the currently opened job.
3. Change dimensions, quantities, budget and tools; confirm understandable blockers and that correction restores a usable plan.
4. Complete a simulated purchase through the checkout dialog, then use the operator interface for fulfillment when practicable. Check instructions and results entry.
5. Operator scheduling: add a job, inspect the timeline and accessible table, reject a conflict, save/reload. Inspect AG Studio and the accessible production records; fixture help must not claim genuine production evidence.
6. Check the workspace at narrow mobile width for overflow and usable controls. Smoke-test legacy `/make`.

## Completion criteria
Record each executed check and its outcome. Fix reproducible defects and rerun the affected journey. Run type checking and the existing test suite after source changes. Report unexecuted checks, provider/physical limitations and any remaining defects explicitly. Do not equate a simulated payment with a PayPal sandbox transaction or computational geometry with physical validation.
