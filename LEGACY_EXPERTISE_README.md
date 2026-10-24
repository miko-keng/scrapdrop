# TaskSlice — know-how, in your hands

TaskSlice turns a creator's pricing method into an interactive tool another person can use on a real project. The first tool helps freelancers quote creative work. Gemini drafts tool definitions and maps briefs into editable inputs; a deterministic engine computes every amount. PayPal sandbox purchases unlock saving, reuse and export.

## Run locally

Requires Node.js 24 or later.

```sh
npm install
cp .env.example .env
npm run dev
```

If `.env` already exists, keep it. The app prints its local URL (default http://127.0.0.1:4317). On macOS, `Start TaskSlice.command` also launches the app. Build with `npm run build`; run the production build with `npm start` behind HTTPS when hosted.

```dotenv
APP_MODE=sandbox
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=your_sandbox_app_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_app_secret
PAYPAL_WEBHOOK_ID=
PAYPAL_MERCHANT_ID=
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_MODEL=gemini-3.5-flash-lite
```

Use the REST app's credentials, not a buyer/seller password. Merchant ID is optional: the server identifies and persists the recipient from PayPal's canonical order data. Webhook ID is needed once you register a public HTTPS endpoint at `/api/paypal/webhook`. Without it, normal capture/status reconciliation still works, but actual webhook delivery is unverified.

`.env.test.local` may contain sandbox buyer/seller emails and passwords for browser tests. The application does not load that file. Both environment files are private, ignored by Git and excluded from the source archive. Never put private values in `VITE_` variables. Only the PayPal Client ID is intentionally sent to its browser SDK.

## Try the new experience

1. Open **Create a tool**. Start with the supplied example or explain your own supported pricing method. Set your creator/studio name.
2. **Turn my method into a tool** asks Gemini for a structured proposal. Review the title, numeric rules and explanations. Manual editing works without an AI key.
3. Open **Show that it adds up**. Supply at least two different worked examples and their expected totals. You can import examples using the sample CSV format.
4. **Check my examples** compares your expected totals with the calculation engine. Publishing re-runs these checks on the server; client-side results are not trusted.
5. Publish locally, then use the tool. Try **Website design** and **Make it fit my project** to adapt a different brief. Check any assumptions; missing hours produce a clarification.
6. Change deliverables, hours, rate, expenses and revision rounds. Estimates update immediately. The thinking behind the method is available through explanations and contextual questions.
7. Tool creators can save their own quotes without purchasing. Other sessions preview freely and use PayPal sandbox checkout to acquire access. The fixed tool price is USD 2.00, set by the server.
8. Save, reopen, duplicate, export CSV, or open a print-ready quote and save as PDF. My workspace contains saved quotes, owned tools and creator drafts.

For a clearly marked demonstration without payment, set `APP_MODE=demo` and restart. Demo access is recorded as demo, never as a PayPal purchase, and its API returns 403 in sandbox mode. A production demo additionally requires `ALLOW_HOSTED_DEMO=true`.

## Supported method

The first version uses a bounded pricing model:

1. Sum rounded per-deliverable labour amounts (hours × hourly rate).
2. Add rounded labour for revision rounds above the creator's included allowance.
3. Add the creator's contingency percentage to labour only, rounded to cents.
4. Add direct expenses at cost.

Decimal arithmetic uses half-up cent rounding. Currency is USD. No taxes, discounts, market-rate estimates, arbitrary formulas or generated JavaScript are supported. Gemini does not calculate trusted totals, set product prices or grant access.

Tool versions are immutable. Editing and publishing creates the next version. A saved quote always references the version it was created with, including during export. Purchases grant access to the tool; saved calculations do not silently adopt new rules.

Creator uploads currently support worked-example CSV files only (100 KB, 2–8 examples), with headers:

```csv
name,hours,rate,revisions,expenses,expectedTotal
Brand project,24,65,3,80,2010.50
Logo refresh,10,50,2,25,575.00
```

## Architecture

- React, TypeScript and Motion: creator editor, tool interface, animated previews and workspace.
- Express: session ownership, CSRF, schema validation, tool publishing, quote storage, payment verification and exports.
- Gemini: schema-constrained method extraction and brief mapping; contextual explanations. Requests use the server-side API key. Input content is treated as untrusted.
- Shared decimal calculation engine: responsive browser previews and authoritative server recomputation.
- SQLite: creator drafts, immutable published versions, saved quotes and the existing payment/session ledger.
- PayPal: sandbox SDK checkout, server-created fixed-price orders, capture verification, idempotency, status recovery and signed webhooks.

The first version is a local, single-seller product. Creator display names are attribution, not separate payment recipients; multi-seller onboarding and payouts are not implemented. Publishing makes a tool visible in this local app; it does not deploy it to the internet.

## Identity and data

This version uses guest sessions. Access and ownership belong to the current browser cookie. Clearing cookies loses that identity. Permanent login, cross-device ownership and account recovery are not implemented. Tool drafts and quotes persist in SQLite; there is no cloud sync. Back up the local `.data/` directory privately if needed. Existing spreadsheet task/exercise cleanup remains separate from tool/quote records.

The creator's method and buyer's brief are sent to Gemini only when the relevant AI action is used. Quotes remain editable. Use synthetic data for demonstration and review Google's data-use terms before sending confidential information.

## Testing

```sh
npm test
npm run build
```

Unit tests run without credentials. Integration tests are opt-in and need running servers. Use a demo instance with a separate test database for HTTP lesson/tool journeys and a sandbox instance for live unpaid-order tests:

```sh
# Terminal 1: local demo server, isolated database
PORT=4322 APP_BASE_URL=http://127.0.0.1:4322 APP_MODE=demo DB_PATH=/tmp/taskslice-test.sqlite npm run dev
# Terminal 2: local sandbox server, another isolated database
PORT=4321 APP_BASE_URL=http://127.0.0.1:4321 APP_MODE=sandbox DB_PATH=/tmp/taskslice-sandbox-test.sqlite npm run dev
# Terminal 3
TEST_BASE_URL=http://127.0.0.1:4322 TEST_EXPERT_URL=http://127.0.0.1:4322 TEST_SANDBOX_URL=http://127.0.0.1:4321 npm test
```

The suite covers arithmetic, rounding, invalid rules, creator checks, failed publication, immutable versions, quote revisions, session isolation, CSV/HTML escaping and the original lesson/payment logic. The live sandbox test creates an unpaid lesson order and never approves/captures it. Without URL variables, HTTP tests are skipped. Gemini calls in the AI unit tests are mocked; live AI verification is recorded separately.

A completed PayPal buyer approval, capture, paid tool unlock and actual webhook/refund lifecycle must still be tested separately. No simulated purchase is submitted automatically by the test suite.

## Existing lessons

The original spreadsheet lessons remain at `/lessons`, with the existing task, exercise and learning-library routes. Their API behavior is preserved. See `LEGACY_README.md` for their detailed constraints. `ENGINEERING_SPEC.md` describes the earlier lesson-first concept; `EXPERTISE_SPEC.md` documents the new implementation.
