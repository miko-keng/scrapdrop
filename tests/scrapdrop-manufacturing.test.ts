import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { openStore } from "../server/store";
import { initMarket } from "../server/market/store";
import {
  initScrap,
  inventory,
  saveOwned,
  ownedMaterials,
  reserveKit,
  lockCapture,
  finalizeKit,
  quoteSnapshot,
} from "../server/scrapdrop/store";
import {
  compileRecipe,
  exampleJob,
  planJob,
  validateRecipe,
  validateSchedule,
  scheduleOperations,
  manufacturingKit,
  jobSchema,
  type Job,
} from "../src/scrapdrop/manufacturing/engine";
import {
  createManufacturingServer,
  connectManufacturing,
} from "../server/scrapdrop/manufacturing/mcp";
import {
  initManufacturing,
  saveJob,
  getJob,
  jobDTO,
  saveProgress,
  finishJob,
  analytics,
} from "../server/scrapdrop/manufacturing/store";
import { registerManufacturing } from "../server/scrapdrop/manufacturing/routes";
import { planWithAgent } from "../server/scrapdrop/manufacturing/agent";
import { setAITransportForTests } from "../server/ai-mode";
const setup = () => {
  const db = openStore(":memory:");
  initMarket(db);
  initScrap(db);
  initManufacturing(db);
  return db;
};
function saveInput(
  db: ReturnType<typeof setup>,
  owner = "maker",
  input: Job = exampleJob(),
) {
  const shelf = saveOwned(
    db,
    owner,
    ownedMaterials(db, owner).revision,
    input.owned,
  );
  return { ...input, owned: shelf.materials, ownedRevision: shelf.revision };
}
function completeBody(j: any) {
  return {
    revision: j.revision,
    products: j.plan.input.products.map((p: any) => ({
      id: p.id,
      good: p.quantity,
      spoiled: 0,
    })),
    minutes: j.plan.minutes + 5,
    sellingPrice: 300,
    laborRate: 1200,
    ownedCost: 500,
    consumables: 50,
    fees: 0,
    offcuts: [],
  };
}

test("V2 construction families compile personalized panels, folds, holes and steps from one definition", () => {
  for (const family of ["flat", "folded", "sleeve"] as const) {
    const p = {
      id: "one",
      name: "Test",
      family,
      width: 70,
      length: 50,
      depth: 15,
      quantity: 3,
      hole: true,
    };
    const a = compileRecipe(p),
      b = compileRecipe({ ...p, width: 90, length: 80 });
    assert.deepEqual(validateRecipe(a), []);
    assert.equal(a.evidence, "prototype");
    assert.notDeepEqual(a.blank, b.blank);
    assert.ok(a.steps.some((s) => s.action.includes("3")));
    assert.equal(
      a.panels.length,
      family === "flat" ? 1 : family === "folded" ? 2 : 5,
    );
    assert.equal(a.holes.length, family === "flat" ? 1 : 0);
    if (family === "sleeve") {
      assert.equal(a.blank.length, 2 * (50 + 2) + 2 * (15 + 2) + 10);
      assert.ok(a.tools.includes("glue"));
    }
    const corrupt = structuredClone(a);
    corrupt.panels[0].width = 1000;
    assert.ok(validateRecipe(corrupt).length);
  }
  assert.throws(() =>
    compileRecipe({ ...exampleJob().products[0], family: "chair" }),
  );
});

test("mixed sheets conserve demand, avoid overlaps, respect owned-first and exact material purchases", () => {
  const db = setup(),
    p = planJob(exampleJob(), inventory(db));
  assert.ok(p.ready);
  assert.equal(p.usedOwned, 4);
  assert.equal(p.usedShop, 1);
  assert.equal(p.total, 170);
  assert.equal(p.sheets.flatMap((s) => s.placements).length, 48);
  assert.equal(
    new Set(p.sheets.flatMap((s) => s.placements.map((p) => p.partId))).size,
    48,
  );
  for (const sheet of p.sheets) {
    for (const a of sheet.placements) {
      assert.ok(
        a.x >= 2 &&
          a.y >= 2 &&
          a.x + a.width <= sheet.width - 2 &&
          a.y + a.length <= sheet.length - 2,
      );
      for (const b of sheet.placements)
        if (a !== b)
          assert.ok(
            a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.length <= b.y ||
              b.y + b.length <= a.y,
          );
    }
    assert.ok(sheet.remaining.every((f) => f.width > 0 && f.length > 0));
  }
  assert.equal(
    p.total,
    p.lines.reduce((n, l) => n + l.total, 0),
  );
  assert.equal(
    p.lines.reduce((n, l) => n + l.units, 0),
    p.usedShop,
  );
  assert.ok(p.cashAvoided !== null);
  db.close();
});

