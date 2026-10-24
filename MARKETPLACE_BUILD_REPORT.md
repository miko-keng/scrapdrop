# TaskSlice marketplace — local build report

24 October 2026 · Asia/Kuala_Lumpur

Preview: **http://127.0.0.1:4321/**

Implementation reference: `MARKETPLACE_IMPLEMENTATION_PLAN.md`. The original plan is retained. This report describes the actual build and its verification limits.

## Delivered

The default app is now the working-solution marketplace. It has problem entry, capability filtering, actual same-sample comparison, private result downloads, persistent buyer/builder accounts, a purchased-application workspace, the builder integration tutorial and private adaptation requests/responses.

Three first-party reference products demonstrate the model:

| Application | Actual function | Free preview | Access package |
| --- | --- | --- | --- |
| Pattern Rename | Validates JPEG/PNG bytes, applies an editable naming pattern and sequence, produces ZIP and mapping CSV without changing image bytes | Up to 3 images | $5 USD, 30 days, up to 100 images per run, saved presets |
| Map Rename | Same image family with optional CSV mapping, unmatched-name reporting and folder preservation | Up to 3 images | $7 USD, 30 days, up to 100 images per run, saved presets |
| Booking Board | Saves session capacity and reservations, serves a booking page, restricts attendee lists to the organiser and exports CSV | Four-attempt capacity simulation | $9 USD, 30 days, up to 20 saved boards |

These are example applications, not the product scope. Independent builders register their own hosted application URL, task family, capabilities and formats. Their website remains under their control; no arbitrary source upload or automatic hosting is promised.

The interface uses the established forest/ivory/lime palette with animated cards, an interactive illustrative file preview, responsive CSS, focused application controls and reduced-motion support. Illustrations are visibly distinguished from actual trial results. Modals handle keyboard focus and Escape. Actual narrow/mobile viewport behaviour has not been browser-tested in this run.

## Buyer architecture

1. Optional Gemini or deterministic/manual interpretation normalises the described task.
2. Capability filters match the supported task family and required capabilities. Unknown/custom tasks do not automatically match unrelated custom websites; those previews remain browsable.
3. Compatible reference apps receive the same files and settings. Their distinct handlers produce real outputs; comparison shows filenames, observed timing and byte/count checks rather than invented quality scores.
4. Private jobs/artifacts bind to the current guest or persistent account. Signing in migrates only the current guest's records. Cached identical runs are owner-scoped. Artifacts expire after 24 hours, with cleanup on trial/download requests and expiry filtering in the workspace.
5. Reference-app checkout creates a server-priced PayPal sandbox order and snapshots the product/package and canonical recipient. Existing capture verification checks amount/currency/recipient and creates a grant idempotently.
6. Account-bound access checks create an expiry record on the first access check after verified capture. Every protected reference operation consults current access. Refund/reversal revocation reuses the existing grant lifecycle.
7. Independent app launches use one-use, one-minute codes; the provider exchanges a code on its server and verifies access before each protected operation. Provider credentials and launch/session tokens are stored as hashes by TaskSlice.

Reference applications currently run in the marketplace process. The separate reference-provider example is a real second HTTP process. There is no general worker queue, arbitrary-code execution service or provider hosting infrastructure.

## Builder workflow

The six-step tutorial covers registration, server credentials, running the example, actual contract checks, listing preview and local publication. The full guide is available at `/provider-guide.md` and in `public/provider-guide.md`.

The supplied `examples/provider-reference.mjs` implements the documented launch/exchange/verify protocol. Its uppercase conversion demonstrates integration only. Seven HTTP checks exercise missing, valid, wrong-tool, expired, revoked, repeated and malformed requests. Manifest revisions are retained and editing invalidates the previous check/publication state.

External HTTPS sites may publish **preview-only** listings and receive adaptation requests. Contract fetching is restricted to the configured local reference origin. **Independent paid checkout is not enabled:** it requires seller onboarding and correct payment routing. No independent seller's payment is silently routed to the configured reference seller. A passed integration check is not seller approval or proof that all application capabilities work.

## Executed verification

