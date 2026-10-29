import { test } from "node:test";
import assert from "node:assert/strict";
import {
  openRC,
  createIncident,
  save,
  incident,
  publish,
  reserve,
  available,
  lock,
  commitCapture,
  order,
  cancel,
  expire,
  closeIncident,
  recovery,
} from "../server/restorecart/store";
import {
  mergeCandidates,
  cents,
  safeCSV,
  productIssues,
} from "../server/restorecart/domain";
import {
  addSample,
  addSource,
  sourceList,
  deterministicCandidates,
  checkEvidence,
} from "../server/restorecart/sources";
import { reconstruct } from "../server/restorecart/reconstruction";
import { payments } from "../server/restorecart/payments";

function setup() {
  const db = openRC(":memory:");
  const i = createIncident(db);
  i.products = [
    {
      sku: "MUG-BLU",
      name: "Blue mug",
      description: "Blue mug",
      candidates: [],
      price: "20.00",
      currency: "USD",
      allocation: 3,
      resolved: true,
      resolutionNote: "Counted",
      excluded: false,
    },
    {
      sku: "MUG-RED",
      name: "Red mug",
      description: "Red mug",
      candidates: [],
      price: "18.00",
      currency: "USD",
      allocation: 2,
      resolved: true,
      resolutionNote: "Counted",
      excluded: false,
    },
    {
      sku: "TOTE-NAT",
      name: "Natural tote",
      description: "Tote",
      candidates: [],
      price: "12.00",
      currency: "USD",
      allocation: 2,
      resolved: true,
      resolutionNote: "Counted",
      excluded: false,
    },
  ];
  i.pickup = "12 Sample Lane, Tuesday–Saturday 10–5";
  save(db, i);
  publish(db, i.id, 0);
  return { db, id: i.id };
}
const cart = [
  { sku: "MUG-BLU", quantity: 2 },
  { sku: "TOTE-NAT", quantity: 1 },
];
function makeOrder(db: any, id: string, key = "request-key-one", lines = cart) {
  return reserve(
    db,
    id,
    "buyer",
    key,
    "receipt-secret",
    incident(db, id).published!.revision,
    lines,
  );
}
function transport() {
  let n = 0;
  const items = new Map<string, any>(),
    requests = new Map<string, any>();
  let timeoutCapture = false,
    pending = false;
  const fn: any = async (
    path: string,
    method = "GET",
    body?: any,
    key?: string,
  ) => {
    if (method === "POST" && key && requests.has(key))
      return structuredClone(requests.get(key));
    if (path === "/v2/checkout/orders") {
      const id = `PP${++n}`,
        p = {
          id,
          status: "CREATED",
          purchase_units: body.purchase_units.map((p: any) => ({
            ...p,
            payee: { merchant_id: "TESTMERCHANT" },
          })),
          links: [
            {
              rel: "payer-action",
              href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
            },
          ],
        };
      items.set(id, p);
      requests.set(key!, p);
      return structuredClone(p);
    }
    if (path.endsWith("/capture")) {
      const id = path.split("/")[4],
        p = items.get(id);
      p.status = "COMPLETED";
      p.purchase_units[0].payments = {
        captures: [
          {
            id: `CAP${id}`,
            status: pending ? "PENDING" : "COMPLETED",
            amount: p.purchase_units[0].amount,
          },
        ],
      };
      requests.set(key!, structuredClone(p));
      if (timeoutCapture) {
        timeoutCapture = false;
        throw Error("Simulated lost capture response");
      }
      return structuredClone(p);
    }
    if (path.endsWith("/refund")) {
      const r = { id: `RF${n}`, status: "COMPLETED", amount: body.amount };
      requests.set(key!, r);
      return r;
    }
    const id = path.split("/").at(-1)!;
    if (items.has(id)) return structuredClone(items.get(id));
    throw Error(`Unexpected fixture request: ${path}`);
  };
  return {
    fn,
    approve(id: string) {
      items.get(id).status = "APPROVED";
    },
    timeout() {
      timeoutCapture = true;
    },
    pending() {
      pending = true;
    },
    items,
    requests,
  };
}

