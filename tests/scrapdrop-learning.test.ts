import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../server/store";
import { initMarket } from "../server/market/store";
import {
  initScrap,
  inventory,
  saveOwned,
  ownedMaterials,
  saveBatchJob,
} from "../server/scrapdrop/store";
import { defaultConfig, buildKit } from "../src/scrapdrop/model";
import { buildBatchKit, batchSchema } from "../src/scrapdrop/batch";
import {
  tutorialSteps,
  validateRecipe,
  giftBoxPanels,
  recipeCut,
} from "../src/scrapdrop/recipes";
import { emptyEconomics, economics } from "../src/scrapdrop/production";
import {
  registerLearning,
  initLearning,
  getLearning,
  saveProgress,
  saveResults,
  explainStep,
  cleanPhoto,
} from "../server/scrapdrop/learning";
import { setAITransportForTests } from "../server/ai-mode";
import { Group, Vector3 } from "three";
import express from "express";
function setup() {
  const db = openStore(":memory:");
  initMarket(db);
  initScrap(db);
  initLearning(db);
  const stock = inventory(db),
    config = defaultConfig("giftbox", stock),
    m = stock.find((m) => m.id === config.materialId)!,
    r = stock.find((m) => m.id === config.ribbonId)!;
  const input = batchSchema.parse({
    config,
    quantity: 3,
    ownedRevision: 0,
    owned: [
      {
        id: "card",
        name: "Measured card",
        type: "card",
        width: 200,
        length: 300,
        thickness: 1,
        quantity: 3,
        color: m.color,
      },
      {
        id: "ribbon",
        name: "Measured ribbon",
        type: "ribbon",
        width: 15,
        length: 2600,
        thickness: 1,
        quantity: 1,
        color: r.color,
      },
    ],
    tools: ["scissors", "ruler", "glue"],
    deadline: "2099-01-01",
    availableMinutes: 120,
  });
  const saved = saveOwned(db, "maker", 0, input.owned);
  input.ownedRevision = saved.revision;
  const job = saveBatchJob(db, "maker", input);
  return { db, stock, input, job };
}
test("shared recipe diagrams fit all supported designs, with nonoverlapping parts and required tab/hem folds", () => {
  const { db, stock } = setup();
  for (const template of ["giftbox", "wrap", "bookmark"] as const)
    for (const width of [40, 90, 150]) {
      const c = defaultConfig(template, stock);
      c.width = width;
      const fake = stock.map((m) => ({
        ...m,
        width: m.type === "ribbon" ? 15 : 2000,
        length: 3000,
        available: 100,
      }));
      const k = buildKit(c, fake);
      assert.equal(k.recipeVersion, 1);
      assert.equal(validateRecipe(k).valid, true);
      assert.equal(tutorialSteps(k).length, 8);
      if (template === "giftbox") {
        assert.equal(k.cut.folds.length, 9);
        assert.equal(
          k.cut.rects.filter((r) => r.label === "Glue tab").length,
          4,
        );
      }
      if (template === "wrap") assert.equal(k.cut.folds.length, 4);
    }
  db.close();
});
test("cutting-service instructions keep owned and detailed cutting work explicit", () => {
  const { db, input, stock } = setup();
  const k = buildBatchKit(
    { ...input, quantity: 4, cuttingService: true },
    stock,
  );
  assert.ok(tutorialSteps(k)[1].action.includes("precut"));
  assert.ok(tutorialSteps(k)[1].action.includes("owned sheets"));
  assert.ok(tutorialSteps(k)[1].action.includes("detailed"));
  db.close();
});
test("saved tutorial progress retains dimensions, enforces ownership and optimistic revisions", () => {
  const { db, job } = setup();
  const a = getLearning(db, "maker", "job", job.id);
  assert.deepEqual(a.kit.finished, [90, 60, 35]);
  const p = {
    revision: 0,
    fingerprint: a.fingerprint,
    stepId: "fold",
    completed: ["prepare", "cut", "score"],
  };
  saveProgress(db, "maker", "job", job.id, p);
  const b = getLearning(db, "maker", "job", job.id);
  assert.equal(b.progress.stepId, "fold");
  assert.equal(b.progress.revision, 1);
  assert.throws(() => getLearning(db, "other", "job", job.id), /not found/);
  assert.throws(
    () => saveProgress(db, "maker", "job", job.id, p),
    /another window/,
  );
  assert.throws(
    () =>
      saveProgress(db, "maker", "job", job.id, {
        ...p,
        revision: 1,
        stepId: "invented",
      }),
    /valid tutorial/,
  );
  assert.throws(
    () =>
      saveProgress(db, "maker", "job", job.id, {
        ...p,
        revision: 1,
        fingerprint: "0".repeat(64),
      }),
    /changed/,
  );
  db.prepare("UPDATE sd_stock SET body=json_set(body,'$.price',999)").run();
  assert.deepEqual(
    getLearning(db, "maker", "job", job.id).kit.finished,
    [90, 60, 35],
  );
  db.close();
});
function result() {
  return {
    revision: 0,
    completed: 2,
    spoiled: 1,
    minutes: 90,
    notes: "Two good, one spoiled.",
    economics: {
      ...emptyEconomics,
      sellingPrice: 500,
      hourlyRate: 1200,
      ownedMaterialCost: 300,
      consumables: 50,
    },
    finalize: false,
    offcuts: [
      {
        sourceId: "owned:card",
        name: "Measured usable offcut",
        width: 20,
        length: 20,
        quantity: 1,
      },
    ],
  };
}
test("draft results do not consume inventory; finishing consumes once and credits measured offcuts once", () => {
  const { db, job } = setup();
  const v = result();
  const draft = saveResults(db, "maker", "job", job.id, v);
  assert.equal(ownedMaterials(db, "maker").materials[0].quantity, 3);
  assert.equal(draft.summary.revenue, 1000);
  assert.equal(draft.summary.cost, 2150);
  assert.equal(draft.summary.contribution, -1150);
  const final = saveResults(db, "maker", "job", job.id, {
    ...v,
    revision: 1,
    finalize: true,
  });
  assert.equal(final.credited, true);
  assert.deepEqual(
    ownedMaterials(db, "maker").materials.map((m) => m.quantity),
    [0, 0, 1],
  );
  saveResults(db, "maker", "job", job.id, {
    ...v,
    revision: 2,
    finalize: true,
  });
  assert.deepEqual(
    ownedMaterials(db, "maker").materials.map((m) => m.quantity),
    [0, 0, 1],
  );
  assert.throws(
    () =>
      saveResults(db, "maker", "job", job.id, {
        ...v,
        revision: 3,
        finalize: false,
      }),
    /already finished/,
  );
  db.close();
});
test("invalid outcomes and oversized offcuts roll back the entire result and stock update", () => {
  const { db, job } = setup(),
    v = result();
  assert.throws(
    () =>
      saveResults(db, "maker", "job", job.id, {
        ...v,
        completed: 3,
        spoiled: 1,
        finalize: true,
      }),
    /equal/,
  );
  assert.throws(
    () =>
      saveResults(db, "maker", "job", job.id, {
        ...v,
        finalize: true,
        offcuts: [{ ...v.offcuts[0], width: 200, length: 300, quantity: 3 }],
      }),
    /exceed/,
  );
  assert.equal(ownedMaterials(db, "maker").materials[0].quantity, 3);
  assert.equal(getLearning(db, "maker", "job", job.id).result, null);
  assert.throws(() => saveResults(db, "other", "job", job.id, v), /not found/);
  db.close();
});
test("a stale owned-material balance cannot finalize results or credit offcuts", () => {
  const { db, job } = setup(),
    own = ownedMaterials(db, "maker");
  saveOwned(
    db,
    "maker",
    own.revision,
    own.materials.map((m) => ({ ...m, quantity: 0 })),
  );
  assert.throws(
    () =>
      saveResults(db, "maker", "job", job.id, { ...result(), finalize: true }),
    /no longer match/,
  );
  assert.equal(getLearning(db, "maker", "job", job.id).result, null);
  assert.equal(ownedMaterials(db, "maker").materials.length, 2);
  db.close();
});
test("zero good units have no per-unit divisor and cash avoided remains separate from contribution", () => {
  const { db, job } = setup();
  const s = economics(
    job.kit,
    { ...emptyEconomics, sellingPrice: 1000, hourlyRate: 600 },
    { completed: 0, minutes: 60 },
  );
  assert.equal(s.perGoodUnit, null);
  assert.equal(s.revenue, 0);
  assert.equal(s.contribution, -600);
  assert.ok(s.cashAvoided > 0);
  db.close();
});
test("fixture tutorial help never calls the model and unknown steps are rejected", async () => {
  const { db, input } = setup();
  let calls = 0;
  const r = await explainStep(
    db,
    "maker",
    "maker",
    { input, stepId: "score", question: "Explain the tab fold" },
    async () => {
      calls++;
      throw Error("network");
    },
  );
  assert.equal(calls, 0);
  assert.equal(r.source, "fixture");
  assert.ok(r.answer.includes("10 mm"));
  await assert.rejects(
    () =>
      explainStep(db, "maker", "maker", {
        input,
        stepId: "fake",
        question: "Explain",
      }),
    /not found/,
  );
  await assert.rejects(
    () =>
      explainStep(db, "maker", "maker", {
        input,
        stepId: "cut",
        question: "Check photo",
        photo: { type: "image/jpeg", data: "AAAA" },
        consent: false,
      }),
    /Confirm photo/,
  );
  assert.throws(() => cleanPhoto("AAAA"));
  db.close();
});
test("model help uses validated recipe context, caches by owner, and falls back honestly on bad output", async () => {
  const { db, input } = setup();
  setAITransportForTests(async () => {
    throw Error("unexpected network");
  });
  let calls = 0;
  try {
    const transport = async (instructions: string, context: string) => {
      calls++;
      assert.ok(instructions.includes("Do not invent"));
      assert.ok(context.includes("recipeVersion"));
      return JSON.stringify({
        answer: "Fold along the marked tab hinge, not its cut edge.",
        uncertain: false,
        checks: ["Compare the dashed line with the diagram."],
      });
    };
    const v = {
      input,
      stepId: "score",
      question: "How should I fold this tab?",
    };
    assert.equal(
      (await explainStep(db, "maker", "maker", v, transport)).source,
      "ai",
    );
    assert.equal(
      (await explainStep(db, "maker", "maker", v, transport)).cached,
      true,
    );
    assert.equal(calls, 1);
    const bad = await explainStep(
      db,
      "maker",
      "maker",
      { ...v, question: "Different question" },
      async () => '{"answer":null}',
    );
    assert.equal(bad.source, "manual");
    assert.ok(bad.answer.includes("10 mm"));
  } finally {
    setAITransportForTests();
    db.close();
  }
});

