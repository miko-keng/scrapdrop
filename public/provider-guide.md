# Connect your website to TaskSlice

TaskSlice lists working hosted applications. You retain your website and hosting. Buyers receive time-limited access, not your source code. The three TaskSlice reference applications demonstrate the buyer experience; your app can solve a different problem.

## Current local release

Independent applications can register, publish a preview, receive adaptation requests and test the access protocol. Independent paid checkout is disabled until PayPal seller onboarding exists. A successful protocol test is not a merchant approval, security certification or proof of all your app's features.

Contract tests run only against the configured local reference origin (default http://127.0.0.1:4418). External HTTPS websites can be listed as previews; TaskSlice does not fetch or execute arbitrary submitted URLs. You do not upload executable source code to this marketplace.

## 1. Register your application

Create a TaskSlice account, open **For builders**, and enter the app name, description, app URL, preview URL, task family, input and output formats, and capability identifiers. Save the draft. A server credential is shown once. Store it in your provider server's secret configuration; never embed it in browser JavaScript, a public repository, an image, or a listing.

Use HTTPS for external URLs. Only the configured reference origin may use HTTP during local development. Publishing a URL alone does not protect paid functionality.

## 2. Run the included integration example

From the TaskSlice project directory, set these environment variables in a separate terminal or your process manager, without committing their values:

- TASKSLICE_PROVIDER_KEY: the credential shown after draft creation.
- TASKSLICE_URL: http://127.0.0.1:4317 (or your actual TaskSlice server origin).
- PROVIDER_PORT: 4418, unless you changed PROVIDER_REFERENCE_ORIGIN on TaskSlice too.

Then run:

    node examples/provider-reference.mjs

Open http://127.0.0.1:4418. Its free preview converts text to uppercase. This deliberately small app demonstrates integration; it is not the marketplace's product scope. Your real application can be an organiser, editor, specialist workflow, file processor or another hosted service.

## 3. Protect launch and every paid operation

The following API is implemented in this local release. All calls are server-to-server over HTTPS outside local development. Include `Authorization: Bearer <your-provider-credential>` and `Content-Type: application/json`. Never send an Origin header from browser code: browser requests containing a provider credential are rejected.

### Exchange a launch code

TaskSlice creates a one-use code valid for 60 seconds, bound to the application and buyer. It redirects to your app's `/taskslice/launch?code=...`.

Your server calls:

    POST /api/market/provider/exchange
    { "code": "the-one-use-code" }

A successful response contains `{ "allowed": true, "token": "..." }`. Create your own HttpOnly browser session and store the token on your server. Redirect immediately to a clean URL so the launch code does not remain in the address bar. Exchanges fail if the code is used, expired, belongs to another provider, or lacks current entitlement. Provider session tokens expire after one hour.

### Verify a protected operation

Before every protected operation, your server calls:

    POST /api/market/provider/verify
    { "token": "server-stored-token", "operation": "a-stable-unique-operation-id" }

Proceed only on a successful response with `allowed: true`. The response includes `repeated: true` when the same operation ID was already seen for this buyer/provider. Your app must persist results and return the prior result on a retry rather than repeat side effects. The included uppercase example is deterministic and has no external side effects.

Missing, expired, wrong-provider and revoked access are denied. Fail closed on timeouts. Never trust a browser's `paid=true`, a return URL or a client price. Verification consults current access, including revocation; logging in once does not authorise future paid operations forever.

The current allowance is defined per product, not a universal billable usage meter. Reference rename apps allow up to 100 images per run and Booking Board up to 20 saved boards. Independent paid packages are not offered yet.

## 4. Test your connection

With the matching reference server running, click **Test the integration**. TaskSlice sends synthetic text and temporary test access credentials to `/taskslice/contract` and checks:

1. Missing access rejected.
2. Valid access produces the actual expected output.
3. Wrong-tool access rejected.
4. Expired access rejected.
5. Revoked access rejected.
6. A repeated request is identified.
7. Malformed input rejected.

These are real HTTP requests against the local provider process. They never call Gemini. Test credentials are temporary and do not purchase access. Editing your manifest invalidates the previous check result and unpublishes the previous preview until you publish again.

## 5. Publish and respond

Review the listing and choose **Publish locally**. It becomes visible in this local marketplace. It does not deploy your website or make the marketplace public. A listing may show **integration checked** but remains **preview only** for sales until independent PayPal seller onboarding is implemented.

Buyers can request a specific adaptation. Read and respond inside your builder workspace. This records a private discussion; it is not a quotation, payment, delivery promise or automatically generated code.

## 6. Production work before independent sales

Independent sales require merchant onboarding and correct payee routing, a completed sandbox capture/webhook/refund test, persistent provider sessions, application-specific idempotency, account recovery, operational monitoring and a deployment review. Keep your existing public preview available while that work is done. Never route your software's payment to the reference seller.

## Try the buyer-to-builder walkthrough first

The builder page includes **Try buyer-to-builder example**. Run the bundled Pattern Rename sample, send a private practice request to preserve folders, switch to the labelled example builder, re-run the exact sample and send a response. The example buyer can then try the existing Map Rename alternative. This works inside TaskSlice without starting the separate integration server, Gemini or a payment. Both practice roles belong to the signed-in account; the practice provider cannot be published.

Real incoming requests for your registered applications appear in **Feature request inbox**. Attached bundled samples include settings and output names, so you can reproduce the buyer's result. Personal uploads are not shared. Reference-app inbox setup is documented in `docs/REQUEST_FLOW_GUIDE.md` in the repository.
