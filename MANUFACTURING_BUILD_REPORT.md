# ScrapDrop manufacturing build report

26 October 2026. Local implementation; not committed, pushed or deployed by this build session. The prior test/rehearsal document was left untouched.

## Working implementation

The new `/production` workspace accepts multiple products and measured card lots. Three construction families share a version-2 definition: rectangular flat parts with optional holes, two-panel A-fold displays, and four-face open-ended sleeves with a glued overlap. Custom names and dimensions use those rules; they do not require a separate 3D component per name.

The definition drives panel geometry, holes, folds, tools, cutting SVG and making steps. The generic Three.js renderer builds a panel tree and rotates real hinges; selected panels highlight in 2D and 3D. Instructions, replay/camera reset, keyboard-operable Back/Next, a 2D toggle, print fallback and saved progress are connected. All new constructions are explicitly prototypes pending physical trials.

The mixed-rectangle solver uses actual sheet instances, 2 mm margins, 3 mm gaps and permitted rotation. It allocates compatible owned card before confirmed shop stock. Each sheet is assigned once, and each requested blank is either placed or explicitly unfulfilled. Thickness/color policies, tools, purchase budget and hands-on time gate readiness. Packing is a heuristic, not an optimum claim.

Saved V2 jobs preserve their input, recipes, allocations and version. The quote adapter reuses existing stock holds, fixed prices, capture reconciliation and PayPal webhook handling. New jobs purchase whole shortfall sheets, with zero preparation fee; paid outer-cutting service remains available in the existing V1 flow rather than being silently inferred for V2. Edits cannot rewrite a paid recipe. Zero-shortfall jobs can be saved without payment.

Collected orders and all-owned jobs accept per-product good/spoiled quantities, actual time, cost assumptions and measured offcuts. Finalization validates free rectangles, atomically consumes owned stock, and credits offcuts once. Replayed identical submissions do not consume twice. Demo results are labelled separately from actual observations.

Existing `/make` recipes, saved V1 snapshots, orders and tutorials remain available. The homepage and navigation expose the new production workspace.

## Agentic planning and MCP

`server/scrapdrop/MANUFACTURING_AGENT.md` is explicitly loaded by the server. It documents capabilities, units, constraints, uncertainty and the one-repair limit. The planner connects a real MCP SDK client/server pair over an in-memory transport, scoped to the current caller/job. No unauthenticated public MCP network endpoint was opened.

Tools: inspectCapabilities, inspectInventory, compileRecipe, validateRecipe, solveSharedSheets, estimateOperations, validateSchedule and comparePlans. The server also exposes a construction-registry resource. Both manual planning and MCP call the same deterministic functions.

Live Gemini uses function declarations, executes requested tools through MCP, receives structured failures and may compile one repair. Capability/inventory preflight avoids wasting model rounds on separate discovery requests. A compilation automatically includes a real sheet/shortfall check in its function response. At most three provider rounds run per action, subject to the existing stricter daily/total/process quotas. Animation, navigation, form editing and normal calculation do not call Gemini. Caches include owner, stock revisions, job, recipe/model configuration and agent instructions.

Fixture mode is explicitly labelled and preserves manual product inputs. It does not pretend to understand arbitrary prompts. Unsupported requests never become an unrelated gift box.

`npm run mcp:manufacturing` starts a standard stdio MCP server with only the public synthetic retail-set example and seeded inventory. It does not expose a user's production database or payment credentials. Authenticated website sessions use their own scoped in-memory context.

## Sponsor integrations

- AG Studio 3.0.0: mounted operator charts for estimated/recorded time and good/spoiled units, a production grid with explicit numeric schemas and an equivalent accessible table. Its single assistant uses a server-authorized analytics endpoint; no browser Gemini key, SQL execution or data mutation. Estimates, demo results and actual records are distinguished.
- Bryntum Scheduler Pro 7.3.7: mounted worker/cutter timeline with assignments, dependencies, calendar windows, a selectable start date and validated schedule persistence. Resource-order dependency edges propagate a delayed cutter operation through later work. The server checks every canonical operation, exclusive-resource conflicts, durations, dependencies and working windows. An editable equivalent table is available.
- Both packages were installed from the public npm registry with lifecycle scripts disabled. Bryntum rendered in the browser without executing its postinstall helpers. The Gantt ZIP was not used.
- Sponsor panels are enabled by default locally. Hosted production builds default them off; explicitly set VITE_ENABLE_AG_STUDIO / VITE_ENABLE_BRYNTUM only under suitable evaluation/deployment terms. The core and fallback tables work without the panels. The flags do not remove dependencies from installation.
- Studio rejects missing/invalid/expired licence configuration to its fallback. The known local trial expires 10 December 2026. Hosted/judging coverage is not established by a local licence check.