test("shared gift-box hinges reproduce the flat net and close into the requested cuboid", () => {
  for (const [w, d, h] of [
    [90, 60, 35],
    [40, 30, 15],
    [150, 100, 50],
    [75, 45, 22],
  ]) {
    const net = recipeCut("giftbox", w, d, h),
      definitions = giftBoxPanels(w, d, h);
    for (const folded of [false, true]) {
      const root = new Group(),
        groups = new Map<string, Group>([["base", root]]);
      for (const p of definitions) {
        const g = new Group();
        g.position.set(...p.pivot);
        if (folded) g.rotation[p.axis] = p.angle;
        groups.get(p.parent)!.add(g);
        groups.set(p.id, g);
      }
      root.updateMatrixWorld(true);
      for (const p of definitions) {
        const center = new Vector3(...p.center).applyMatrix4(
          groups.get(p.id)!.matrixWorld,
        );
        if (!folded) {
          const label = p.id.includes("tab")
            ? "Glue tab"
            : p.id[0].toUpperCase() + p.id.slice(1);
          const candidates = net.rects.filter((r) => r.label === label);
          assert.ok(
            candidates.some(
              (r) =>
                Math.abs(center.x - (r.x + r.width / 2 - (h + 10 + w / 2))) <
                  0.001 &&
                Math.abs(center.z - (r.y + r.height / 2 - (h + 10 + d / 2))) <
                  0.001,
            ),
            p.id + " must remain attached to the authored flat net",
          );
        } else {
          assert.ok(
            Math.abs(center.y - (p.id === "lid" ? h : h / 2)) < 0.001,
            p.id + " has the required assembled height",
          );
          if (p.id === "lid") {
            assert.ok(Math.abs(center.x) < 0.001);
            assert.ok(Math.abs(center.z) < 0.001);
          }
          if (["front", "back"].includes(p.id))
            assert.ok(Math.abs(Math.abs(center.z) - d / 2) < 0.001);
          if (["left", "right"].includes(p.id))
            assert.ok(Math.abs(Math.abs(center.x) - w / 2) < 0.001);
          if (p.id.includes("tab")) {
            assert.ok(
              Math.abs(Math.abs(center.x) - w / 2) <= 0.401,
              "tab lies against a side wall",
            );
            assert.ok(
              Math.abs(center.z) < d / 2,
              "tab turns toward the inside of the box",
            );
          }
        }
      }
    }
  }
});

