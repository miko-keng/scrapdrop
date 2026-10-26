# ScrapDrop varied-input browser E2E report

Ran the real production client against an isolated Express/SQLite instance at http://127.0.0.1:4347. Synthetic buyer/operator accounts and separate test inventory were used. Fixture AI only; zero Gemini requests and zero real PayPal payments. One explicitly simulated USD 1.90 order completed packing, pickup and making.

45 browser checks recorded: 43 passed; 2 initial failures fixed and rerun successfully; 0 unresolved failures. These are additional to the automated suite (75 tests: 70 passed, 5 optional skipped).

## Issues discovered and fixed

1. Worked examples retained a previously selected cutting service. Each sample now resets it, restoring its advertised baseline price.
2. A design with no fitting sheet/ribbon supply was correctly blocked but displayed covered materials and a USD 0 total. It now shows Unavailable / Total unavailable, explains which inputs need changing, and offers no free-save claim. Incomplete production guides are marked as drafts with missing materials; they no longer claim every piece is accounted for. Valid free plans still work, including large projects covered by larger owned sheets.

## Browser check matrix

| Scenario | Observed total | Continue enabled | Result |
| --- | --- | --- | --- |
| Guide: 30 original bookmarks | $4.60 | Yes | Pass |
| Guide: permitted 34×130 bookmark alternative | $0.80 | Yes | Pass |
| Guide: resizing disabled preserves original size | $4.60 | Yes | Pass |
| Guide: missing glue blocks checkout | $4.60 | No | Pass |
| Guide: separately arranged glue restores readiness | $4.60 | Yes | Pass |
| Guide: four gift boxes, one sheet short | $1.90 | Yes | Pass |
| Budget: $1 blocks a $1.90 basket | $1.90 | No | Pass |
| Budget: exact $1.90 boundary succeeds | $1.90 | Yes | Pass |
| Service: $2.50 fee counts toward budget | $4.40 | No | Pass |
| Service: exact $4.40 budget succeeds | $4.40 | Yes | Pass |
| Sample reset: restores the advertised no-cutting baseline | $4.40 | Yes | Fixed; retest passed |
| Material: 100×100 mm card ignored; rotated shop layout needs two sheets | $3.80 | Yes | Pass |
| Material: fabric cannot replace gift-box card | $3.80 | Yes | Pass |
| Material: 2 mm card is incompatible with the template | $3.80 | Yes | Pass |
| Material: 150 mm ribbon cannot supply 560 mm cuts | $5.10 | Yes | Pass |
| Colors: olive owned card excluded when clay must match | $4.20 | Yes | Pass |
| Colors: mixed permission reuses olive and buys one clay sheet | $2.10 | Yes | Pass |
| Quantity: 100 boxes blocked by insufficient shop stock | $169.90 | No | Pass |
| Quantity boundary: zero rejected | — | — | Pass |
| Quantity boundary: 101 rejected | — | — | Pass |
| Dimensions: impossible design must not claim a free covered plan | — | — | Fixed; retest passed |
| Project: notebook wrap needs fabric, not owned card | $5.20 | Yes | Pass |
| Material: 200×300 mm fabric supplies two notebook wraps | $0.00 | Yes | Pass |
| Dimensions: 110×160×20 wrap outgrows owned fabric | $5.20 | Yes | Pass |
| Dimensions: 31 mm notebook spine rejected | — | — | Pass |
| Time: five minutes cannot make four boxes | $1.90 | No | Pass |
| Deadline: past date blocks continuation | $1.90 | No | Pass |
| Brief: 2 wraps, $6, 60 minutes and cm-to-mm dimensions | $5.20 | Yes | Pass |
| Brief: furniture is unsupported and cannot be applied | — | — | Pass |
| Retest: worked example clears the previous cutting service | $1.90 | Yes | Pass |
| Retest: impossible dimensions show unavailable, not free | — | — | Pass |
| Quantity and budget: three fully-owned boxes at $0 budget | $0.00 | Yes | Pass |
| Free plan: saving persists and its instructions reopen after reload | — | — | Pass |
| Free plan: marking made deducts owned units once | — | — | Pass |
| Paid flow: simulated $1.90 shortfall order and pre-collection making gate | — | — | Pass |
| Paid flow: shop inventory allocates exactly one purchased card sheet | — | — | Pass |
| Paid flow: operator pick list contains shop shortfall only | — | — | Pass |
| Paid flow: ready status reveals the private pickup QR | — | — | Pass |
| Paid flow: collection succeeds once | — | — | Pass |
| Paid flow: pickup code reuse rejected | — | — | Pass |
| Paid flow: repeated making completion leaves balances at zero | — | — | Pass |
| Quantity: one box with no owned materials needs $2.70 | $2.70 | Yes | Pass |
| Budget: zero budget cannot buy a $2.70 kit | $2.70 | No | Pass |
| Dimensions: four 60×40×20 boxes fit owned materials | $0.00 | Yes | Pass |
| Dimensions: large owned sheet enables two otherwise unmakeable large boxes | $0.00 | Yes | Pass |

## Scope and limits

The tests followed the guide through buyer sign-in, the bookmark alternatives, explicit resize permission, missing tools/arrangements, budgets/service fees, free-plan save/reload/instructions/making, and simulated purchase/packing/one-use pickup/collected making. Inputs also varied card versus fabric, sheet dimensions and thickness, ribbon length, matching versus mixed colors, gift-box and notebook dimensions, quantities 0/1/2/3/4/30/100/101, budgets 0/1/1.90/4.40/6, insufficient time, past dates, and a different written brief with cm-to-mm conversion.

Invalid quantity and spine inputs were rejected and comparison remained available for correction. A small owned sheet is ignored, then the shop calculation uses rotated rectangular layouts; it must not be treated as one purchased sheet per finished object. Budget and stock readiness are separate checks. The 100-item material estimate was not purchasable with seeded inventory.

This is browser E2E coverage of the real local application, plus a hosted smoke test after deployment. It does not claim a fresh paid PayPal sandbox capture/webhook lifecycle or live Gemini verification. Printed guide contents and controls were checked; a physical printer and actual craft assembly were not tested.

Additional regression check: the incomplete guide displays **Materials still missing**, an explicit draft warning and **Print / save draft plan**; continuation remains disabled. Complete saved/purchased guides keep their normal production-plan labels.
