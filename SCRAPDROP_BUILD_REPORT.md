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