test("tutorial HTTP records require an account, ownership, paid order and collection", async () => {
  const { db, job } = setup();
  db.exec(
    "INSERT INTO market_accounts VALUES('maker','maker@test.example','Maker','unused',0),('other','other@test.example','Other','unused',0); INSERT INTO market_bindings VALUES('maker','maker'),('other','other')",
  );
  db.prepare(
    "INSERT INTO sd_orders(id,owner,quote,request_key,payment,fulfillment,body,expires,created) VALUES('order','maker','quote','request','awaiting_buyer','preparing',?,0,0)",
  ).run(JSON.stringify(job.kit));
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.learner = req.headers["x-test-account"] || "guest";
    next();
  });
  registerLearning(app, db, () => {});
  app.use((e: any, _q: any, r: any, _n: any) =>
    r.status(e.status || 400).json({ error: e.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/scrapdrop/learning/`;
  const call = async (account: string, path: string, body?: unknown) =>
    fetch(base + path, {
      method: body ? "PUT" : "GET",
      headers: {
        "Content-Type": "application/json",
        "x-test-account": account,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    assert.equal((await call("guest", "job/" + job.id)).status, 401);
    assert.equal((await call("other", "job/" + job.id)).status, 404);
    assert.equal(
      (await call("other", "job/" + job.id + "/results", result())).status,
      404,
    );
    assert.equal((await call("maker", "order/order")).status, 409);
    db.prepare("UPDATE sd_orders SET payment='paid' WHERE id='order'").run();
    assert.equal((await call("maker", "order/order")).status, 200);
    assert.equal(
      (await call("maker", "order/order/results", result())).status,
      409,
    );
    db.prepare(
      "UPDATE sd_orders SET fulfillment='collected' WHERE id='order'",
    ).run();
    assert.equal(
      (await call("maker", "order/order/results", result())).status,
      200,
    );
    assert.equal(
      (await call("maker", "order/order/results", result())).status,
      409,
    );
    db.prepare("UPDATE sd_orders SET body=? WHERE id='order'").run(
      JSON.stringify({ ...job.kit, recipeVersion: 999 }),
    );
    assert.equal((await call("maker", "order/order")).status, 409);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    db.close();
  }
});