| Check | Result |
| --- | --- |
| TypeScript and production client build | Passed |
| Final default test suite | 38 passed, 0 failed, 5 optional legacy/live tests skipped; 43 total |
| Same-input file comparison | Passed in HTTP tests and browser; real ZIP/CSV outputs and distinct folder behaviour |
| Independent ZIP reader | Python zipfile opened all four entries; CRC checks passed; PNG bytes and mapping present |
| Unsafe filenames, mapping collisions, MIME/extension mismatch and invalid content | Rejected in tests |
| Private downloads and expiry cleanup | Other guests rejected; current-guest migration preserved; expired artifact rejected |
| Password hashing and account persistence | Tested, including cookie/CSRF rotation, logout and new-browser login |
| Full application middleware | Separate server/database test passed origin and CSRF rejection, session rotation, unauthenticated gating and disabled sandbox demo grants |
| Booking capacity and replay | Atomic reservation tests and real browser booking passed; no extra place consumed on retry |
| Provider integration | All seven checks passed against the actual second HTTP process |
| Provider launch and revocation | Single-use exchange, repeated operation recognition and revoked-access denial passed using explicit fixture grants |
| Adaptation requests | Buyer created a private request; only the correct builder could respond; buyer read the response |
| Manifest history | A changed manifest retained another version and removed the old published listing until republished |
| Live PayPal order creation | Passed for Pattern Rename; canonical order created at $5.00; retry reused it; state awaiting_buyer; access remained locked |
| PayPal browser SDK | Sandbox PayPal/card controls rendered; payment was not submitted |
| Live Gemini final smoke | Two requests, both successful: buyer interpretation and provider capability description |

Routine tests made **zero live Gemini calls**. The initial offline suite and build passed before the separate final Gemini run. Two live calls used synthetic descriptive text only. Follow-up tests and the running preview use fixture mode. A key alone does not enable AI; live testing needs explicit mode and flag, with a hard 0–3 per-process request budget. No further Gemini retries were used.

Browser checks also covered local account registration, editable filename-pattern results, provider tutorial screens, saved booking creation, actual reservation confirmation, a zero-availability disabled booking form and the organiser's attendee list. The booking UI test used a separate temporary demo database; it did not grant fake paid access in the sandbox database.

## Remaining boundaries

- A completed buyer checkout/capture, real webhook delivery and real refund/reversal notification were not executed in this build. Existing fixture tests verify canonical capture validation and revocation. An unpaid order is not evidence of a completed purchase.
- Independent multi-seller onboarding, correct merchant routing and a purchasable independent listing remain dependent on a supported PayPal setup. The plan's explicit single-seller reference-app fallback is used.
- The provider tutorial was exercised through automated HTTP integration and UI review, but a separate human reviewer has not yet repeated it unaided.
- External provider sample-run adapters and general origin-ownership verification are not implemented; custom previews cannot join the built-in same-sample comparison. Only the two rename reference tools are comparison-compatible today.
- Provider credential rotation, account email verification/recovery, a general job queue, universal usage metering and public production deployment remain future work. Existing credentials are issued once; retain the private copy or create a fresh draft.
- The booking reference has one fixed-capacity session per board and fixed name/email form fields. It does not charge attendees or send email.
- Image validation checks magic/type/extension and safe bounded output; it does not decode or repair every possible image format variant. Only JPEG/PNG are supported. Uploaded ZIPs are not accepted.
- No external software seller reviews, customer counts, financial claims or universal AI quality ratings are fabricated.

## Files and handoff

Source: `/Users/kengzx/Paypal hackathon/TaskSlice`

The latest `TaskSlice-source.zip` excludes `.env`, `.env.test.local`, all other private environment files, `.data`, databases, logs, dependencies and generated client output. `.env.example` is intentionally included with blank credential fields. Existing secrets were preserved and not printed.

`Start TaskSlice.command` opens the current local workflow on port 4321 by default. An earlier process still occupies 4317 and could not be stopped from this session; use the current 4321 preview. No public deployment was performed. The temporary booking QA server has been stopped; the main preview remains running for review.