test("input variations: quantity, dimensions, budget, tools, thickness, color, rotations and unsupported variants", () => {
  const db = setup(),
    stock = inventory(db),
    j = exampleJob();
  for (const quantity of [1, 4, 40, 100]) {
    const job = { ...j, products: [{ ...j.products[0], quantity }] };
    const p = planJob(job, stock);
    assert.equal(
      p.sheets.flatMap((s) => s.placements).length + p.unplaced.length,
      quantity,
    );
  }
  for (const width of [20, 80, 280, 500]) {
    const p = planJob({ ...j, products: [{ ...j.products[2], width }] }, stock);
    assert.ok(p.ready || p.violations.length);
  }
  assert.ok(
    planJob({ ...j, budget: 0 }, stock).violations.some((v) =>
      v.includes("budget"),
    ),
  );
  assert.ok(
    planJob({ ...j, availableMinutes: 1 }, stock).violations.some((v) =>
      v.includes("time"),
    ),
  );
  assert.ok(
    planJob({ ...j, tools: ["ruler", "scissors"] }, stock).violations.some(
      (v) => v.includes("glue"),
    ),
  );
  assert.ok(planJob({ ...j, thickness: 1.5 }, stock).unplaced.length);
  assert.ok(
    planJob({ ...j, mixColors: false, color: "#000000" }, stock).unplaced
      .length,
  );
  assert.throws(() =>
    jobSchema.parse({ ...j, products: [j.products[0], j.products[0]] }),
  );
  const fit = {
    ...j,
    owned: [{ ...j.owned[0], width: 64, length: 44, quantity: 1 }],
    products: [{ ...j.products[1], width: 40, length: 60, quantity: 1 }],
    rotate: true,
  };
  assert.ok(planJob(fit, []).ready);
  assert.ok(!planJob({ ...fit, rotate: false }, []).ready);
  assert.ok(
    !planJob({ ...fit, owned: [{ ...fit.owned[0], width: 63 }] }, []).ready,
  );
  db.close();
});

test("serial scheduling honors predecessor, exclusive resources and daily workshop windows", () => {
  const ops = [
    {
      id: "a",
      name: "Cut",
      minutes: 300,
      predecessors: [],
      resources: ["maker", "cutter"],
    },
    {
      id: "b",
      name: "Fold",
      minutes: 300,
      predecessors: ["a"],
      resources: ["maker"],
    },
  ];
  const slots = scheduleOperations(ops);
  assert.equal(slots[1].start, 1440);
  assert.deepEqual(validateSchedule(slots), []);
  assert.ok(
    validateSchedule([{ ...slots[0] }, { ...slots[1], start: 10, end: 310 }])
      .length,
  );
  assert.throws(() =>
    scheduleOperations([{ ...ops[0], predecessors: ["missing"] }]),
  );
  assert.ok(
    validateSchedule([{ ...slots[0], start: 400, end: 700 }]).some((v) =>
      v.includes("workshop"),
    ),
  );
});

test("real MCP handshake discovers scoped tools/resources and rejects invalid arguments", async () => {
  const db = setup(),
    s = await connectManufacturing(exampleJob(), inventory(db));
  try {
    const tools = await s.client.listTools();
    assert.equal(tools.tools.length, 8);
    assert.ok(tools.tools.some((t) => t.name === "solveSharedSheets"));
    const result = await s.client.callTool({
      name: "solveSharedSheets",
      arguments: {},
    });
    const p = JSON.parse((result.content as any)[0].text);
    assert.ok(p.ready);
    assert.equal(p.total, 170);
    const invalid = await s.client.callTool({
      name: "compileRecipe",
      arguments: { products: [{ family: "chair" }] },
    });
    assert.equal(invalid.isError, true);
    const r = await s.client.readResource({ uri: "scrapdrop://constructions" });
    assert.ok((r.contents[0] as any).text.includes("sleeve"));
    assert.equal(
      createManufacturingServer({ ...exampleJob(), owned: [] }, []).context.job
        .owned.length,
      0,
    );
  } finally {
    await s.close();
    db.close();
  }
});

