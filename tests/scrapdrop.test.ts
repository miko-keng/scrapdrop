import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { openStore } from "../server/store";
import { initMarket } from "../server/market/store";
import {
  initScrap,
  inventory,
  pickupSlots,
  quote,
  reserveKit,
  lockCapture,
  finalizeKit,
  expireHolds,
  cancelKit,
  updateStock,
} from "../server/scrapdrop/store";
import { scrapPayments } from "../server/scrapdrop/payments";
import { registerScrap } from "../server/scrapdrop/routes";
import { ideas } from "../server/scrapdrop/ai";
import { buildKit, defaultConfig, templates } from "../src/scrapdrop/model";
function store(path = ":memory:") {
  const db = openStore(path);
  initMarket(db);
  initScrap(db);
  return db;
}
function completed(db: any, id: string, capture = "CAPTURE-FIXTURE") {
  const o = db.prepare("SELECT * FROM sd_orders WHERE id=?").get(id) as any;
  return {
    id: capture,
    amount: (JSON.parse(o.body).total / 100).toFixed(2),
    currency: "USD",
    merchant: "fixture-seller",
    status: "COMPLETED",
  };
}
function awaiting(db: any, id: string) {
  db.prepare(
    "UPDATE sd_orders SET payment='awaiting_buyer',merchant='fixture-seller' WHERE id=?",
  ).run(id);
}
test("ScrapDrop templates: actual layouts fit, every rendered part maps to the BOM, colors select real stock", () => {
  const db = store(),
    stock = inventory(db);
  for (const t of templates) {
    const kit = buildKit(defaultConfig(t.id, stock), stock);
    assert.equal(kit.total, kit.subtotal + kit.preparation);
    assert.ok(kit.parts.length > 2);
    for (const p of kit.parts) {
      assert.ok(p.size.every((v) => v > 0));
      assert.ok(p.context || kit.lines.some((l) => l.itemId === p.stockId));
    }
    for (const r of kit.cut.rects) {
      assert.ok(
        r.x >= 0 &&
          r.y >= 0 &&
          r.x + r.width <= kit.cut.width &&
          r.y + r.height <= kit.cut.height,
      );
    }
    for (let i = 0; i < kit.cut.rects.length; i++)
      for (let j = i + 1; j < kit.cut.rects.length; j++) {
        const a = kit.cut.rects[i],
          b = kit.cut.rects[j];
        assert.ok(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y,
          "Cut rectangles must not overlap",
        );
      }
  }
  const c = defaultConfig("giftbox", stock),
    a = buildKit(c, stock),
    b = buildKit({ ...c, materialId: "card-clay" }, stock);
  assert.notEqual(a.parts[0].color, b.parts[0].color);
  assert.notEqual(a.lines[0].itemId, b.lines[0].itemId);
  assert.notEqual(a.total, b.total);
  assert.throws(
    () => buildKit({ ...c, width: 200, depth: 240, height: 80 }, stock),
    /rectangle/,
  );
  assert.throws(
    () => buildKit({ ...c, materialId: "fabric-indigo" }, stock),
    /compatible/,
  );
  assert.throws(() => buildKit({ ...c, quantity: 6 }, stock), /sold out/);
  assert.throws(
    () => buildKit({ ...c, materialId: "invented" }, stock),
    /confirmed/,
  );
  const thin = stock.map((m) =>
    m.id === "card-olive" ? { ...m, thickness: 0.6 } : m,
  );
  const bookmark = buildKit(defaultConfig("bookmark", thin), thin);
  assert.equal(bookmark.config.height, 1.2);
  assert.equal(bookmark.cut.holes?.length, 2);
  assert.equal(bookmark.parts[0].size[2], 0.6);
  const short = stock.map((m) =>
    m.id === "ribbon-cream" ? { ...m, length: 400 } : m,
  );
  assert.throws(
    () => buildKit(defaultConfig("wrap", short), short),
    /ribbon segment/,
  );
  db.close();
});
test("ScrapDrop quotes reject stale stock, reservations are all-or-nothing, repeats preserve identity", () => {
  const db = store(),
    stock = inventory(db),
    c = defaultConfig("giftbox", stock),
    q = quote(db, "buyer", c);
  const o = reserveKit(db, "buyer", q.id, "request-0001");
  assert.equal(reserveKit(db, "buyer", q.id, "request-0001").id, o.id);
  assert.throws(() => reserveKit(db, "other", q.id, "request-0002"), /expired/);
  assert.equal(inventory(db).find((s) => s.id === c.materialId)!.available, 3);
  assert.equal(inventory(db).find((s) => s.id === c.ribbonId)!.available, 4);
  assert.throws(
    () =>
      reserveKit(
        db,
        "buyer",
        quote(db, "buyer", { ...c, materialId: "card-clay" }).id,
        "request-0001",
      ),
    /new checkout/,
  );
  const q2 = quote(db, "buyer2", c);
  const m = inventory(db).find((m) => m.id === c.materialId)!;
  assert.throws(() => updateStock(db, m.id, { ...m, quantity: 0 }), /reserved/);
  updateStock(db, m.id, { ...m, quantity: m.quantity + 1 });
  assert.throws(
    () => reserveKit(db, "buyer2", q2.id, "request-0003"),
    /changed/,
  );
  assert.equal(
    (db.prepare("SELECT count(*) n FROM sd_orders").get() as any).n,
    1,
  );
  cancelKit(db, o.id);
  assert.equal(inventory(db).find((s) => s.id === c.materialId)!.available, 5);
  assert.ok(inventory(db).find((s) => s.id === c.materialId)!.sample);
  db.close();
});
test("ScrapDrop capture lock survives expiry, strict verified capture commits once and creates no software grants", () => {
  const db = store(),
    c = defaultConfig("giftbox", inventory(db)),
    q = quote(db, "buyer", c),
    o = reserveKit(db, "buyer", q.id, "payment-0001");
  awaiting(db, o.id);
  lockCapture(db, o.id);
  expireHolds(db, Date.now() + 86400000);
  assert.equal(
    (
      db
        .prepare("SELECT state FROM sd_holds WHERE order_id=? LIMIT 1")
        .get(o.id) as any
    ).state,
    "capture_locked",
  );
  assert.throws(() => cancelKit(db, o.id), /progress/);
  const obs = completed(db, o.id);
  for (const bad of [
    { amount: "0.01" },
    { currency: "MYR" },
    { merchant: "wrong" },
    { status: "PENDING" },
  ])
    assert.throws(() => finalizeKit(db, o.id, { ...obs, ...bad }), /match/);
  finalizeKit(db, o.id, obs);
  finalizeKit(db, o.id, obs);
  assert.equal(
    (db.prepare("SELECT count(*) n FROM sd_captures").get() as any).n,
    1,
  );
  assert.equal(
    (
      db
        .prepare("SELECT count(*) n FROM sd_ledger WHERE kind='sold'")
        .get() as any
    ).n,
    2,
  );
  assert.equal((db.prepare("SELECT count(*) n FROM grants").get() as any).n, 0);
  assert.equal(
    (
      db
        .prepare("SELECT fulfillment FROM sd_orders WHERE id=?")
        .get(o.id) as any
    ).fulfillment,
    "preparing",
  );
  assert.equal(inventory(db).find((s) => s.id === c.materialId)!.available, 3);
  db.close();
});
test("ScrapDrop late capture after released stock records money but blocks fulfillment; refunds do not resurrect inventory", () => {
  const db = store(),
    c = defaultConfig("giftbox", inventory(db)),
    q = quote(db, "buyer", c),
    o = reserveKit(db, "buyer", q.id, "late-00001");
  awaiting(db, o.id);
  expireHolds(db, Date.now() + 86400000);
  assert.throws(() => lockCapture(db, o.id), /expired/);
  finalizeKit(db, o.id, completed(db, o.id));
  assert.equal(
    (
      db
        .prepare("SELECT fulfillment FROM sd_orders WHERE id=?")
        .get(o.id) as any
    ).fulfillment,
    "paid_needs_resolution",
  );
  assert.equal(
    (db.prepare("SELECT count(*) n FROM sd_pickups").get() as any).n,
    0,
  );
  const q2 = quote(db, "b2", c),
    o2 = reserveKit(db, "b2", q2.id, "paid-00002");
  awaiting(db, o2.id);
  lockCapture(db, o2.id);
  finalizeKit(db, o2.id, completed(db, o2.id, "CAPTURE-2"));
  db.prepare(
    "UPDATE sd_orders SET payment='refunded',fulfillment='canceled' WHERE id=?",
  ).run(o2.id);
  finalizeKit(db, o2.id, completed(db, o2.id, "CAPTURE-2"));
  assert.equal(
    (db.prepare("SELECT payment FROM sd_orders WHERE id=?").get(o2.id) as any)
      .payment,
    "refunded",
  );
  assert.equal(inventory(db).find((s) => s.id === c.materialId)!.available, 3);
  db.close();
});
test("ScrapDrop payment transport: fixed snapshot price, single provider identity, pending/timeout recovery and verified reversal", async () => {
  const db = store(),
    c = defaultConfig("giftbox", inventory(db)),
    q = quote(db, "buyer", c),
    o = reserveKit(db, "buyer", q.id, "transport-1");
  let stage = "CREATED",
    captureCount = 0;
  const calls: any[] = [];
  const transport = async (
    path: string,
    method = "GET",
    body?: any,
    key?: string,
  ) => {
    calls.push({ path, method, body, key });
    if (path === "/v2/checkout/orders") {
      assert.equal(
        body.purchase_units[0].amount.value,
        (q.kit.total / 100).toFixed(2),
      );
      return {
        id: "PAYPAL-1",
        purchase_units: [{ payee: { merchant_id: "fixture-seller" } }],
      };
    }
    if (path.endsWith("/capture")) {
      captureCount++;
      stage = "COMPLETED";
      throw Error("Network timeout after successful capture");
    }
    if (path === "/v2/payments/captures/CAPTURE-1")
      return { status: "REVERSED" };
    return {
      id: "PAYPAL-1",
      status: stage,
      purchase_units: [
        {
          payee: { merchant_id: "fixture-seller" },
          payments: {
            captures:
              stage === "COMPLETED"
                ? [
                    {
                      id: "CAPTURE-1",
                      status: "COMPLETED",
                      amount: {
                        value: (q.kit.total / 100).toFixed(2),
                        currency_code: "USD",
                      },
                    },
                  ]
                : [],
          },
        },
      ],
    };
  };
  const p = scrapPayments(db, transport);
  await p.ensure(o.id);
  await p.ensure(o.id);
  assert.equal(calls.filter((c) => c.path === "/v2/checkout/orders").length, 1);
  stage = "APPROVED";
  await assert.rejects(() => p.capture(o.id));
  assert.equal(
    (db.prepare("SELECT payment FROM sd_orders WHERE id=?").get(o.id) as any)
      .payment,
    "needs_reconciliation",
  );
  expireHolds(db, Date.now() + 86400000);
  await p.reconcile(o.id);
  assert.equal(captureCount, 1);
  assert.equal(
    (db.prepare("SELECT payment FROM sd_orders WHERE id=?").get(o.id) as any)
      .payment,
    "paid",
  );
  await p.event({
    event_type: "PAYMENT.CAPTURE.REVERSED",
    resource: { id: "CAPTURE-1" },
  });
  assert.equal(
    (db.prepare("SELECT payment FROM sd_orders WHERE id=?").get(o.id) as any)
      .payment,
    "reversed",
  );
  assert.equal(inventory(db).find((s) => s.id === c.materialId)!.available, 3);
  db.close();
});
test("ScrapDrop fixture ideas respect tools, budget, time, unsupported intent and live transport is unused", async () => {
  const db = store(),
    stock = inventory(db),
    base = {
      text: "A birthday gift in olive",
      budget: 1200,
      minutes: 30,
      quantity: 1,
      tools: ["scissors", "ruler", "glue", "hole punch"],
    };
  const r = await ideas(db, "buyer", base, stock);
  assert.equal(r.source, "fixture");
  assert.equal(r.kits.length, 3);
  assert.equal(r.kits[0].materials[0].shade, "Olive");
  assert.equal(
    (await ideas(db, "buyer", { ...base, tools: [] }, stock)).kits.length,
    0,
  );
  assert.equal(
    (await ideas(db, "buyer", { ...base, budget: 100 }, stock)).kits.length,
    0,
  );
  assert.equal(
    (await ideas(db, "buyer", { ...base, minutes: 15 }, stock)).kits[0].template
      .id,
    "bookmark",
  );
  assert.equal(
    (
      await ideas(
        db,
        "buyer",
        { ...base, text: "Make electrical equipment" },
        stock,
      )
    ).kits.length,
    0,
  );
  db.close();
});
test("ScrapDrop real two-process competition for the last unit never oversells and survives restart", async () => {
  const dir = await mkdtemp(tmpdir() + "/scrapdrop-race-"),
    path = dir + "/stock.sqlite";
  let db = store(path);
  db.prepare("UPDATE sd_stock SET quantity=1 WHERE id='card-olive'").run();
  const config = defaultConfig("giftbox", inventory(db)),
    a = quote(db, "buyer-a", config),
    b = quote(db, "buyer-b", config);
  db.close();
  const run = (owner: string, qid: string) =>
    new Promise<string>((resolve, reject) => {
      const code = `import {openStore} from './server/store.ts';import {reserveKit} from './server/scrapdrop/store.ts';const db=openStore(${JSON.stringify(path)});db.exec('PRAGMA busy_timeout=5000');try{reserveKit(db,${JSON.stringify(owner)},${JSON.stringify(qid)},'race-key-001');console.log('reserved')}catch{console.log('rejected')}db.close();`;
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", code],
        { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
      );
      let out = "";
      child.stdout.on("data", (s) => (out += s));
      child.on("error", reject);
      child.on("exit", (status) =>
        status === 0 ? resolve(out.trim()) : reject(Error("Race child failed")),
      );
    });
  try {
    const results = await Promise.all([
      run("buyer-a", a.id),
      run("buyer-b", b.id),
    ]);
    assert.deepEqual(results.sort(), ["rejected", "reserved"]);
    db = store(path);
    assert.equal(
      inventory(db).find((s) => s.id === "card-olive")!.available,
      0,
    );
    assert.equal(
      (db.prepare("SELECT count(*) n FROM sd_orders").get() as any).n,
      1,
    );
    db.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("ScrapDrop HTTP: buyer/operator isolation, real demo stock allocation, ready and one-use pickup, immutable order and private guide", async () => {
  const db = store(),
    prior = process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID;
  process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID = "operator";
  db.prepare(
    "INSERT INTO market_accounts VALUES('operator','operator@example.test','Operator','unused',0),('buyer','buyer@example.test','Buyer','unused',0),('outsider','outsider@example.test','Other','unused',0)",
  ).run();
  for (const account of ["operator", "buyer", "outsider"])
    db.prepare("INSERT INTO market_bindings VALUES(?,?)").run(account, account);
  const app = express();
  app.use(express.json({ limit: "4mb" }));
  app.use((req, res, next) => {
    res.locals.learner = req.headers["x-test-account"] || "guest";
    next();
  });
  registerScrap(app, db, { demo: true, limit: () => {} });
  app.use((e: any, _req: any, res: any, _next: any) =>
    res.status(e.status || 400).json({ error: e.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/scrapdrop`;
  const call = async (
    account: string,
    path: string,
    body?: any,
    method?: string,
  ) => {
    const r = await fetch(base + path, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        "x-test-account": account,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, data: (await r.json()) as any };
  };
  try {
    const stock = (await call("guest", "/shop")).data.inventory;
    const c = defaultConfig("giftbox", stock);
    assert.equal((await call("guest", "/quotes", c)).status, 401);
    assert.equal((await call("buyer", "/operator/orders")).status, 403);
    const q = (await call("buyer", "/quotes", c)).data;
    const paid = await call("buyer", "/demo-order", {
      quoteId: q.id,
      requestKey: "demo-request-1",
      toolsConfirmed: true,
    });
    assert.equal(paid.status, 200);
    assert.equal(paid.data.source, "demo");
    assert.equal(paid.data.payment, "paid");
    assert.equal(paid.data.pickupCode, null);
    assert.equal(
      (await call("outsider", "/orders/" + paid.data.id)).status,
      404,
    );
    assert.equal(
      (await call("buyer", "/orders/" + paid.data.id + "/instructions")).status,
      200,
    );
    assert.equal(
      (await call("buyer", "/operator/orders/" + paid.data.id + "/ready", {}))
        .status,
      403,
    );
    assert.equal(
      (
        await call(
          "operator",
          "/operator/orders/" + paid.data.id + "/ready",
          {},
        )
      ).status,
      200,
    );
    const ready = (await call("buyer", "/orders/" + paid.data.id)).data;
    assert.ok(ready.pickupCode);
    const listed = (await call("operator", "/operator/orders")).data;
    assert.equal(listed[0].pickupCode, null);
    assert.equal(
      (
        await call("operator", "/operator/pickups/redeem", {
          code: ready.pickupCode,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call("operator", "/operator/pickups/redeem", {
          code: ready.pickupCode,
        })
      ).status,
      409,
    );
    db.prepare(
      "UPDATE sd_stock SET body=json_set(body,'$.price',9999),revision=revision+1 WHERE id='card-olive'",
    ).run();
    assert.equal(
      (await call("buyer", "/orders/" + paid.data.id)).data.kit.total,
      q.kit.total,
    );
    const invalid = await call("operator", "/operator/images", {
      type: "image/png",
      data: Buffer.from("not an image").toString("base64"),
    });
    assert.equal(invalid.status, 400);
    const pixels =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=";
    const image = await call("operator", "/operator/images", {
      type: "image/png",
      data: pixels,
    });
    assert.equal(image.status, 200);
    assert.equal(
      (
        await fetch(base + "/images/" + image.data.id, {
          headers: { "x-test-account": "buyer" },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          "operator",
          "/operator/images/" + image.data.id + "/suggest",
          { shareWithAI: false },
        )
      ).status,
      400,
    );
  } finally {
    if (prior === undefined) delete process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID;
    else process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID = prior;
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  }
});
test("ScrapDrop AI quotas: zero disables, cache reuses validated output, persistent total protects new identities", async () => {
  const { setAITransportForTests } = await import("../server/ai-mode");
  const db = store();
  const keys = ["SCRAPDROP_AI_DAILY_LIMIT", "SCRAPDROP_AI_TOTAL_LIMIT"];
  const previous = keys.map((k) => process.env[k]);
  let calls = 0;
  setAITransportForTests(async () => {
    calls++;
    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    budget: 1200,
                    minutes: 30,
                    quantity: 1,
                    templates: ["giftbox"],
                    color: "olive",
                    tools: ["scissors", "ruler", "glue"],
                    explanation: "A supported olive gift box for this goal.",
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  const brief = {
    text: "AI quota fixture sample",
    budget: 1200,
    minutes: 30,
    quantity: 1,
    tools: ["scissors", "ruler", "glue"],
  };
  try {
    process.env.SCRAPDROP_AI_DAILY_LIMIT = "0";
    await assert.rejects(
      () => ideas(db, "quota-owner", brief, inventory(db)),
      /allowance/,
    );
    assert.equal(calls, 0);
    process.env.SCRAPDROP_AI_DAILY_LIMIT = "2";
    process.env.SCRAPDROP_AI_TOTAL_LIMIT = "1";
    const first = await ideas(db, "quota-owner", brief, inventory(db));
    assert.equal(first.source, "ai");
    assert.equal(first.kits.length, 1);
    await ideas(db, "quota-owner", brief, inventory(db));
    assert.equal(calls, 1);
    await assert.rejects(
      () =>
        ideas(
          db,
          "another-identity",
          { ...brief, text: "A different fixture brief" },
          inventory(db),
        ),
      /allowance/,
    );
    assert.equal(calls, 1);
    assert.equal(
      (
        db
          .prepare("SELECT value FROM sd_meta WHERE key='ai-total'")
          .get() as any
      ).value,
      "1",
    );
  } finally {
    setAITransportForTests();
    keys.forEach((k, i) => {
      if (previous[i] === undefined) delete process.env[k];
      else process.env[k] = previous[i];
    });
    db.close();
  }
});

test("ScrapDrop pickup capacity is reserved atomically and released on cancellation", () => {
  const db = store();
  const slot = pickupSlots(db)[0];
  db.prepare("UPDATE sd_slots SET capacity=1 WHERE id=?").run(slot.id);
  const config = defaultConfig("giftbox", inventory(db));
  const a = quote(db, "buyer-a", config, slot.id);
  const b = quote(db, "buyer-b", config, slot.id);
  const order = reserveKit(db, "buyer-a", a.id, "capacity-a");
  assert.equal(pickupSlots(db)[0].available, 0);
  assert.throws(
    () => reserveKit(db, "buyer-b", b.id, "capacity-b"),
    /pickup window/,
  );
  cancelKit(db, order.id);
  assert.equal(pickupSlots(db)[0].available, 1);
  assert.ok(reserveKit(db, "buyer-b", b.id, "capacity-b").id);
  db.close();
});
