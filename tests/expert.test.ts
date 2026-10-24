import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateQuote,
  checkExamples,
  studioDefinition,
  starterExamples,
  starterInput,
} from "../src/shared/expert";
import { definitionSchema, quoteInputSchema } from "../server/expert-ai";

test("expert quote: known project, revision boundaries, contingency and expenses", () => {
  assert.equal(
    calculateQuote(studioDefinition, starterInput()).total,
    "2010.50",
  );
  const included = calculateQuote(studioDefinition, {
    ...starterInput(),
    revisions: 2,
  });
  assert.equal(included.extraRevisions, 0);
  assert.equal(included.total, "1796.00");
  assert.equal(
    calculateQuote(studioDefinition, { ...starterInput(), revisions: 0 }).total,
    included.total,
  );
  assert.equal(
    calculateQuote(
      { ...studioDefinition, bufferPercent: 0 },
      { ...starterInput(), expenses: 0 },
    ).total,
    "1755.00",
  );
});
test("expert quote: displayed rounded line amounts reconcile to the total", () => {
  const result = calculateQuote(
    { ...studioDefinition, bufferPercent: 0 },
    {
      ...starterInput(),
      rate: 0.05,
      revisions: 0,
      expenses: 0,
      items: [
        { name: "A", hours: 0.1 },
        { name: "B", hours: 0.1 },
      ],
    },
  );
  assert.equal(result.lines[0].amount, "0.01");
  assert.equal(result.total, "0.02");
});
test("expert quote: invalid numbers, unsafe ranges and empty projects are rejected", () => {
  for (const change of [
    { rate: -1 },
    { rate: Infinity },
    { expenses: 1000001 },
    { revisions: 1.5 },
    { items: [] },
    { items: [{ name: "", hours: 1 }] },
    { items: [{ name: "Work", hours: NaN }] },
  ])
    assert.throws(() =>
      calculateQuote(studioDefinition, { ...starterInput(), ...change }),
    );
  assert.equal(
    quoteInputSchema.safeParse({ ...starterInput(), surpriseRule: "eval(1)" })
      .success,
    false,
  );
  assert.equal(
    definitionSchema.safeParse({ ...studioDefinition, code: "eval(1)" })
      .success,
    false,
  );
});
test("expert examples: pass known answers and report mismatches without rewriting expectations", () => {
  const examples = starterExamples();
  assert.ok(checkExamples(studioDefinition, examples).every((c) => c.passed));
  examples[0].expectedTotal = "1.00";
  const checks = checkExamples(studioDefinition, examples);
  assert.equal(checks[0].passed, false);
  assert.equal(checks[0].expected, "1.00");
  assert.equal(checks[0].actual, "2010.50");
});

