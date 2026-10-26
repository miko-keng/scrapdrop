# ScrapDrop implementation report

Implemented 25 October 2026. Current product replaces TaskSlice's primary interface; historical modules and accounts remain for compatibility.

## Working prototype

A single craft studio lists confirmed leftover card, fabric and ribbon. A buyer describes a project, receives feasible suggestions, customizes a kit in interactive 3D, reviews an exact material allocation and preparation price, selects a capacity-limited collection window, and checks out with PayPal sandbox. The operator prepares the frozen order and marks it ready. The buyer then receives a private one-use pickup code and printable assembly/cutting guide.

Three authored projects are supported: gift box, notebook wrap, layered bookmark. Stock, dimensions, thickness, ribbon lengths, budget, time and required tools constrain recommendations. Color choices select actual stock records. 3D includes rotation, zoom, exploded parts, selection and assembly steps, with a project-specific 2D fallback. It illustrates the design rather than simulating material physics or promising exact photographed textures.

Stock reservations and collection capacity are transactional. Capture-in-progress holds survive expiry until reconciliation. Completed captures verify currency, amount and merchant; retries cannot duplicate allocation. Uncertain or late payments require resolution. Refund events do not automatically return physical materials to inventory. Operator-confirmed usable returns are explicit. Existing software-access grants are never issued for kits.

Operator stock entry supports private JPEG/PNG uploads, metadata removal, optional explicit AI sharing, and human confirmation. Vision drafts cannot determine reliable dimensions, counts or safety. No arbitrary marketplace website upload or builder integration is part of this product.

## Validation actually performed

- Production build and TypeScript checks passed.
- Automated suite: 59 tests, 54 passed, 0 failed, 5 optional legacy/live tests skipped. New coverage includes geometry/BOM consistency, payment transport recovery, ownership and operator permissions, immutable guides, pickup reuse rejection, AI quotas, collection capacity, and two independent processes competing for the last stock unit across a database restart.
- Browser: homepage, material color/price changes, exploded 3D, size adjustment, sign-in, simulated checkout, buyer history, operator picklist, ready status, private QR, collection and reuse rejection. Collection-window UI was also checked after its addition.
- Gemini: exactly three live requests, after offline checks. Two buyer briefs returned feasible AI suggestions. A synthetic illustration produced an honest `unknown` material classification. Routine tests and the local demo use fixtures and make zero live AI calls. No further live calls were made for UI revisions.
- PayPal: real sandbox authentication, unpaid USD 4.20 order creation, seller validation, lookup and idempotent order reuse succeeded. No purchase or capture was submitted. Capture/refund/webhook behavior was tested with injected fixtures, not an actual paid sandbox lifecycle.
- Desktop browser visual QA completed. Responsive CSS is included; an actual mobile-device/browser viewport test was not performed.

## Running and hosted setup

See README.md for `npm run demo`, synthetic local buyer/operator accounts, sandbox configuration, AI limits and Render deployment. The local launcher deliberately disables PayPal/Gemini credentials and labels simulated payment.

The existing Render URL can remain https://taskslice.onrender.com even though the repository/product is ScrapDrop. The deployed service requires `SCRAPDROP_OPERATOR_ACCOUNT_ID` set to the intended signed-in account ID. No public signup becomes operator automatically. Use a persistent disk and set DB_PATH there for durable inventory, holds and accounts; ephemeral storage is unsuitable for a lasting shop. No paid hosting plan was purchased.

Default AI mode remains fixture. Live verification/judging must be explicitly configured; per-identity and database-wide caps protect usage. Account email verification/recovery, multi-shop payouts, delivery, tax calculation and unrestricted AI-generated projects remain outside this prototype. Collection location and inventory are clearly synthetic sandbox examples, not a real shop address or actual stock offering.

## Craft-studio visual update

The homepage and project customizer now use a warm-paper, cobalt, coral and butter-yellow palette. Original SVG scenes place projects beside a gift tag, desk objects and an open book. Material samples use illustrative paper grain and woven patterns. The 3D viewer adds original procedural bump textures, interpolated stock-color changes, continuous part transitions, tighter target-based framing and camera fitting on size changes. The hero offers a one-shot/replay assembly sequence; reduced-motion users get a manual assembled/separate-pieces control. Controls, exact prices and stock checks remain unchanged.

