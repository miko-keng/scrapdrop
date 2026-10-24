# TaskSlice expertise tools — implemented architecture

This document supersedes the lesson-first product direction in ENGINEERING_SPEC.md. The original lessons remain available separately.

## Product scope

A creator describes a bounded project-pricing method, reviews a Gemini-generated definition, supplies worked examples and publishes an immutable version. A buyer describes a real project, reviews editable mapped inputs, explores the estimate and purchases saving/reuse/export through PayPal sandbox. The first product is a USD freelancer quote tool; a general application builder, permanent accounts, multi-seller onboarding and payouts are out of scope.

## Modules

| Module | Responsibility |
|---|---|
| src/App.tsx | Explore, creator editor, quote builder, saved workspace and routing |
| src/ToolCheckout.tsx | PayPal SDK loading, order recovery, checkout dialog and capture callback |
| src/expert.css | Scoped responsive design, animations and print/reduced-motion support |
| src/shared/expert.ts | Tool/input types, sample method, worked examples, exact arithmetic |
| server/expert-ai.ts | Zod schemas, constrained method drafting and project interpretation |
| server/expert.ts | Schema migration, ownership, versioned publication, quotes and exports |
| server/index.ts | API/session middleware and shared PayPal order/capture/reconciliation integration |
| server/store.ts | Existing SQLite store and atomic access grants |
| src/LegacyApp.tsx | Preserved spreadsheet-learning interface |

## Creator workflow

1. A creator opens `/create` and edits the method and display name.
2. `POST /api/expert/draft-from-method` sends the method to Gemini. The response is restricted to supported numeric rules and explanations, or an unsupported-operation rejection. Zod validates the result.
3. The creator manually reviews/edit fields. There is no generated JavaScript, eval or arbitrary expression execution.
4. Worked examples have complete quote inputs and independent expected totals. CSV import supports the documented format with 2–8 rows, no missing numeric cells.
5. `/api/expert/validate` runs examples with the deterministic engine. A mismatch is reported; expected totals are not overwritten by AI or code.
6. Saving creates a private draft under the current learner, or updates it using a revision check.
7. Publishing re-loads that owned draft, checks its revision, re-runs all examples and requires at least two different inputs. A failed check blocks publication.
8. A transaction inserts the immutable version, advances the tool's current-version pointer and updates the draft revision.
9. Public tool views expose the definition and price, not the private method text or worked-example records. A local creator name is not a verified professional identity.

## Buyer workflow

1. `/tools/:id` loads a published definition and current access state.
2. `/api/expert/tools/:id/interpret` maps a brief into schema-constrained, editable quote inputs. User-supplied numbers are used; missing hours require clarification. Any creator defaults are disclosed as assumptions.
3. The browser calculation engine previews each change. Users can inspect creator explanations or request a Gemini explanation using the exact numeric rules and current result.
4. A free preview can be adjusted without purchase. Saving, reopening saved records and exporting require an active tool grant or creator ownership.
5. Checkout calls the tool order endpoint with a UUID request key and pinned version. The fixed USD 2.00 price is read on the server.
6. The existing PayPal server adapter creates the order, persists canonical recipient details and reuses uncertain/active orders. Capture verification checks completed status, seller, amount and currency before granting `tool:<id>` access.
7. Quotes are recomputed on the server when saved, opened or exported. They store a tool-version reference. Editing/publishing later versions cannot change an older saved quote.
8. Duplication opens a fresh unsaved copy. The original record remains intact. Revision numbers prevent stale overwrites.
9. CSV export escapes formula-like user text; HTML export escapes user text and produces a print/PDF view. PDFs use the browser print flow rather than an additional document service.

## Data model

Existing sessions, orders, captures, grants and webhook events are reused. All additions are non-destructive `CREATE TABLE IF NOT EXISTS` migrations.

- `expert_tools`: id, owner, current_version, created.
- `expert_versions`: tool_id/version composite key, immutable JSON body, created. Body contains definition, private creator method, worked examples and server-assigned price.
- `expert_drafts`: id, owner, revision, JSON body, updated.
- `expert_quotes`: id, learner, tool_id, version, revision, JSON body, updated.

A quote body stores input and brief; totals are recomputed. A tool purchase permits use of the tool's versions, while each saved quote remains pinned to its own version. No separate creator wallet or payout ledger exists.

## Calculation contract

Each deliverable is hours × rate, rounded half-up to cents. Extra revisions are max(0, requested rounds − included rounds), multiplied by revision hours and rate, rounded to cents. Labour is the sum of those rounded amounts. Contingency is a percentage of labour only, rounded to cents. Total is labour + contingency + direct expenses, formatted to cents.

Bounds: 1–20 named deliverables, 0–1000 hours per deliverable, hourly rate 0–10000 for buyer inputs, expenses 0–1000000, 0–100 whole revision rounds, 0–100 hours per extra round and 0–100% contingency. A tool's default rate must be at least 1. At least one deliverable must have positive hours before saving. All values must be finite. No tax, discount, exchange-rate or arbitrary expression support exists.

## API surface

- `GET /api/expert/tools`, `GET /api/expert/tools/:id?version=N`
- `GET /api/expert/workspace`
- `POST /api/expert/draft-from-method`
- `POST /api/expert/drafts`, `GET /api/expert/drafts/:id`
- `POST /api/expert/drafts/:id/save`, `POST /api/expert/validate`
- `POST /api/expert/drafts/:id/publish`
- `POST /api/expert/tools/:id/interpret`, `POST /api/expert/tools/:id/explain`
- `POST /api/expert/tools/:id/orders`, `POST /api/expert/tools/:id/demo-access`
- `POST /api/expert/quotes`, `GET /api/expert/quotes/:id`
- `POST /api/expert/quotes/:id/save`
- `GET /api/expert/quotes/:id/export`, `GET /api/expert/quotes/:id/print`
- Existing `POST /api/orders/:id/capture` and `GET /api/orders/:id` handle lesson and tool orders.

All endpoints inherit session and CSRF/origin middleware; owned entities are scoped to the learner. AI drafting and brief mapping allow 20 calls per hour per learner; explanation calls allow 30. Google's project quota applies separately. Draft creation, quote creation and checkout have independent limits. Demo access is rejected with 403 in sandbox mode.

## Verification and limits

See EXPERTISE_TEST_REPORT.md for the latest recorded checks. Public HTTPS webhook delivery, a submitted sandbox purchase/capture, real refund delivery, long-term account recovery, multi-instance operation and creator payouts remain outside the verified scope. This is a local, single-seller MVP with browser-bound identity. Definitions and preview logic are intentionally visible to users; the purchase gates persistence/reuse/export rather than promising formula secrecy.