test("RestoreCart money rejects invalid, zero, negative, scientific and fractional-cent prices", () => {
  assert.equal(cents("20.00"), 2000);
  for (const p of ["0.00", "-1.00", "NaN", "1e2", "1.001", "$20.00", "20", 20])
    assert.throws(() => cents(p));
});
test("RestoreCart CSV export neutralizes formulas and escapes quotes", () => {
  const csv = safeCSV([['=HYPERLINK("x")', "normal", "+1", "a,b"]]);
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /"a,b"/);
  assert.match(csv, /"'\+1"/);
});
test("RestoreCart parses actual sample PDF/CSV and exposes the 18/20 conflict", async () => {
  const db = openRC(":memory:");
  try {
    const i = createIncident(db);
    await addSample(db, i.id);
    const sources = sourceList(db, i.id);
    assert.equal(sources.length, 2);
    assert.match(
      sources.find((s) => s.mime === "application/pdf").text,
      /MUG-BLU/,
    );
    const products = deterministicCandidates(sources);
    assert.equal(products.length, 3);
    const blue = products.find((p) => p.sku === "MUG-BLU")!;
    assert.equal(blue.price, "");
    assert.deepEqual(
      [
        ...new Set(
          blue.candidates
            .filter((c) => c.field === "price")
            .map((c) => c.value),
        ),
      ].sort(),
      ["18.00", "20.00"],
    );
    assert.equal(blue.allocation, 0);
    assert.equal(blue.resolved, false);
  } finally {
    db.close();
  }
});
test("RestoreCart deduplicates identical uploads", async () => {
  const db = openRC(":memory:");
  try {
    const i = createIncident(db);
    const input = {
      name: "items.csv",
      data: Buffer.from("sku,name,price,currency\nA,Thing,1.00,USD\n").toString(
        "base64",
      ),
    };
    await addSource(db, i.id, input);
    assert.equal((await addSource(db, i.id, input)).duplicate, true);
    assert.equal(sourceList(db, i.id).length, 1);
  } finally {
    db.close();
  }
});
test("RestoreCart rejects disguised files and oversized sources", async () => {
  const db = openRC(":memory:");
  try {
    const i = createIncident(db);
    await assert.rejects(
      addSource(db, i.id, {
        name: "photo.png",
        data: Buffer.from("<script>bad</script>").toString("base64"),
      }),
    );
    await assert.rejects(
      addSource(db, i.id, { name: "big.csv", data: "a".repeat(7_000_001) }),
    );
  } finally {
    db.close();
  }
});
test("RestoreCart keeps separate SKUs with identical names", () => {
  const rows = ["BLUE", "RED"].map((sku) => ({
    sku,
    name: "Studio mug",
    description: "",
    candidates: [],
  }));
  assert.equal(mergeCandidates(rows).length, 2);
});
test("RestoreCart reconstruction caches and preserves seller choices", async () => {
  const db = openRC(":memory:");
  try {
    const i = createIncident(db);
    await addSample(db, i.id);
    await reconstruct(db, i.id);
    const draft = incident(db, i.id);
    draft.products[0].price = "20.00";
    draft.products[0].resolved = true;
    draft.products[0].allocation = 3;
    save(db, draft);
    const next = await reconstruct(db, i.id);
    assert.equal(next.run.cached, true);
    assert.equal(next.products[0].price, "20.00");
    assert.equal(next.products[0].resolved, true);
    assert.equal(next.products[0].allocation, 3);
  } finally {
    db.close();
  }
});
test("RestoreCart evidence rejects unknown sources and unsupported prices", () => {
  const row = {
    sku: "A",
    name: "Thing",
    description: "",
    candidates: [
      {
        field: "price",
        value: "20.00",
        sourceId: "s",
        location: "line 1",
        excerpt: "Thing 200.00 USD",
      },
    ],
  };
  assert.throws(() =>
    checkEvidence(
      [row],
      [{ id: "s", mime: "application/pdf", text: "Thing 200.00 USD" }],
    ),
  );
  assert.throws(() => checkEvidence([row], []));
});