Validation: production build passed; existing suite remains 54 passed / 0 failed / 5 optional skipped. Desktop browser checked hero/replay, project cards, gift-box and notebook customizers, color/price updates, exploded views and navigation. No live AI requests or payments were made for this visual update. Narrow-screen CSS is included; actual mobile-device QA remains outstanding. Design references informed presentation only; all new scenes, textures and styles are original code with no copied brand assets.

## Owned-material batch planning and shortfall checkout

Implemented 26 October 2026: `/batch` adds account-owned material records, quantities up to 100, measured sheet/ribbon yields, conservative cutting layouts, supported design-size alternatives, exact shortfall baskets, optional purchased-sheet cutting, frozen paid production guides and zero-purchase making plans. Marking a plan made updates whole-unit material balances atomically and once. Concurrent/stale updates are rejected; insufficient remaining material cannot go negative. Buyer-owned inventory is self-reported and not reserved across open plans.

Validation: build passed; 68 automated tests, 63 passed, zero failed, five optional legacy/live skipped. New tests cover non-overlap/margins/rotation, both worked examples, invalid dates, incompatible materials, ownership, forged pricing, stale quotes, exact shop holds, collection capacity, free jobs, collection gating and idempotent inventory consumption. Browser verified USD 1.90 simulated shortfall checkout, frozen batch guide, free-plan save and make, material balances changing to zero, USD 4.60 versus USD 0.80 bookmark alternatives, and a phone-sized viewport with no horizontal overflow. No live Gemini request or real PayPal capture was made for this update. Existing PayPal capture and webhook paths are reused. Actual mobile hardware and real shop productivity trials remain untested.

The current planner does not optimize material grain, arbitrary shapes, multiple different jobs together, machine capacity or full labor/overhead cost. Conservative estimated time is displayed rather than guaranteed completion. Offcut area includes margins and cannot be treated as a usable rectangular inventory record without remeasurement. See README for the full reproducible walkthrough.

## Unified project planning — 26 October 2026

Replaced separate single-project and batch UI with **Make a project** at `/make`; existing `/studio` and `/batch` URLs open this same flow. Homepage ideas and project cards lead there. Supports quantities 1–100, owned-stock reuse, stock-backed 3D, explicit design minimums and permitted extra shades. Removed automatic 15% shrinking. Bounded alternatives retain quantity, deadline and tools and explain what changes; inferior redundant routes are omitted.

New `/api/scrapdrop/planner/interpret` accepts an explicitly submitted idea and returns an editable requirements draft. Live mode uses strict Gemini JSON output plus existing quotas/cache. Default fixture mode remains labeled and network-free. Unsupported projects are rejected; absent requirements require manual review. Prices, fit, readiness and quotes are calculated independently of AI. Missing tools must be marked owned or explicitly arranged; arrangements remain outside the purchase and persist in the frozen plan. Budget includes materials and the optional purchased-sheet outer-blank cutting service; the service does not supply tools or perform assembly.

Validation: production build and TypeScript passed. 75 automated tests: 70 passed, 0 failed, 5 optional legacy/live skipped. Added checks for explicit brief extraction, negative tool statements, separate target/minimum sizes, unsupported/inconsistent model output, zero fixture network calls, mocked model validation/cache, preserved design constraints, missing-tool readiness, fee-inclusive budgets and HTTP rejection of unready quotes. Existing stock, payment recovery, pickup and privacy tests remain passing.

Browser checked explicit brief → editable draft → applied requirements; the 30-bookmark comparison ($4.60 target versus $0.80, 34 × 130 mm option within permitted minimums); selected ribbon-only shortfall reaching checkout with no cutting fee; missing-glue arrangements in basket/guide; one gift box with no owned material requiring one card sheet and one ribbon ($2.70); legacy `/studio` redirect; phone-sized responsive controls/cards with no horizontal overflow. Actual mobile hardware remains untested. No new live Gemini requests, real PayPal orders or captures were made in this update. Model-path validation uses an injected response, so this report does not claim fresh live-model verification.
