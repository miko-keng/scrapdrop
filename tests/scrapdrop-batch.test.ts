import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../server/store";
import { initMarket } from "../server/market/store";
import {
  initScrap,
  inventory,
  saveOwned,
  ownedMaterials,
  quoteBatch,
  reserveKit,
  cancelKit,
  saveBatchJob,
  completeBatch,
  pickupSlots,
} from "../server/scrapdrop/store";
import {
  buildBatchKit,
  sheetLayout,
  EDGE,
  GAP,
  type BatchInput,
} from "../src/scrapdrop/batch";
import { defaultConfig } from "../src/scrapdrop/model";
function setup() {
  const db = openStore(":memory:");
  initMarket(db);
  initScrap(db);
  const stock = inventory(db),
    config = defaultConfig("giftbox", stock),
    m = stock.find((m) => m.id === config.materialId)!,
    r = stock.find((m) => m.id === config.ribbonId)!;
  const input: BatchInput = {
    config,
    quantity: 4,
    ownedRevision: 0,
    mixColors: true,
    cuttingService: false,
    availableMinutes: 120,
    deadline: new Date(Date.now() + 8 * 3600000 + 3 * 86400000)
      .toISOString()
      .slice(0, 10),
    tools: ["scissors", "ruler", "glue", "hole punch"],
    owned: [
      {
        id: "my-card",
        name: "My card",
        type: "card",
        width: 200,
        length: 300,
        thickness: 1,
        quantity: 3,
        color: m.color,
      },
      {
        id: "my-ribbon",
        name: "My ribbon",
        type: "ribbon",
        width: 15,
        length: 2600,
        thickness: 1,
        quantity: 1,
        color: r.color,
      },
    ],
  };
  return { db, stock, input };
}
test("batch layouts remain inside margins, never overlap, rotate to fit and do not count slivers", () => {
  for (const [w, h, bw, bh] of [
    [300, 420, 90, 150],
    [200, 100, 90, 180],
    [100, 100, 97, 97],
    [2000, 3000, 25, 40],
  ]) {
    const cells = sheetLayout(w, h, bw, bh);
    assert.ok(cells.length <= 100);
    for (const r of cells) {
      assert.ok(
        r.x >= EDGE &&
          r.y >= EDGE &&
          r.x + r.width <= w - EDGE &&
          r.y + r.height <= h - EDGE,
      );
    }
    for (let i = 0; i < cells.length; i++)
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i],
          b = cells[j];
        assert.ok(
          a.x + a.width + GAP <= b.x ||
            b.x + b.width + GAP <= a.x ||
            a.y + a.height + GAP <= b.y ||
            b.y + b.height + GAP <= a.y,
        );
      }
  }
  assert.equal(sheetLayout(100, 100, 97, 97).length, 0);
  assert.equal(sheetLayout(200, 100, 90, 180)[0].rotated, true);
});
test("three owned sheets and ribbon for four boxes buys exactly one sheet, not four kits", () => {
  const { db, stock, input } = setup(),
    kit = buildBatchKit(input, stock);
  assert.equal(kit.batch!.plan.ready, true);
  assert.equal(kit.lines.length, 1);
  assert.equal(kit.lines[0].units, 1);
  assert.equal(
    kit.total,
    stock.find((m) => m.id === input.config.materialId)!.price,
  );
  assert.equal(kit.preparation, 0);
  assert.equal(kit.batch!.plan.ownedSheetProjects, 3);
  assert.equal(kit.batch!.plan.ownedRibbonProjects, 4);
  assert.ok(kit.batch!.plan.materialSavings > 0);
  const saved = saveOwned(db, "buyer", 0, input.owned);
  input.ownedRevision = saved.revision;
  const q = quoteBatch(db, "buyer", input),
    o = reserveKit(db, "buyer", q.id, "topup-example");
  assert.equal(
    (
      db
        .prepare("SELECT sum(units) n FROM sd_holds WHERE order_id=?")
        .get(o.id) as any
    ).n,
    1,
  );
  assert.equal(pickupSlots(db)[0].available, 11);
  cancelKit(db, o.id);
  assert.equal(pickupSlots(db)[0].available, 12);
  db.close();
});
test("owned material compatibility, limited lengths, tools, deadlines and time are enforced", () => {
  const { db, stock, input } = setup();
  const altered = structuredClone(input);
  altered.owned[0].thickness = 2;
  altered.owned[1].width = 80;
  altered.tools = [];
  altered.availableMinutes = 10;
  altered.deadline = "2000-01-01";
  const k = buildBatchKit(altered, stock);
  assert.equal(k.batch!.plan.ownedSheetProjects, 0);
  assert.equal(k.batch!.plan.ownedRibbonProjects, 0);
  assert.equal(k.batch!.plan.ready, false);
  assert.ok(k.batch!.plan.missingTools.length);
  assert.ok(!k.batch!.plan.timeFits && !k.batch!.plan.deadlineValid);
  altered.owned[1].width = 15;
  altered.owned[1].length = 559;
  assert.equal(
    buildBatchKit(altered, stock).batch!.plan.ownedRibbonProjects,
    0,
  );
  assert.throws(() => buildBatchKit({ ...input, quantity: 101 }, stock));
  assert.throws(() =>
    buildBatchKit({ ...input, owned: [input.owned[0], input.owned[0]] }, stock),
  );
  db.close();
});
test("batch quote refuses stale personal inventory, changed shop stock, missed deadlines and insufficient shop quantities", () => {
  const { db, stock, input } = setup();
  const saved = saveOwned(db, "a", 0, input.owned);
  input.ownedRevision = saved.revision;
  const q = quoteBatch(db, "a", input);
  saveOwned(db, "a", saved.revision, []);
  assert.throws(
    () => reserveKit(db, "a", q.id, "stale-owned"),
    /materials changed/,
  );
  assert.throws(() => saveOwned(db, "a", 0, []), /another window/);
  input.ownedRevision = saveOwned(db, "a", 2, input.owned).revision;
  const q2 = quoteBatch(db, "a", input);
  db.prepare("UPDATE sd_stock SET revision=revision+1 WHERE id=?").run(
    input.config.materialId,
  );
  assert.throws(
    () => reserveKit(db, "a", q2.id, "stale-price"),
    /Materials changed/,
  );
  const bad = buildBatchKit(
    { ...input, quantity: 100, availableMinutes: 10000 },
    inventory(db),
  );
  assert.equal(bad.batch!.plan.ready, false);
  assert.throws(() =>
    quoteBatch(db, "a", { ...input, deadline: "2000-01-01" }),
  );
  db.close();
});
test("zero-shortfall plan needs no PayPal order; making is private, atomic and idempotent", () => {
  const { db, stock, input } = setup();
  input.owned[0].quantity = 4;
  input.ownedRevision = saveOwned(db, "a", 0, input.owned).revision;
  const kit = buildBatchKit(input, stock);
  assert.equal(kit.total, 0);
  assert.equal(kit.lines.length, 0);
  assert.throws(() => quoteBatch(db, "a", input), /already have/);
  const job = saveBatchJob(db, "a", input);
  assert.throws(() => completeBatch(db, "other", job.id), /not found/);
  const made = completeBatch(db, "a", job.id);
  assert.ok(made.made);
  assert.ok(ownedMaterials(db, "a").materials.every((m) => m.quantity === 0));
  const rev = ownedMaterials(db, "a").revision;
  completeBatch(db, "a", job.id);
  assert.equal(ownedMaterials(db, "a").revision, rev);
  assert.equal(
    (db.prepare("SELECT count(*) n FROM sd_orders").get() as any).n,
    0,
  );
  db.close();
});
test("paid top-up cannot consume personal materials before collection, and competing saved plans cannot make inventory negative", () => {
  const { db, input } = setup();
  input.ownedRevision = saveOwned(db, "a", 0, input.owned).revision;
  const q = quoteBatch(db, "a", input),
    o = reserveKit(db, "a", q.id, "paid-batch");
  assert.throws(() => completeBatch(db, "a", o.id), /Collect/);
  db.prepare(
    "UPDATE sd_orders SET payment='paid',fulfillment='collected' WHERE id=?",
  ).run(o.id);
  completeBatch(db, "a", o.id);
  assert.equal(ownedMaterials(db, "a").materials[0].quantity, 0);
  input.owned[0].quantity = 4;
  input.ownedRevision = saveOwned(
    db,
    "a",
    ownedMaterials(db, "a").revision,
    input.owned,
  ).revision;
  const j1 = saveBatchJob(db, "a", input),
    j2 = saveBatchJob(db, "a", input);
  completeBatch(db, "a", j1.id);
  assert.throws(() => completeBatch(db, "a", j2.id), /no longer match/);
  assert.equal(ownedMaterials(db, "a").materials[0].quantity, 0);
  db.close();
});
test("30 bookmarks share sheets and ribbon segments; optional cutting is a single disclosed fee", () => {
  const { db, stock, input } = setup();
  input.owned[0].width = 300;
  input.owned[0].length = 420;
  input.config = defaultConfig("bookmark", stock);
  input.quantity = 30;
  input.availableMinutes = 480;
  input.owned[1].quantity = 2;
  input.owned[1].length = 3000;
  const k = buildBatchKit(input, stock);
  assert.equal(k.batch!.plan.ready, true);
  assert.equal(k.batch!.plan.ownedSheetProjects, 18);
  assert.equal(k.batch!.plan.ownedRibbonProjects, 28);
  assert.equal(
    k.lines.find((l) => l.itemId === input.config.materialId)!.units,
    2,
  );
  assert.equal(
    k.lines.find((l) => l.itemId === input.config.ribbonId)!.units,
    1,
  );
  assert.equal(
    buildBatchKit({ ...input, cuttingService: true }, stock).total,
    k.total + 250,
  );
  input.owned[0].color = "#ffffff";
  input.mixColors = false;
  assert.equal(buildBatchKit(input, stock).batch!.plan.ownedSheetProjects, 0);
  const ribbonOnly = buildBatchKit(
    {
      ...input,
      mixColors: true,
      cuttingService: true,
      config: { ...input.config, width: 34, depth: 119 },
    },
    stock,
  );
  assert.equal(ribbonOnly.lines.length, 1);
  assert.equal(ribbonOnly.preparation, 0);
  db.close();
});