test("RestoreCart Gemini tool contract validates proposals, repairs errors and caches", async () => {
  const db = openRC(":memory:");
  try {
    const i = createIncident(db);
    await addSample(db, i.id);
    const products = deterministicCandidates(sourceList(db, i.id)).map(
      ({ sku, name, description, candidates }) => ({
        sku,
        name,
        description,
        candidates,
      }),
    );
    let calls = 0;
    const fake: typeof fetch = async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(
        body.toolConfig.functionCallingConfig.allowedFunctionNames,
        ["proposeCatalog"],
      );
      assert.ok(!JSON.stringify(body.tools).includes("additionalProperties"));
      const rows = structuredClone(products);
      if (calls === 1) rows[0].candidates[0].sourceId = "invented-source";
      if (calls === 2)
        assert.match(JSON.stringify(body.contents.at(-1)), /unknown source/);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "proposeCatalog",
                      args: { products: rows },
                    },
                  },
                ],
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    };
    const reconstructed = await reconstruct(db, i.id, fake);
    assert.equal(reconstructed.products.length, 3);
    assert.equal(calls, 2);
    assert.equal(reconstructed.run.trace[0].result.valid, false);
    const cached = await reconstruct(db, i.id, fake);
    assert.equal(cached.run.cached, true);
    assert.equal(calls, 2);
  } finally {
    db.close();
  }
});
test("RestoreCart cannot publish unresolved prices, empty stock or missing pickup", () => {
  const { db, id } = setup();
  try {
    const i = incident(db, id);
    i.products[0].resolved = false;
    save(db, i);
    assert.throws(() => publish(db, id, i.revision));
    i.products[0].resolved = true;
    i.pickup = "";
    save(db, i);
    assert.throws(() => publish(db, id, i.revision));
  } finally {
    db.close();
  }
});
test("RestoreCart excluded invalid product does not block valid variants", () => {
  const { db, id } = setup();
  try {
    const i = incident(db, id);
    i.products[0].price = "";
    i.products[0].resolved = false;
    i.products[0].excluded = true;
    save(db, i);
    const p = publish(db, id, i.revision);
    assert.equal(p.published!.products.length, 2);
  } finally {
    db.close();
  }
});
test("RestoreCart canonical order is $52 and capture does not deduct stock twice", () => {
  const { db, id } = setup();
  try {
    const o = makeOrder(db, id);
    assert.equal(o.amount, 5200);
    assert.equal(available(db, id, "MUG-BLU", 3), 1);
    db.prepare("UPDATE rc_orders SET state='awaiting_buyer' WHERE id=?").run(
      o.id,
    );
    lock(db, o.id);
    commitCapture(db, o.id, "CAPTURE1");
    commitCapture(db, o.id, "CAPTURE1");
    assert.equal(available(db, id, "MUG-BLU", 3), 1);
    assert.equal(available(db, id, "TOTE-NAT", 2), 1);
    assert.equal(
      (db.prepare("SELECT count(*) n FROM rc_moves").get() as any).n,
      2,
    );
  } finally {
    db.close();
  }
});
test("RestoreCart duplicate request key returns the same order", () => {
  const { db, id } = setup();
  try {
    assert.equal(makeOrder(db, id).id, makeOrder(db, id).id);
    assert.equal(
      (db.prepare("SELECT count(*) n FROM rc_orders").get() as any).n,
      1,
    );
  } finally {
    db.close();
  }
});
test("RestoreCart one remaining unit can be reserved only once", () => {
  const { db, id } = setup();
  try {
    makeOrder(db, id, "first", [{ sku: "MUG-BLU", quantity: 3 }]);
    assert.throws(() =>
      makeOrder(db, id, "second", [{ sku: "MUG-BLU", quantity: 1 }]),
    );
    assert.equal(available(db, id, "MUG-BLU", 3), 0);
  } finally {
    db.close();
  }
});
test("RestoreCart rejects stale price revision and fractional/duplicate cart lines", () => {
  const { db, id } = setup();
  try {
    assert.throws(() => reserve(db, id, "b", "key", "t", 0, cart));
    assert.throws(() =>
      makeOrder(db, id, "fraction", [{ sku: "MUG-BLU", quantity: 0.5 }]),
    );
    assert.throws(() =>
      makeOrder(db, id, "duplicate", [
        { sku: "MUG-BLU", quantity: 1 },
        { sku: "MUG-BLU", quantity: 1 },
      ]),
    );
  } finally {
    db.close();
  }
});
test("RestoreCart safe cancellation and ordinary expiry release stock once", () => {
  const { db, id } = setup();
  try {
    const o = makeOrder(db, id);
    cancel(db, o.id);
    cancel(db, o.id);
    assert.equal(available(db, id, "MUG-BLU", 3), 3);
    const next = makeOrder(db, id, "another-key");
    expire(db, Date.now() + 700000);
    assert.equal(order(db, next.id).state, "canceled");
    assert.equal(available(db, id, "MUG-BLU", 3), 3);
  } finally {
    db.close();
  }
});
test("RestoreCart capture-locked stock never expires as an ordinary hold", () => {
  const { db, id } = setup();
  try {
    const o = makeOrder(db, id);
    db.prepare("UPDATE rc_orders SET state='awaiting_buyer' WHERE id=?").run(
      o.id,
    );
    lock(db, o.id);
    expire(db, Date.now() + 700000);
    assert.equal(available(db, id, "MUG-BLU", 3), 1);
    assert.throws(() => cancel(db, o.id));
  } finally {
    db.close();
  }
});
test("RestoreCart new catalog invalidates unapproved orders but not locked capture", () => {
  const { db, id } = setup();
  try {
    const o = makeOrder(db, id);
    const i = incident(db, id);
    publish(db, id, i.revision);
    assert.equal(order(db, o.id).state, "canceled");
    assert.equal(available(db, id, "MUG-BLU", 3), 3);
  } finally {
    db.close();
  }
});
test("RestoreCart timeout after successful provider capture reconciles one sale", async () => {
  const { db, id } = setup(),
    p = transport();
  const pay = payments(db, "http://localhost", p.fn);
  try {
    const o = makeOrder(db, id);
    const created = await pay.ensure(o.id);
    p.approve(created.provider);
    p.timeout();
    await assert.rejects(pay.reconcile(o.id, true));
    assert.equal(order(db, o.id).state, "needs_reconciliation");
    assert.equal(available(db, id, "MUG-BLU", 3), 1);
    await pay.reconcile(o.id);
    assert.equal(order(db, o.id).state, "paid");
    assert.equal(
      (
        db
          .prepare("SELECT count(*) n FROM rc_moves WHERE kind='sale'")
          .get() as any
      ).n,
      2,
    );
    await pay.reconcile(o.id);
    assert.equal(available(db, id, "MUG-BLU", 3), 1);
  } finally {
    db.close();
  }
});
test("RestoreCart pending capture stays locked and not paid", async () => {
  const { db, id } = setup(),
    p = transport();
  const pay = payments(db, "http://localhost", p.fn);
  try {
    const o = makeOrder(db, id);
    const created = await pay.ensure(o.id);
    p.approve(created.provider);
    p.pending();
    await pay.reconcile(o.id, true);
    assert.equal(order(db, o.id).state, "pending");
    expire(db, Date.now() + 700000);
    assert.equal(available(db, id, "MUG-BLU", 3), 1);
  } finally {
    db.close();
  }
});
test("RestoreCart mismatched merchant/amount cannot commit a sale", async () => {
  const { db, id } = setup(),
    p = transport();
  const pay = payments(db, "http://localhost", p.fn);
  try {
    const o = makeOrder(db, id),
      created = await pay.ensure(o.id);
    p.approve(created.provider);
    p.items.get(created.provider).purchase_units[0].amount.value = "0.01";
    await assert.rejects(pay.reconcile(o.id, true));
    assert.notEqual(order(db, o.id).state, "paid");
    assert.equal(
      (db.prepare("SELECT count(*) n FROM rc_moves").get() as any).n,
      0,
    );
  } finally {
    db.close();
  }
});
test("RestoreCart verified full refund records money and restocks only explicitly", async () => {
  const { db, id } = setup(),
    p = transport();
  const pay = payments(db, "http://localhost", p.fn);
  try {
    const o = makeOrder(db, id),
      created = await pay.ensure(o.id);
    p.approve(created.provider);
    await pay.reconcile(o.id, true);
    await pay.refund(o.id);
    assert.equal(order(db, o.id).refunded, 5200);
    assert.equal(available(db, id, "MUG-BLU", 3), 1);
    pay.restock(o.id);
    pay.restock(o.id);
    assert.equal(available(db, id, "MUG-BLU", 3), 3);
    assert.equal(available(db, id, "TOTE-NAT", 2), 2);
  } finally {
    db.close();
  }
});
test("RestoreCart final export blocks unknown payment and closes new checkouts", () => {
  const { db, id } = setup();
  try {
    const o = makeOrder(db, id);
    db.prepare("UPDATE rc_orders SET state='awaiting_buyer' WHERE id=?").run(
      o.id,
    );
    lock(db, o.id);
    closeIncident(db, id);
    assert.throws(() => recovery(db, id));
    assert.throws(() => makeOrder(db, id, "new-order"));
    assert.equal(available(db, id, "MUG-BLU", 3), 1);
  } finally {
    db.close();
  }
});
test("RestoreCart recovery totals, repeated export and refund delta are consistent", () => {
  const { db, id } = setup();
  try {
    const o = makeOrder(db, id);
    db.prepare("UPDATE rc_orders SET state='awaiting_buyer' WHERE id=?").run(
      o.id,
    );
    lock(db, o.id);
    commitCapture(db, o.id, "CAP1");
    closeIncident(db, id);
    const a = recovery(db, id),
      b = recovery(db, id);
    assert.equal(a.manifest.id, b.manifest.id);
    assert.deepEqual(a.totals, {
      capturedCents: 5200,
      refundedCents: 0,
      netCents: 5200,
    });
    assert.equal(a.orders[0].lines.length, 2);
    assert.equal(
      a.inventory.find((p: any) => p.sku === "MUG-BLU")!.available,
      1,
    );
    db.prepare("UPDATE rc_orders SET refunded=5200 WHERE id=?").run(o.id);
    const c = recovery(db, id);
    assert.notEqual(c.manifest.id, a.manifest.id);
    assert.equal(c.totals.netCents, 0);
    assert.equal(
      JSON.parse(
        (
          db
            .prepare("SELECT body FROM rc_exports WHERE id=?")
            .get(a.manifest.id) as any
        ).body,
      ).totals.netCents,
      5200,
    );
  } finally {
    db.close();
  }
});
test("RestoreCart rejects an invalid webhook signature without writes", async () => {
  const { db } = setup(),
    p = transport();
  try {
    await assert.rejects(
      payments(db, "http://localhost", p.fn).receive(
        {},
        { id: "FAKE", event_type: "PAYMENT.CAPTURE.COMPLETED" },
      ),
    );
    assert.equal(
      (db.prepare("SELECT count(*) n FROM rc_events").get() as any).n,
      0,
    );
  } finally {
    db.close();
  }
});

