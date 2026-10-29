# ScrapDrop: from leftover calculator to small-order fulfillment planner

Proposed 27 October 2026. Product redesign is a proposal, not implemented functionality. PayPal sandbox practice startup has been implemented and authentication verified; no new payment has been approved/captured in this turn.

## Audience and decision
Target small paper-product, print-and-pack and craft businesses handling short runs. Answer: Can I fulfill this customer order using what I already have, at an acceptable cost and before its deadline? Begin with paper/card jobs, not general industrial manufacturing.

The current product computes useful allocations, but its time saving and willingness to pay are unproven. Do not claim that cutting optimization is novel: CutList Optimizer already handles panels/stock and Optitex CutPlan combines production planning, material use and cost estimation. Our proposed opportunity is a simple order-to-material-shortfall-to-local-fulfillment journey for small workshops. This requires user evidence, not a novelty assertion.

## One workspace
Replace the two primary navigation entries Make a project and Plan production with Plan an order. Quantity one and multiple product lines use the same job. Sections: order requirements -> measured stock/tools/capacity -> compared plans -> buy shortfall -> production ticket/guide -> record outcome.

Preserve existing V1 saved plans and paid orders. Map their recipes into a shared job interface with an explicit recipe version; do not pretend all old constructions are V2-compatible. Retire the old entry point only after a compatibility migration passes tests. The home-page examples should open that same editor.

Buyer navigation: Plan an order, My materials, My orders. Shop workspace appears only for the configured operator; direct unauthorized access remains blocked with useful guidance.

## AI must change the decision
1. A plain-language customer brief produces a structured draft. Missing dimensions, deadline, quality/material restrictions or order value trigger focused clarifications. Buyer confirms critical values; quantities and constraints are never silently relaxed.
2. Gemini invokes typed tools to compile supported parts, check inventory, estimate cuts/setup/assembly and evaluate explicitly allowed alternatives. New scenario tools must accept permission bounds: minimum size, accepted colors/materials, deadline, quantity and budget. The existing agent does not yet evaluate these richer alternatives.
3. Return a small number of distinct feasible choices, such as exact requested specification, allowed smaller size that fits existing stock, or buying measured supplier stock to preserve dimensions. Each displays changes, missing materials, cash required, labor cost, deadline feasibility and uncertainty. Return fewer choices if there are fewer feasible routes; never manufacture three equivalent cards.
4. Let the user make a meaningful change: no glue, different size allowance, supplier stock exhausted or earlier deadline. Re-evaluate affected plans and explain why the previous winner changed. Deterministic tools calculate all numerical claims; Gemini interprets, proposes within bounds and explains.
5. At completion, compare actual quantities, spoilage and time with the estimate. Use enough observed comparable batches before recalibrating estimates. No claims of learning from a synthetic result.

Reuse the real MCP tool interface, but do not expose tool names/agent traces as the main user experience. No model calls for animation, camera controls, arithmetic, navigation or routine checkout. Cache unchanged requests; retain manual entry and explicit provider-failure states.

## Shop bridge
One known material supplier / cutting studio first, rather than an unimplemented multi-seller marketplace. The operator needs:
- confirmed stock lots with actual usable dimensions, material/thickness, quantities, condition and prices;
- explicitly offered cutting services with supported geometry, price, capacity and availability;
- incoming paid shortfall orders with exact pick lists, part labels and preparation/cutting ticket;
- preparation -> ready -> collected status, with order ownership and one-use code;
- stock reservation and revision-driven replanning so buyers cannot purchase an obsolete plan.

Reuse the stock editor and fulfillment routes already present. V2 currently buys whole sheets only: quoting and fulfilling an actual cutting service is new work and must not be advertised before implemented. Shop navigation is currently exposed to buyers even though its controls are correctly permission restricted; fix the navigation.

## Payment and commercial path
PayPal pays for the exact supplier material shortfall and implemented services. No purchase when owned stock covers the plan. Server freezes the selected plan, recalculates the authoritative quote, reserves stock and verifies captured amount/currency/seller before fulfillment. A customer order's stated selling value is planning input, not a customer invoice or revenue actually collected by ScrapDrop. Do not claim escrow or multi-seller payouts.

Local sandbox practice: npm run sandbox:practice, with SCRAPDROP_DEMO_PORT and SCRAPDROP_DEMO_DB overrides. Credentials remain in ignored .env; simulated-payment endpoint disabled. A PayPal personal sandbox buyer approves checkout; the associated business sandbox seller receives it. App login accounts are separate. Hosted webhook ID/URL must match the actual publicly reachable listener. Local authentication alone does not verify webhook delivery.

## Proof before expanding
Use one real short-run paper/card customer order and measured real stock. Compare an operator's usual method with ScrapDrop: planning/quoting time, material cash outlay, setup/production time, shortages, spoilage and completed quantity. Include labor cost and supplier effort; inexpensive material savings alone may not justify the product.

A compelling demonstration: incoming brief -> feasible alternatives -> one constraint change -> changed allocation/schedule -> genuine PayPal sandbox shortfall purchase -> supplier preparation -> assembly ticket -> actual outcome. 3D is a construction check where useful, not the product's headline.

If actual users do not value the combined workflow beyond their existing spreadsheet/cutting tool, pivot before adding more product templates or sponsor panels. The next implementation should prove this vertical slice, not expand to arbitrary CAD or an unrestricted manufacturing agent.

## Delivery sequence
1. Shared job shell, legacy adapters, unified navigation and role-correct shop access.
2. Clarification-first brief and validated scenario comparison using the Gemini/MCP bridge.
3. Supplier stock/service constraints, production tickets and exact shortfall commerce.
4. Genuine sandbox approval/capture and hosted webhook verification.
5. Physical sample/user trial and before/after evidence, then targeted E2E regression.

References: https://www.cutlistoptimizer.com/ ; https://optitex.com/products/cutplan/
