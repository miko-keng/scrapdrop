# Manufacturing demo practice — under three minutes

Use a clean local demo database so prior tests do not change stock:

```sh
SCRAPDROP_DEMO_DB=.data/manufacturing-practice.sqlite npm run demo
```

Open http://127.0.0.1:4321/production. Sign in as maker@scrapdrop.test with MakeSomething123!. AI is in fixture mode and payments are explicitly simulated. This practice route is not proof of real PayPal sandbox capture or live Gemini reasoning.

## 0:00–0:25 — establish the problem

“Small sellers already have useful leftover card. Working out the products, sheet layouts and missing supplies separately costs time and creates avoidable purchases.”

Click Load retail-set example. Point out 12 price displays, 24 tags, 12 sleeves and four measured owned sheets. These are three different constructions from shared panel rules.

## 0:25–0:55 — make a constraint visible

Uncheck glue and compare. Show that the sleeve is blocked; the app does not invent an untested closure. Restore glue and compare again.

With clean seeded stock, the result uses four owned sheets and purchases one additional sheet for $1.70. Open the shared sheet diagrams. Cash avoided is a material-purchase comparison, not profit.

## 0:55–1:25 — inspect something that can be made

Open Learn to make this. Select Product sleeves, advance to Fold the panels and inspect the actual hinged panels. The fold marks, dimensions and steps come from the same recipe. State that physical validation is still pending; do not call the animation proof of a tested product.

Save the making plan and a tutorial step. A reload/resume restores the saved recipe and position.

## 1:25–1:55 — purchase only the shortfall

Choose a collection window and Buy only the shortfall. Show the one-sheet line, confirm tools and use the clearly labelled simulated payment for practice. The resulting order retains the manufacturing recipe and guide.

For the submission recording, use a separately verified real PayPal sandbox checkout instead; demonstrate the genuine buyer approval and server-confirmed payment state. Never imply the simulated button is PayPal.

## 1:55–2:35 — operator value

Sign out and sign in as studio@scrapdrop.test with MakeSomething123!. Open Plan production → Production & insights.

Schedule the saved job. Show the maker/cutter timeline, move cutting later and show dependent work shift. Validate/save. Open Production insights: estimates are separate from recorded results. Only show populated results when they have actually been entered; label seeded/synthetic examples as demo data.

## 2:35–2:55 — outcome and boundaries

“ScrapDrop connects the design, leftover allocation, exact purchase and making process. Changing a constraint changes the calculated plan. Production records let us compare estimates with what happened.”

For an agentic demonstration, prepare one bounded live Gemini run separately after deterministic checks. Use the tool trace as evidence; fixture narration is not a live agent demonstration. Do not try to squeeze every feature into the recording.
