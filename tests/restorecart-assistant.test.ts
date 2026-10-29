import { test } from "node:test";
import assert from "node:assert/strict";
import { openRC, createIncident } from "../server/restorecart/store";
import { addSample } from "../server/restorecart/sources";
import { reconstruct } from "../server/restorecart/reconstruction";
import { assist } from "../server/restorecart/assistant";
async function sample() {
  const db = openRC(":memory:"),
    shop = createIncident(db, "Source-backed review");
  await addSample(db, shop.id);
  await reconstruct(db, shop.id);
  return { db, id: shop.id };
}
function transport(value: any, counter: { n: number }) {
  return (async () => {
    counter.n++;
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
}
test("Gemini catalog assistance validates cited prices and caches identical requests", async () => {
  const { db, id } = await sample();
  try {
    const source = (
      db.prepare("SELECT id FROM rc_sources WHERE mime='text/csv'").get() as any
    ).id;
    const counter = { n: 0 },
      result = {
        summary: "The blue mug has conflicting prices.",
        suggestions: [
          {
            sku: "MUG-BLU",
            field: "price",
            value: "20.00",
            reason: "Found in the stock sheet; confirm it is current.",
            sourceId: source,
            excerpt: "20.00",
          },
        ],
        questions: [
          { sku: "MUG-BLU", text: "Which source has the current price?" },
        ],
      };
    const call = transport(result, counter),
      first = await assist(db, id, "review", undefined, call),
      second = await assist(db, id, "review", undefined, call);
    assert.equal(first.source, "gemini");
    assert.equal(second.cached, true);
    assert.equal(counter.n, 1);
  } finally {
    db.close();
  }
});
test("Gemini catalog assistance withholds invented prices and uncited text", async () => {
  const { db, id } = await sample();
  try {
    const source = (
      db.prepare("SELECT id FROM rc_sources WHERE mime='text/csv'").get() as any
    ).id;
    for (const suggestion of [
      {
        sku: "MUG-BLU",
        field: "price",
        value: "0.01",
        reason: "guess",
        sourceId: source,
        excerpt: "20.00",
      },
      {
        sku: "MUG-BLU",
        field: "name",
        value: "Luxury cup",
        reason: "guess",
        sourceId: source,
        excerpt: "invented evidence",
      },
    ]) {
      db.prepare("DELETE FROM rc_cache").run();
      const result = await assist(
        db,
        id,
        "review",
        undefined,
        transport(
          {
            summary: "Untrusted proposal",
            suggestions: [suggestion],
            questions: [],
          },
          { n: 0 },
        ),
      );
      assert.equal(result.suggestions.length, 0);
      assert.equal(result.omittedSuggestions, 1);
      assert.equal(result.questions[0].sku, "MUG-BLU");
    }
  } finally {
    db.close();
  }
});

test("Gemini review sends actual owned image bytes and validates variant photo references", async () => {
  const { db, id } = await sample();
  try {
    const { readFileSync } = await import("node:fs");
    const { addSource } = await import("../server/restorecart/sources");
    const image = readFileSync(
      new URL("../examples/restorecart/blue-mug-evidence.png", import.meta.url),
    );
    const source = await addSource(db, id, {
      name: "MUG-BLU.png",
      data: image.toString("base64"),
    });
    const fake = (async (_url: any, options: any) => {
      const body = JSON.parse(options.body);
      const inline = body.contents[0].parts.find(
        (p: any) => p.inlineData,
      )?.inlineData;
      assert.equal(
        inline.mimeType,
        (
          db
            .prepare("SELECT mime FROM rc_sources WHERE id=?")
            .get(String(source.id)) as any
        ).mime,
      );
      assert.equal(inline.data, image.toString("base64"));
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      summary: "Confirm the supplied blue mug image.",
                      suggestions: [
                        {
                          sku: "MUG-BLU",
                          field: "imageSourceId",
                          value: source.id,
                          reason:
                            "Suggested exact variant; seller must confirm.",
                          sourceId: source.id,
                          excerpt: "Visual evidence from uploaded image",
                        },
                      ],
                      questions: [],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      );
    }) as typeof fetch;
    const answer = await assist(db, id, "review", undefined, fake);
    assert.equal(answer.suggestions[0].value, source.id);
  } finally {
    db.close();
  }
});

test("Gemini payment explanation cannot contradict unpaid facts or mutate an order", async () => {
  const { db, id } = await sample();
  try {
    db.prepare(
      "INSERT INTO rc_orders(id,incident,buyer,request_key,token,state,fulfillment,amount,expires,body) VALUES(?,?,?,?,?,'awaiting_buyer','unfulfilled',2000,?,?)",
    ).run(
      "explain-unit-order",
      id,
      "unit-buyer",
      "unit-payment-key",
      "private-unit-token",
      Date.now() + 60000,
      JSON.stringify({ lines: [] }),
    );
    const before = JSON.stringify(
      db
        .prepare("SELECT * FROM rc_orders WHERE id=?")
        .get("explain-unit-order"),
    );
    await assert.rejects(
      () =>
        assist(
          db,
          id,
          "payment",
          "explain-unit-order",
          transport(
            {
              explanation: "The payment is paid.",
              nextAction: "wait",
              uncertainty: "None",
            },
            { n: 0 },
          ),
        ),
      /conflicts with the verified payment status/,
    );
    const result = await assist(
      db,
      id,
      "payment",
      "explain-unit-order",
      transport(
        {
          explanation:
            "Buyer approval has not been confirmed in these records.",
          nextAction: "check_again",
          uncertainty:
            "Only a new verified provider response can establish a different status.",
        },
        { n: 0 },
      ),
    );
    assert.equal(result.facts.state, "awaiting_buyer");
    assert.equal(result.nextAction, "check_again");
    assert.equal(
      JSON.stringify(
        db
          .prepare("SELECT * FROM rc_orders WHERE id=?")
          .get("explain-unit-order"),
      ),
      before,
    );
  } finally {
    db.close();
  }
});