test("fixture agent uses MCP tools without provider calls, unsupported requests do not become boxes, cache is scoped", async () => {
  const db = setup();
  let calls = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    throw Error("Unexpected fixture network access.");
  };
  const old = process.env.AI_MODE;
  process.env.AI_MODE = "fixture";
  try {
    const a = await planWithAgent(
      db,
      "fixture",
      exampleJob(),
      "Make a phone stand, no glue",
    );
    assert.equal(a.source, "fixture");
    assert.match(a.message, /outside/);
    assert.equal(a.trace.length, 8);
    assert.ok(a.trace.some((t) => t.tool === "solveSharedSheets"));
    const b = await planWithAgent(
      db,
      "fixture",
      exampleJob(),
      "Make a phone stand, no glue",
    );
    assert.equal(b.cached, true);
    const c = await planWithAgent(
      db,
      "someone-else",
      exampleJob(),
      "Make a phone stand, no glue",
    );
    assert.equal(c.cached, false);
    assert.equal(calls, 0);
  } finally {
    process.env.AI_MODE = old;
    globalThis.fetch = oldFetch;
    db.close();
  }
});

test("mocked Gemini function-calling rounds execute real MCP results, cache and enforce a bounded repair", async () => {
  const db = setup();
  let calls = 0;
  setAITransportForTests(async (_url, init) => {
    calls++;
    const b = JSON.parse(init!.body as string);
    assert.ok(
      b.tools[0].functionDeclarations.some(
        (f: any) => f.name === "compileRecipe",
      ),
    );
    const parts =
      calls === 1
        ? [
            { functionCall: { name: "inspectCapabilities", args: {} } },
            {
              functionCall: {
                name: "compileRecipe",
                args: { products: exampleJob().products },
              },
            },
          ]
        : calls === 2
          ? [{ functionCall: { name: "solveSharedSheets", args: {} } }]
          : [
              {
                text: "The calculated material shortfall is shown in your plan.",
              },
            ];
    return Response.json({
      candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }],
    });
  });
  try {
    const result = await planWithAgent(
      db,
      "mock-agent",
      exampleJob(),
      "Use the current dimensions and quantities, check materials.",
    );
    assert.equal(result.source, "gemini");
    assert.equal(calls, 3);
    assert.equal(result.plan.total, 170);
    assert.ok(result.trace.some((t) => t.tool === "solveSharedSheets"));
    await planWithAgent(
      db,
      "mock-agent",
      exampleJob(),
      "Use the current dimensions and quantities, check materials.",
    );
    assert.equal(calls, 3);
  } finally {
    setAITransportForTests();
    db.close();
  }
});

test("saved V2 snapshots and progress isolate users, preserve versions and reject stale tabs", () => {
  const db = setup(),
    j = saveJob(db, "maker", saveInput(db));
  assert.equal(j.plan.version, 2);
  assert.throws(() => getJob(db, "other", j.id), /not found/);
  const next = saveProgress(db, "maker", j.id, {
    revision: 0,
    product: 2,
    step: 3,
  });
  assert.equal(next.progress.step, 3);
  assert.throws(
    () => saveProgress(db, "maker", j.id, { revision: 0, product: 0, step: 1 }),
    /another window/,
  );
  assert.throws(
    () =>
      saveProgress(db, "maker", j.id, { revision: 1, product: 100, step: 1 }),
    /Unknown/,
  );
  assert.deepEqual(next.plan, j.plan);
  const changed = { ...j.plan.input, width: 9 };
  assert.throws(() => saveJob(db, "maker", changed));
  db.close();
});

