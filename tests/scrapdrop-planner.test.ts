import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fixtureIntent,
  interpretProject,
  projectIntentSchema,
} from "../server/scrapdrop/intent";
import { openStore } from "../server/store";
import { initMarket } from "../server/market/store";
import { initScrap, inventory } from "../server/scrapdrop/store";
import { defaultConfig } from "../src/scrapdrop/model";
import {
  batchSchema,
  buildBatchKit,
  projectAlternatives,
} from "../src/scrapdrop/batch";
const now = Date.parse("2026-10-26T04:00:00Z");
function setup() {
  const db = openStore(":memory:");
  initMarket(db);
  initScrap(db);
  const stock = inventory(db),
    config = defaultConfig("bookmark", stock);
  const input = batchSchema.parse({
    config,
    quantity: 30,
    owned: [],
    availableMinutes: 500,
    deadline: "2099-01-01",
    tools: ["scissors", "ruler", "glue", "hole punch"],
  });
  return { db, stock, input };
}
test("project brief extracts explicit constraints without inventing targets or tools", () => {
  const d = fixtureIntent(
    "30 bookmarks under $10 by Friday. Minimum size 34 x 119 mm. Mixed colors are fine.",
    now,
  );
  assert.equal(d.templateId, "bookmark");
  assert.equal(d.quantity, 30);
  assert.equal(d.budget, 1000);
  assert.equal(d.deadline, "2026-10-30");
  assert.equal(d.minWidth, 34);
  assert.equal(d.minDepth, 119);
  assert.equal(d.width, null);
  assert.equal(d.availableMinutes, null);
  assert.equal(d.tools, null);
  assert.equal(d.mixedColors, true);
  assert.equal(
    fixtureIntent("one gift box before Friday", now).deadline,
    "2026-10-29",
  );
  const tools = fixtureIntent(
    "one gift box. I have scissors and ruler but not glue.",
    now,
  ).tools;
  assert.deepEqual(tools, ["scissors", "ruler"]);
  assert.deepEqual(
    fixtureIntent("one gift box. I have no scissors or glue.", now).tools,
    [],
  );
  const sizes = fixtureIntent(
    "30 bookmarks size 40 x 140 mm. Minimum 34 x 119 mm",
    now,
  );
  assert.equal(sizes.width, 40);
  assert.equal(sizes.minWidth, 34);
});
test("unsupported briefs and inconsistent model output cannot become a supported recipe", () => {
  assert.equal(
    fixtureIntent("Build furniture from leftover wood", now).supported,
    false,
  );
  assert.equal(
    fixtureIntent("Make electrical gift boxes", now).templateId,
    null,
  );
  assert.throws(() => fixtureIntent("999 bookmarks under $10", now));
  assert.equal(
    projectIntentSchema.safeParse({
      ...fixtureIntent("one gift box", now),
      supported: true,
      templateId: null,
    }).success,
    false,
  );
});
test("fixture interpretation makes zero model calls and asks for missing requirements", async () => {
  const { db } = setup();
  let calls = 0;
  const result = await interpretProject(
    db,
    "fixture-owner",
    "one gift box",
    now,
    async () => {
      calls++;
      throw Error("unexpected network");
    },
  );
  assert.equal(calls, 0);
  assert.equal(result.source, "fixture");
  assert.ok(result.questions.some((q) => q?.includes("tools")));
  assert.ok(result.questions.some((q) => q?.includes("deadline")));
  db.close();
});
test("comparison preserves dimensions and shades unless explicit flexibility is supplied", () => {
  const { db, stock, input } = setup();
  const result = projectAlternatives(input, stock);
  assert.equal(result.alternatives.length, 1);
  assert.deepEqual(result.alternatives[0].kit.config, {
    ...input.config,
    quantity: 30,
  });
  const flexible = {
    ...input,
    flexibility: { resize: true, minWidth: 34, minDepth: 119, minHeight: 2 },
  };
  for (const { kit } of projectAlternatives(flexible, stock).alternatives) {
    assert.ok(kit.config.width >= 34 && kit.config.width <= input.config.width);
    assert.ok(
      kit.config.depth >= 119 && kit.config.depth <= input.config.depth,
    );
    assert.equal(kit.config.height, input.config.height);
    assert.equal(kit.config.materialId, input.config.materialId);
    assert.equal(kit.batch!.input.quantity, 30);
    assert.equal(kit.batch!.input.deadline, input.deadline);
  }
  assert.equal(
    batchSchema.safeParse({
      ...flexible,
      flexibility: {
        ...flexible.flexibility,
        minWidth: input.config.width + 1,
      },
    }).success,
    false,
  );
  db.close();
});
test("missing tools block readiness, explicit arrangements persist and cutting does not invent tools", () => {
  const { db, stock, input } = setup();
  const without = {
    ...input,
    quantity: 1,
    tools: ["ruler", "hole punch"],
    cuttingService: true,
  };
  const blocked = buildBatchKit(without, stock);
  assert.ok(blocked.batch!.plan.missingTools.includes("glue"));
  assert.ok(blocked.batch!.plan.missingTools.includes("scissors"));
  assert.equal(blocked.batch!.plan.ready, false);
  const arranged = buildBatchKit(
    { ...without, toolsToGet: ["glue", "scissors"] },
    stock,
  );
  assert.equal(arranged.batch!.plan.ready, true);
  assert.deepEqual(arranged.batch!.plan.toolsToGet, ["scissors", "glue"]);
  assert.ok(arranged.warnings.some((w) => w.includes("not included")));
  db.close();
});
test("budget readiness includes cutting fee and does not change the material price", () => {
  const { db, stock, input } = setup();
  const plain = buildBatchKit({ ...input, quantity: 1 }, stock);
  const over = buildBatchKit(
    { ...input, quantity: 1, budget: plain.total, cuttingService: true },
    stock,
  );
  assert.equal(over.total, plain.total + 250);
  assert.equal(over.batch!.plan.budgetFits, false);
  assert.equal(over.batch!.plan.ready, false);
  const enough = buildBatchKit(
    { ...input, quantity: 1, budget: over.total, cuttingService: true },
    stock,
  );
  assert.equal(enough.batch!.plan.ready, true);
  db.close();
});

test("model interpretation validates structured output and reuses the identity-scoped cache", async () => {
  const { setAITransportForTests } = await import("../server/ai-mode");
  const { db } = setup();
  let calls = 0;
  setAITransportForTests(async () => {
    throw Error("direct network unexpected");
  });
  try {
    const transport = async () => {
      calls++;
      return JSON.stringify(fixtureIntent("30 bookmarks under $10", now));
    };
    const a = await interpretProject(
      db,
      "planner-cache-owner",
      "cache test for 30 bookmarks",
      now,
      transport,
    );
    const b = await interpretProject(
      db,
      "planner-cache-owner",
      "cache test for 30 bookmarks",
      now,
      transport,
    );
    assert.equal(a.source, "ai");
    assert.equal(a.cached, false);
    assert.equal(b.cached, true);
    assert.equal(calls, 1);
    await assert.rejects(() =>
      interpretProject(
        db,
        "planner-invalid-owner",
        "invalid model output",
        now,
        async () => JSON.stringify({ supported: true, templateId: null }),
      ),
    );
  } finally {
    setAITransportForTests();
    db.close();
  }
});