## Verification

- TypeScript check: passed.
- Production build with both sponsor flags enabled: passed. Heavy sponsor bundles are lazy-loaded in the operator view; build-size advisories remain.
- Automated suite: **99 tests; 94 passed, 5 optional skipped, 0 failed**. Thirteen manufacturing tests extend the existing suite.
- Coverage includes mixed-sheet conservation/bounds, different quantities/dimensions/thickness/colors/rotation, missing tools, budget/time, immutable quotes, real MCP discovery/tool execution, mocked Gemini repair, owner isolation, stale revisions, resource calendars/conflicts, paid collection gating, atomic outcomes and offcut replay/rollback.
- Dependency audit after updating the MCP SDK to 1.32.2: zero known vulnerabilities. This is not a full malware scan.
- One live Gemini planning action used **three provider requests**. It read capabilities/inventory and compiled the exact requested products, with a feasible server-calculated $1.70 shortfall. See tests/evidence/manufacturing-live-ai-2026-10-26.json. The later preflight/automatic-check optimization and repair path were verified with mocked provider responses, without another live allowance.

Browser checks used an isolated SQLite file at `/tmp/scrapdrop-manufacturing-e2e.sqlite` and local fixture AI/simulated payment. Verified: buyer login; 12 holders + 24 tags + 12 sleeves; four owned sheets plus one $1.70 sheet; different sleeve geometry; hinge steps; save/resume after reload; exact checkout; manufacturing order guide; operator ready and one-use collection; synthetic production results; actuals flowing to Studio as demo data; timeline resource bars; drag from minute 0 to 60 propagating later operations to 85/89/96/109/120; schedule save; conflicting edit rejection; no-glue, zero-budget, 1-minute, incompatible 1.5 mm stock and 500 mm width cases; increased quantity; all-owned save; unsupported prompt; 2D and keyboard navigation; 390 px mobile view without horizontal overflow.

A synthetic result of 47 good / 1 spoiled, 90 minutes, $3 average price, $12/hour labor, $5 owned card and $0.50 consumables produced $115.80 contribution with a $1.70 purchase. These are test inputs, not physical productivity or revenue evidence.

## Remaining evidence and deliberate limits

- No physical manufacturing samples or novice trials were performed by this software session. Fit, stability, adhesive behavior and time estimates need real samples before claiming manufacturing validation or measured savings.
- No fresh real PayPal sandbox capture/webhook round-trip was performed for V2. Local simulated checkout/fulfillment and automated capture/idempotency tests passed; real sandbox confirmation remains release verification.
- Live analytics interpretation, live repair behavior and vision troubleshooting were not separately exercised. Fixture and mocked paths were tested.
- No arbitrary CAD, locking sleeve, load-bearing design, machine control, multi-seller payments, supplier marketplace or AG-generated dashboard editing agent is claimed.
- The resource schedule is an internal workshop draft with 09–17 MYT working windows, not a reservation of external shop capacity or a delivery promise. Adhesive drying remains explicitly excluded until measured.
- V2 outcomes finalize a complete batch; the existing V1 production-result draft flow remains separate. No automatic calibration/training from new outcomes is claimed.
- Screen-reader audit, native print-preview calibration, OS reduced-motion testing, licence-expiry runtime and prolonged runtime/load trials remain independent release checks. Equivalent 2D/table fallbacks are implemented.

## Local review

Run `npm run demo`, then open `/production`. For a clean independent rehearsal database: `SCRAPDROP_DEMO_DB=.data/manufacturing-practice.sqlite npm run demo`.

Local demo buyer: maker@scrapdrop.test. Operator: studio@scrapdrop.test. Both use MakeSomething123!. These synthetic local accounts are not Render or PayPal credentials.

See MANUFACTURING_DEMO.md for a short practice route. Server AI fixture/live settings and quotas remain in the existing configuration; this build did not leave live AI enabled in the local demo.
