import { setAITransportForTests } from "../server/ai-mode";
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, contextualHint } from "../server/ai";
import { sampleDatasets, defaultSettings } from "../src/shared/data";

function mockProvider(t: any, handler: typeof fetch) {
  const saved = process.env.GEMINI_API_KEY,
    model = process.env.GEMINI_MODEL,
    original = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-only-key";
  delete process.env.GEMINI_MODEL;
  setAITransportForTests(handler);
  t.after(() => {
    setAITransportForTests();
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
    if (model === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = model;
  });
}
const reply = (parts: object[], finishReason = "STOP") =>
  new Response(
    JSON.stringify({ candidates: [{ finishReason, content: { parts } }] }),
  );

test("Gemini receives schema-constrained task calls with a server-side key", async (t) => {
  const ds = sampleDatasets("summarise-sales");
  mockProvider(t, (async (url, init) => {
    assert.equal(
      url,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    );
    assert.equal((init?.headers as any)["x-goog-api-key"], "test-only-key");
    assert.ok(!String(url).includes("test-only-key"));
    const body = JSON.parse(String(init?.body));
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(
      body.generationConfig.responseJsonSchema.additionalProperties,
      false,
    );
    return reply([
      {
        text: JSON.stringify({
          lessonKey: "summarise-sales",
          summary: "Sales by product",
          rationale: "Group products and add sales.",
          clarification: null,
          unsupported: false,
          bindings: defaultSettings(ds, "summarise-sales"),
        }),
      },
    ]);
  }) as typeof fetch);
  const task = await analyse("Total sales for each product", ds);
  assert.equal(task.source, "ai");
  assert.equal(task.lessonKey, "summarise-sales");
});

test("Gemini hints exclude thought parts", async (t) => {
  mockProvider(t, (async () =>
    reply([
      { thought: true, text: "private reasoning" },
      { text: "Choose Product to group each product." },
    ])) as typeof fetch);
  const result = await contextualHint("Which group?", {}, "Choose Product.");
  assert.equal(result.source, "ai");
  assert.equal(result.hint, "Choose Product to group each product.");
});

test("Gemini rejects truncated structured output", async (t) => {
  mockProvider(t, (async () =>
    reply([{ text: "{}" }], "MAX_TOKENS")) as typeof fetch);
  await assert.rejects(
    analyse("Total sales", sampleDatasets("summarise-sales")),
    /did not finish/,
  );
});

test("Gemini errors do not expose provider response bodies", async (t) => {
  mockProvider(
    t,
    (async () =>
      new Response("private provider diagnostic", {
        status: 429,
      })) as typeof fetch,
  );
  await assert.rejects(
    contextualHint("Help", {}, "Group rows"),
    (error: any) =>
      /quota/.test(error.message) &&
      !error.message.includes("private provider"),
  );
});