test("composite material quote uses existing reservation/capture and freezes the purchased recipe", () => {
  const db = setup(),
    input = saveInput(db),
    j = saveJob(db, "maker", input);
  const kit = manufacturingKit(j.plan, inventory(db));
  kit.manufacturingJobId = j.id;
  const quote = quoteSnapshot(db, "maker", kit);
  const o = reserveKit(db, "maker", quote.id, "mfg-checkout-123");
  assert.equal(JSON.parse(o.body).manufacturing.recipes.length, 3);
  assert.equal(
    db.prepare("SELECT order_id FROM sd_mfg_jobs WHERE id=?").get(j.id)!
      .order_id,
    o.id,
  );
  assert.equal(reserveKit(db, "maker", quote.id, "mfg-checkout-123").id, o.id);
  assert.throws(
    () => reserveKit(db, "maker", quote.id, "another-checkout"),
    /checkout/,
  );
  db.prepare(
    "UPDATE sd_orders SET payment='awaiting_buyer',merchant='fixture-shop' WHERE id=?",
  ).run(o.id);
  lockCapture(db, o.id);
  const obs = {
    id: "MFG-CAPTURE",
    amount: (j.plan.total / 100).toFixed(2),
    currency: "USD",
    merchant: "fixture-shop",
    status: "COMPLETED",
  };
  finalizeKit(db, o.id, obs);
  finalizeKit(db, o.id, obs);
  assert.equal(db.prepare("SELECT count(*) n FROM sd_captures").get()!.n, 1);
  assert.throws(() => finishJob(db, "maker", j.id, completeBody(j)), /Collect/);
  db.prepare("UPDATE sd_orders SET fulfillment='collected' WHERE id=?").run(
    o.id,
  );
  const done = finishJob(db, "maker", j.id, completeBody(j));
  assert.ok(done.results);
  assert.equal(
    done.results.cost,
    j.plan.total + 500 + 50 + Math.round(((j.plan.minutes + 5) * 1200) / 60),
  );
  const owned = ownedMaterials(db, "maker");
  assert.equal(owned.materials[0].quantity, 0);
  finishJob(db, "maker", j.id, completeBody(j));
  assert.deepEqual(ownedMaterials(db, "maker"), owned);
  assert.equal(analytics(db, "maker", false)[0].status, "Actual recorded");
  assert.equal(analytics(db, "other", false).length, 0);
  db.close();
});

test("no-purchase plans finalize without PayPal; offcut geometry/quantity rollback and credits are exactly once", () => {
  const db = setup();
  const input = {
    ...exampleJob(),
    products: [{ ...exampleJob().products[1], quantity: 1 }],
    owned: [{ ...exampleJob().owned[0], quantity: 1 }],
  };
  const j = saveJob(db, "maker", saveInput(db, "maker", input));
  assert.equal(j.plan.total, 0);
  const b = completeBody(j),
    before = ownedMaterials(db, "maker");
  assert.throws(
    () =>
      finishJob(db, "maker", j.id, {
        ...b,
        offcuts: [{ sheetId: j.plan.sheets[0].id, width: 3000, length: 3000 }],
      }),
    /offcut/,
  );
  assert.deepEqual(ownedMaterials(db, "maker"), before);
  assert.equal(jobDTO(getJob(db, "maker", j.id)).results, null);
  const free = j.plan.sheets[0].remaining.find(
    (r) => r.width >= 10 && r.length >= 10,
  )!;
  const good = {
    ...b,
    offcuts: [
      {
        sheetId: j.plan.sheets[0].id,
        width: Math.floor(free.width),
        length: Math.floor(free.length),
      },
    ],
  };
  const done = finishJob(db, "maker", j.id, good);
  assert.equal(done.results.good, 1);
  assert.equal(ownedMaterials(db, "maker").materials.length, 2);
  finishJob(db, "maker", j.id, good);
  assert.equal(ownedMaterials(db, "maker").materials.length, 2);
  assert.throws(
    () => finishJob(db, "maker", j.id, { ...good, minutes: 1 }),
    /finalized/,
  );
  db.close();
});