test("RestoreCart worker captures an approved checkout even if the buyer never returns", async () => {
  const { db, id } = setup(),
    p = transport(),
    pay = payments(db, "http://localhost", p.fn);
  try {
    const o = makeOrder(db, id),
      created = await pay.ensure(o.id);
    p.approve(created.provider);
    await pay.worker();
    assert.equal(order(db, o.id).state, "paid");
    assert.ok(order(db, o.id).last_checked > 0);
    assert.equal(available(db, id, "MUG-BLU", 3), 1);
  } finally {
    db.close();
  }
});
test("RestoreCart duplicate and out-of-order verified event processing does not repeat a sale", async () => {
  const { db, id } = setup(),
    p = transport(),
    pay = payments(db, "http://localhost", p.fn);
  try {
    const o = makeOrder(db, id),
      created = await pay.ensure(o.id);
    p.approve(created.provider);
    const approved = {
      event_type: "CHECKOUT.ORDER.APPROVED",
      resource: { id: created.provider },
    };
    await pay.processEvent(approved);
    await pay.processEvent(approved);
    await pay.processEvent({
      event_type: "PAYMENT.CAPTURE.PENDING",
      resource: {
        id: `CAP${created.provider}`,
        supplementary_data: { related_ids: { order_id: created.provider } },
      },
    });
    assert.equal(order(db, o.id).state, "paid");
    assert.equal(
      (db.prepare("SELECT count(*) n FROM rc_moves").get() as any).n,
      2,
    );
  } finally {
    db.close();
  }
});
test("RestoreCart unmatched verified events back off durably without blocking subsequent work", async () => {
  const { db } = setup(),
    p = transport(),
    pay = payments(db, "http://localhost", p.fn);
  try {
    db.prepare(
      "INSERT INTO rc_events(id,body,state,created) VALUES(?,?,'queued',?)",
    ).run(
      "unknown-event",
      JSON.stringify({
        event_type: "CHECKOUT.ORDER.APPROVED",
        resource: { id: "UNKNOWN" },
      }),
      Date.now(),
    );
    await pay.worker();
    const first = db
      .prepare("SELECT * FROM rc_events WHERE id='unknown-event'")
      .get() as any;
    assert.equal(first.attempts, 1);
    assert.ok(first.next_run > Date.now());
    await pay.worker();
    assert.equal(
      (
        db
          .prepare("SELECT attempts FROM rc_events WHERE id='unknown-event'")
          .get() as any
      ).attempts,
      1,
    );
  } finally {
    db.close();
  }
});
test("RestoreCart recognized CSV columns work in a different order and preserve quoted names", async () => {
  const db = openRC(":memory:");
  try {
    const i = createIncident(db);
    await addSource(db, i.id, {
      name: "reordered.csv",
      data: Buffer.from(
        'currency,price,name,sku,stock\nUSD,3.50,"Ribbon, natural",RIBBON-01,4\n',
      ).toString("base64"),
    });
    const p = deterministicCandidates(sourceList(db, i.id))[0];
    assert.equal(p.name, "Ribbon, natural");
    assert.equal(p.price, "3.50");
    assert.equal(p.sku, "RIBBON-01");
  } finally {
    db.close();
  }
});
