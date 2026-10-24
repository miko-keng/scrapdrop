import { setAITransportForTests } from "../server/ai-mode";
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftDefinition, mapBrief } from "../server/expert-ai";
import { studioDefinition, starterInput } from "../src/shared/expert";
function provider(t: any, output: object) {
  const original = globalThis.fetch,
    key = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only";
  setAITransportForTests((async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.ok(body.generationConfig.responseJsonSchema);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(output) }] },
          },
        ],
      }),
    );
  }) as typeof fetch);
  t.after(() => {
    setAITransportForTests();
    if (key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = key;
  });
}
test("creator AI cannot introduce executable fields into the method schema", async (t) => {
  provider(t, { ...studioDefinition, code: "dangerous()" });
  await assert.rejects(
    draftDefinition("Use an hourly rate and revision rounds.", "Test studio"),
  );
});
test("creator AI unsupported methods are surfaced without publishing", async (t) => {
  provider(t, {
    unsupported: true,
    reason: "Tiered tax rules are not supported.",
  });
  await assert.rejects(
    draftDefinition(
      "Use complex tiered tax rules for a project.",
      "Test studio",
    ),
    /not supported/,
  );
});
test("buyer AI mappings reject negative effort and unexpected executable fields", async (t) => {
  provider(t, {
    input: {
      ...starterInput(),
      items: [{ name: "Work", hours: -1 }],
      code: "eval()",
    },
    clarification: null,
    assumptions: [],
  });
  await assert.rejects(mapBrief("Quote a new project", studioDefinition));
});