const base = process.env.TEST_EXPERT_URL;
async function client() {
  let cookie = "",
    csrf = "";
  return async (path: string, method = "GET", body?: object) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        Cookie: cookie,
        Origin: base!,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie")!.split(";")[0];
    const data = response.headers.get("content-type")?.includes("json")
      ? await response.json()
      : await response.text();
    if (path === "/api/config") csrf = data.csrf;
    return { status: response.status, data };
  };
}
test(
  "expert HTTP: creator checks, immutable publication, buyer access, quote revisions and safe exports",
  { skip: !base },
  async () => {
    const creator = await client(),
      buyer = await client(),
      other = await client();
    await creator("/api/config");
    await buyer("/api/config");
    await other("/api/config");
    const content = {
      definition: { ...studioDefinition, creator: "Integration Test Studio" },
      method:
        "Multiply hours by rate, add extra revision labour and a 10% contingency to labour, then add expenses.",
      examples: starterExamples(),
    };
    const created = await creator("/api/expert/drafts", "POST", content);
    assert.equal(created.status, 200);
    const draftId = created.data.id;
    assert.equal((await other("/api/expert/drafts/" + draftId)).status, 404);
    const invalid = structuredClone(content);
    invalid.examples[0].expectedTotal = "1.00";
    const savedBad = await creator(
      `/api/expert/drafts/${draftId}/save`,
      "POST",
      { ...invalid, revision: 0 },
    );
    assert.equal(savedBad.status, 200);
    assert.equal(
      (
        await creator(`/api/expert/drafts/${draftId}/publish`, "POST", {
          revision: savedBad.data.revision,
        })
      ).status,
      400,
    );
    const saved = await creator(`/api/expert/drafts/${draftId}/save`, "POST", {
      ...content,
      revision: savedBad.data.revision,
    });
    assert.equal(saved.status, 200);
    assert.equal(
      (
        await creator(`/api/expert/drafts/${draftId}/save`, "POST", {
          ...content,
          revision: 0,
        })
      ).status,
      409,
    );
    const validation = await creator("/api/expert/validate", "POST", content);
    assert.equal(validation.data.passed, true);
    const published = await creator(
      `/api/expert/drafts/${draftId}/publish`,
      "POST",
      { revision: saved.data.revision },
    );
    assert.equal(published.status, 200);
    assert.equal(published.data.version, 1);
    assert.equal(published.data.owned, true);
    const toolId = published.data.id;
    assert.equal(
      (await buyer(`/api/expert/tools/${toolId}`)).data.owned,
      false,
    );
    const quoteContent = {
      toolId,
      version: 1,
      input: {
        ...starterInput(),
        project: "=SUM(1,2)",
        client: "<script>alert(1)</script>",
      },
      brief: "A project to test preservation",
    };
    assert.equal(
      (await buyer("/api/expert/quotes", "POST", quoteContent)).status,
      403,
    );
    assert.equal(
      (await buyer(`/api/expert/tools/${toolId}/demo-access`, "POST", {}))
        .status,
      200,
    );
    const q = await buyer("/api/expert/quotes", "POST", quoteContent);
    assert.equal(q.status, 200);
    assert.equal(q.data.result.total, "2010.50");
    assert.equal((await other("/api/expert/quotes/" + q.data.id)).status, 404);
    assert.equal(
      (
        await buyer(`/api/expert/quotes/${q.data.id}/save`, "POST", {
          input: quoteContent.input,
          revision: 99,
        })
      ).status,
      409,
    );
    const exported = await buyer(`/api/expert/quotes/${q.data.id}/export`);
    assert.equal(exported.status, 200);
    assert.ok(exported.data.includes("'=SUM(1,2)"));
    const printed = await buyer(`/api/expert/quotes/${q.data.id}/print`);
    assert.equal(printed.status, 200);
    assert.ok(printed.data.includes("&lt;script&gt;"));
    assert.ok(!printed.data.includes("<script>alert(1)</script>"));
    const latestDraft = await creator(`/api/expert/drafts/${draftId}`);
    const next = structuredClone(content);
    next.definition.bufferPercent = 20;
    next.examples[0].expectedTotal = "2186.00";
    next.examples[1].expectedTotal = "625.00";
    const savedNext = await creator(
      `/api/expert/drafts/${draftId}/save`,
      "POST",
      { ...next, revision: latestDraft.data.revision },
    );
    assert.equal(savedNext.status, 200);
    const v2 = await creator(`/api/expert/drafts/${draftId}/publish`, "POST", {
      revision: savedNext.data.revision,
    });
    assert.equal(v2.status, 200);
    assert.equal(v2.data.version, 2);
    const old = await buyer("/api/expert/quotes/" + q.data.id);
    assert.equal(old.data.tool.version, 1);
    assert.equal(old.data.result.total, "2010.50");
    assert.equal((await buyer(`/api/expert/tools/${toolId}`)).data.version, 2);
    assert.equal(
      (await buyer(`/api/expert/tools/${toolId}?version=1`)).data.definition
        .bufferPercent,
      10,
    );
    const workspace = await buyer("/api/expert/workspace");
    assert.ok(workspace.data.quotes.some((x: any) => x.id === q.data.id));
    const malicious = await creator("/api/expert/validate", "POST", {
      ...content,
      definition: { ...content.definition, expression: "process.exit()" },
    });
    assert.equal(malicious.status, 400);
  },
);