test("HTTP manufacturing permissions, immutable job quotes, schedule conflicts and stale revisions", async () => {
  const db = setup(),
    app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.learner = req.headers["x-owner"] || "anonymous";
    next();
  }); // accountId resolves guest sessions; explicit accounts below.
  for (const who of ["maker", "operator", "other"]) {
    db.prepare("INSERT INTO market_accounts VALUES(?,?,?,?,?)").run(
      who,
      who + "@example.test",
      who,
      "not-used",
      Date.now(),
    );
  }
  const old = process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID;
  process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID = "operator";
  // accountId expects market_sessions, use its actual schema mapping.
  const { accountId } = await import("../server/market/store");
  app.use((_req, res, next) => {
    if (!accountId(db, res.locals.learner))
      db.prepare("INSERT OR IGNORE INTO market_bindings VALUES(?,?)").run(
        res.locals.learner,
        res.locals.learner,
      );
    next();
  });
  registerManufacturing(app, db, () => {});
  app.use((e: any, _req: any, res: any, _next: any) =>
    res.status(e.status || 400).json({ error: e.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/scrapdrop/manufacturing`;
  const request = (
    url: string,
    owner: string,
    body?: unknown,
    method = "POST",
  ) =>
    fetch(base + url, {
      method: body === undefined ? "GET" : method,
      headers: { "Content-Type": "application/json", "x-owner": owner },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  try {
    const j = saveJob(db, "maker", saveInput(db));
    assert.equal((await request(`/jobs/${j.id}`, "other")).status, 404);
    assert.equal((await request("/schedule", "maker")).status, 403);
    assert.equal((await request("/analytics", "other")).status, 200);
    const intervals = j.plan.schedule.map((s) => ({
      id: s.id,
      start: s.start,
      end: s.end,
    }));
    assert.equal(
      (
        await request(
          "/schedule",
          "operator",
          { revision: 0, jobs: [{ id: j.id, intervals }] },
          "PUT",
        )
      ).status,
      200,
    );
    assert.equal(
      (await request("/schedule", "operator", { revision: 0, jobs: [] }, "PUT"))
        .status,
      409,
    );
    const bad = intervals.map((s, i) =>
      i ? { ...s, start: 0, end: j.plan.operations[i].minutes } : s,
    );
    assert.equal(
      (
        await request(
          "/schedule",
          "operator",
          { revision: 1, jobs: [{ id: j.id, intervals: bad }] },
          "PUT",
        )
      ).status,
      409,
    );
    assert.equal(
      (await request(`/jobs/${j.id}/quote`, "other", { pickupSlotId: "bad" }))
        .status,
      404,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID = old;
    db.close();
  }
});

test("agent sees deterministic failure feedback and repairs only once through real MCP tools", async () => {
  const db = setup();
  const input = {
    ...exampleJob(),
    tools: ["scissors", "ruler"] as Job["tools"],
    products: [{ ...exampleJob().products[2], hole: false }],
  };
  let calls = 0;
  setAITransportForTests(async (_url, init) => {
    calls++;
    const body = JSON.parse(init!.body as string);
    if (calls === 2)
      assert.ok(JSON.stringify(body.contents).includes("Missing tool: glue"));
    const parts =
      calls === 1
        ? [
            {
              functionCall: {
                name: "compileRecipe",
                args: { products: input.products },
              },
            },
          ]
        : calls === 2
          ? [
              {
                functionCall: {
                  name: "compileRecipe",
                  args: {
                    products: input.products.map((p) => ({
                      ...p,
                      family: "flat",
                    })),
                  },
                },
              },
            ]
          : [
              {
                text: "A flat insert is feasible; the glued sleeve is not possible with your tools.",
              },
            ];
    return Response.json({
      candidates: [{ finishReason: "STOP", content: { role: "model", parts } }],
    });
  });
  try {
    const r = await planWithAgent(
      db,
      "repair-check",
      input,
      "Keep the quantity and dimensions. If a sleeve requires glue, change it to a flat insert instead.",
    );
    assert.ok(r.plan.ready);
    assert.equal(r.plan.recipes[0].product.family, "flat");
    const checks = r.trace
      .filter((t) => t.tool === "solveSharedSheets")
      .map((t) => t.result as any);
    assert.equal(checks[0].ready, false);
    assert.equal(checks[1].ready, true);
    assert.equal(calls, 3);
  } finally {
    setAITransportForTests();
    db.close();
  }
});

test("two manufacturing jobs cannot share the same exclusive cutter time", () => {
  const a = scheduleOperations([
    {
      id: "job-a",
      name: "Cut A",
      minutes: 15,
      predecessors: [],
      resources: ["maker", "cutter"],
    },
    {
      id: "job-b",
      name: "Cut B",
      minutes: 20,
      predecessors: [],
      resources: ["maker", "cutter"],
    },
  ]);
  assert.equal(a[1].start, 15);
  assert.deepEqual(validateSchedule(a), []);
  assert.ok(
    validateSchedule([a[0], { ...a[1], start: 0, end: 20 }]).includes(
      "Exclusive resource overlap.",
    ),
  );
});
