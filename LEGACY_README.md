# TaskSlice

**A little learning. A lot of doing.**

A working local learning-commerce prototype for the PayPal AI Hackathon. Describe a spreadsheet task, find a short lesson, work with real data, check your understanding, and download the result.

## What works

- Animated, responsive React interface with reduced-motion support.
- Three complete lessons: exact sales aggregation, left lookups, and numeric exception flags.
- Synthetic samples and real UTF-8 CSV uploads (up to two files, 2 MB each).
- Working table controls, live results, original hints, server-side checking, and CSV export.
- Saved guest-session progress and a personal lesson library.
- Clearly labelled free demo access, separate from PayPal purchases.
- Server-side PayPal sandbox order/capture integration, amount/currency/seller checks, durable purchases, idempotency, reconciliation, verified webhooks, and full-refund/reversal access handling.
- Optional Google Gemini API integration for structured task matching and contextual hints. Without credentials, the app explicitly uses a limited guided matcher.

**This is the first local build, not a submission-ready hosted service.** The live AI and real PayPal sandbox flows require account configuration and verification. Read [BUILD_STATUS.md](BUILD_STATUS.md) for remaining work and differences from the original engineering specification.

## Start locally

Requires Node.js 24 or newer (uses Node's built-in SQLite).

```sh
cd '/Users/kengzx/Paypal hackathon/TaskSlice'
npm ci
cp .env.example .env  # Only if .env does not already exist. Never overwrite your populated file.
npm run dev
```

Open **http://127.0.0.1:4317**. The app listens only on loopback by default.

A local `.env` file has already been created for this project. Do not commit it or paste its contents into chat. Your data is stored in `.data/taskslice.sqlite`, which is also ignored.

## Try the complete sample journey

1. Choose **Summarise my sales**, then **Find my next step**.
2. Read the lesson preview and choose **Try with free demo access**.
3. Continue to step two. Choose **Product** and **Sales**.
4. Inspect the real totals: Canvas tote 112.00, Ceramic mug 108.00, Notebook 72.00.
5. Continue, answer **Each product gets its own total**, then check your work.
6. Download the result. Refresh and reopen **My learning** to verify persistence.
7. Try the matching lesson (Product code → Product code → Product name) and the flagging lesson (Stock → is below → 5).

Demo access is never recorded as a PayPal transaction. Existing demo entitlements stay in the same guest session; use a fresh browser session when testing paid access for the same lesson.

## Connect PayPal sandbox

Edit `.env` locally:

```dotenv
APP_MODE=sandbox
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
PAYPAL_MERCHANT_ID=  # Optional: seller is identified from the app connection
PAYPAL_WEBHOOK_ID=your_app_webhook_id
```

- The merchant ID is optional. TaskSlice identifies and stores the seller returned by PayPal for the app-authenticated order. If supplied, it adds a check against that expected seller.
- Use a separate sandbox buyer account for checkout.
- Restart the server after editing `.env`.
- The app exposes only the client ID to the browser. The client secret stays on the server.
- When the required credentials are present, the lesson page displays PayPal sandbox checkout.
- Real payments are deliberately unsupported.
- Webhook registration requires a publicly reachable HTTPS endpoint at `/api/paypal/webhook`. Loopback alone cannot receive PayPal notifications. Use an authorised HTTPS development tunnel or a later hosted deployment; register its exact URL and webhook ID in the sandbox REST app.
- The backend also reconciles uncertain captures while the local server is running. Successful normal captures do not depend on receiving the webhook first.

Configure relevant completed/pending/denied capture, refund, and reversal events according to current PayPal documentation. Signature verification uses PayPal's verification endpoint; PayPal simulator events do not support that method. Use an actual sandbox transaction to validate this integration.

Before calling the integration verified, perform a real sandbox purchase, cancellation, repeat-status check, interrupted-confirmation recovery, and full refund with the correct webhook setup.

## Connect AI

Optional configuration:

```dotenv
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_MODEL=gemini-3.5-flash-lite
```

TaskSlice calls Google Gemini directly using the server-only key from Google AI Studio. The default model is `gemini-3.5-flash-lite`. Restart after setting these values. Free-tier quota is controlled by Google.

The app sends your goal, column names/types, and up to five sample rows by default. On CSV upload you can turn off sharing sample values. The no-sample option still sends the schema and goal. Do not upload confidential business or personal data until you have reviewed the provider's account settings and terms.

Without a Gemini API key, the interface states **Guided sample mode**. That mode is not advertised as live AI and does not satisfy the hackathon's live AI integration by itself.

## Data and session behaviour

- UTF-8 CSV only. No Excel workbook import, formulas, macros, or external application control.
- Column types are inferred conservatively. Leading-zero identifiers remain text. Ambiguous dates remain text and receive a warning; re-export dates as YYYY-MM-DD to group by month.
- Current maximum: 5,000 rows and 30 columns per table.
- Exact decimal arithmetic is used for supported bounded numeric values.
- Missing values remain distinct from zero. Lookups reject duplicate right-hand keys.
- Conditional highlighting exports a flag column, not Excel cell formatting.
- Guest access is tied to an HttpOnly cookie in the same browser. Clearing cookies loses that guest identity. Cross-device recovery is not implemented.
- Tasks and inactive exercises are cleaned up after seven days by the running server. Purchase grants remain. Use **Remove my data** to remove working data earlier.
- Anyone with local access to your computer's project files may be able to access the stored database. Keep the machine and local configuration secure.

## Commands

```sh
npm run dev          # Local app and API
npm run typecheck    # TypeScript check
npm test             # Logic and payment-integrity tests; HTTP tests skip without a server URL
TEST_BASE_URL=http://127.0.0.1:4317 npm test  # Include all three real local API journeys
npm run build        # Type check and production client build
npm start            # Production serving; configure the environment as described below
```

## Architecture

React + TypeScript + Vite, with Motion for purposeful transitions and Lucide icons. Express serves both API and application. Local persistence uses SQLite; exact arithmetic uses decimal.js; CSV handling uses Papa Parse. Fonts are bundled locally.

This differs from the original Next.js/PostgreSQL proposal: the first local build uses a small single-process server so it runs without Docker or a separate database installation. See [BUILD_STATUS.md](BUILD_STATUS.md). The original [ENGINEERING_SPEC.md](ENGINEERING_SPEC.md) remains the target design and is not a claim that every section is complete.

## Production and hosting

The first build has not been deployed. A future host requires HTTPS, durable writable storage mounted at `DB_PATH`, an appropriate base URL, sufficient provider budgets, and continuously running reconciliation/cleanup. This SQLite build is single-instance; do not run multiple replicas against independent files.

Set `NODE_ENV=production`, `APP_MODE=sandbox`, `APP_BASE_URL=https://your-host`, and server credentials. `HOST=0.0.0.0` is needed inside a container. Session cookies use Secure in production.

For an explicitly labelled hosted demo without real purchases, `APP_MODE=demo` also requires `ALLOW_HOSTED_DEMO=true`. Do not use demo mode as evidence of real PayPal integration.

A Dockerfile is included as a starting point. Full PostgreSQL migration, durable standalone jobs, real provider end-to-end testing, broader accessibility checks, and the final judge/submission documents remain release work.

## References

- [PayPal Orders v2](https://developer.paypal.com/api/orders/v2)
- [PayPal idempotency](https://developer.paypal.com/api/rest/reference/idempotency/)
- [PayPal webhook integration](https://developer.paypal.com/api/rest/webhooks/rest/)
- [Gemini API](https://ai.google.dev/api/generate-content)
- [Hackathon rules](https://paypalaihackathon.devpost.com/rules)