test("oversized owned sheets work without a shop equivalent; invalid calendar dates cannot become feasible", () => {
  const { db, stock, input } = setup();
  input.config = { ...input.config, width: 180, depth: 200, height: 50 };
  input.quantity = 1;
  input.availableMinutes = 120;
  input.owned[0].width = 1000;
  input.owned[0].length = 1000;
  input.owned[1].length = 3000;
  const k = buildBatchKit(input, stock);
  assert.equal(k.total, 0);
  assert.ok(k.batch!.plan.ready);
  assert.equal(k.batch!.plan.comparisonAvailable, false);
  assert.equal(
    buildBatchKit({ ...input, deadline: "2028-02-31" }, stock).batch!.plan
      .deadlineValid,
    false,
  );
  db.close();
});

test("batch HTTP owns inventory and jobs, rejects untrusted pricing, and returns no-purchase plans privately", async () => {
  const { default: express } = await import("express");
  const { registerScrap } = await import("../server/scrapdrop/routes");
  const { db, input } = setup();
  for (const aid of ["buyer", "other"]) {
    db.prepare("INSERT INTO market_accounts VALUES(?,?,?,?,0)").run(
      aid,
      aid + "@batch.test",
      aid,
      "unused",
    );
    db.prepare("INSERT INTO market_bindings VALUES(?,?)").run(aid, aid);
  }
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.learner = req.headers["x-test-account"] || "guest";
    next();
  });
  registerScrap(app, db, { demo: true, limit: () => {} });
  app.use((e: any, _q: any, r: any, _n: any) =>
    r.status(e.status || 400).json({ error: e.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/scrapdrop`;
  async function call(aid: string, path: string, body?: any, method?: string) {
    const r = await fetch(base + path, {
      method: method || (body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", "x-test-account": aid },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: (await r.json()) as any };
  }
  try {
    assert.equal((await call("guest", "/owned")).status, 401);
    input.ownedRevision = (
      await call(
        "buyer",
        "/owned",
        { revision: 0, materials: input.owned },
        "PUT",
      )
    ).data.revision;
    assert.equal((await call("other", "/owned")).data.materials.length, 0);
    const plan = await call("buyer", "/batch/plan", input);
    assert.equal(plan.status, 200);
    assert.equal(plan.data.alternatives[0].kit.total, 190);
    assert.equal(
      (await call("buyer", "/batch/quotes", { input: { ...input, total: 1 } }))
        .status,
      400,
    );
    const q = await call("buyer", "/batch/quotes", { input });
    assert.equal(q.status, 200);
    assert.equal(q.data.kit.total, 190);
    const paid = await call("buyer", "/demo-order", {
      quoteId: q.data.id,
      requestKey: "batch-http-001",
      toolsConfirmed: true,
    });
    assert.equal(paid.status, 200);
    assert.equal(paid.data.kit.lines.length, 1);
    assert.equal(paid.data.kit.total, 190);
    assert.equal(
      (await call("buyer", "/batch/" + paid.data.id + "/made", {})).status,
      409,
    );
    input.owned[0].quantity = 4;
    input.ownedRevision = (
      await call(
        "buyer",
        "/owned",
        { revision: input.ownedRevision, materials: input.owned },
        "PUT",
      )
    ).data.revision;
    const job = await call("buyer", "/batch/jobs", input);
    assert.equal(job.status, 200);
    assert.equal((await call("other", "/batch/jobs")).data.length, 0);
    assert.equal(
      (await call("other", "/batch/" + job.data.id + "/made", {})).status,
      404,
    );
    assert.equal(
      (await call("buyer", "/batch/" + job.data.id + "/made", {})).status,
      200,
    );
    assert.ok((await call("buyer", "/batch/jobs")).data[0].made);
  } finally {
    server.close();
    db.close();
  }
});
