import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve, dirname } from "node:path";
import {
  uid,
  fail,
  cents,
  safeCSV,
  hash,
  type Incident,
  productIssues,
} from "./domain";

export function openRC(
  path = process.env.RESTORECART_DB_PATH || resolve(".data/restorecart.sqlite"),
) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ":memory:") chmodSync(path, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS rc_sessions(id TEXT PRIMARY KEY,csrf TEXT NOT NULL,seller INTEGER NOT NULL DEFAULT 0,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rc_incidents(id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rc_sources(id TEXT PRIMARY KEY,incident TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,hash TEXT NOT NULL,bytes BLOB NOT NULL,text TEXT NOT NULL,UNIQUE(incident,hash));
    CREATE TABLE IF NOT EXISTS rc_orders(id TEXT PRIMARY KEY,incident TEXT NOT NULL,buyer TEXT NOT NULL,request_key TEXT NOT NULL,token TEXT NOT NULL,state TEXT NOT NULL,fulfillment TEXT NOT NULL,provider TEXT UNIQUE,merchant TEXT NOT NULL DEFAULT '',capture TEXT UNIQUE,amount INTEGER NOT NULL,refunded INTEGER NOT NULL DEFAULT 0,expires INTEGER NOT NULL,body TEXT NOT NULL,UNIQUE(buyer,request_key));
    CREATE TABLE IF NOT EXISTS rc_holds(order_id TEXT NOT NULL,sku TEXT NOT NULL,units INTEGER NOT NULL CHECK(units>0),state TEXT NOT NULL,PRIMARY KEY(order_id,sku));
    CREATE TABLE IF NOT EXISTS rc_moves(event_key TEXT PRIMARY KEY,incident TEXT NOT NULL,sku TEXT NOT NULL,units INTEGER NOT NULL,kind TEXT NOT NULL,order_id TEXT);
    CREATE TABLE IF NOT EXISTS rc_events(id TEXT PRIMARY KEY,body TEXT NOT NULL,state TEXT NOT NULL,error TEXT,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rc_refunds(order_id TEXT PRIMARY KEY,provider TEXT UNIQUE,state TEXT NOT NULL,amount INTEGER NOT NULL,restocked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS rc_exports(id TEXT PRIMARY KEY,incident TEXT NOT NULL,body TEXT NOT NULL,hash TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rc_cache(key TEXT PRIMARY KEY,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rc_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rc_adjustments(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,amount INTEGER NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL);
  `);
  // Additive migrations preserve earlier local RestoreCart records.
  for (const [table, column] of [
    ["rc_orders", "last_checked"],
    ["rc_events", "attempts"],
    ["rc_events", "next_run"],
  ]) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    if (!columns.some((c) => c.name === column))
      db.exec(
        `ALTER TABLE ${table} ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`,
      );
  }
  return db;
}
export type DB = ReturnType<typeof openRC>;
export function tx<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const v = fn();
    db.exec("COMMIT");
    return v;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export const incident = (db: DB, id: string): Incident => {
  const r = db
    .prepare("SELECT body FROM rc_incidents WHERE id=?")
    .get(id) as any;
  if (!r) fail("Rescue shop not found.", 404);
  return JSON.parse(r.body);
};
export function save(db: DB, i: Incident) {
  db.prepare(
    "INSERT INTO rc_incidents VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
  ).run(i.id, i.slug, JSON.stringify(i));
}
export function createIncident(db: DB, name = "Sunday Studio") {
  const id = uid("rescue");
  const i: Incident = {
    id,
    name,
    slug:
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50) +
      "-" +
      id.slice(-6),
    state: "draft",
    revision: 0,
    products: [],
    pickup: "",
    originalUrl: "",
    published: null,
    mode: "manual",
    run: null,
    created: Date.now(),
  };
  save(db, i);
  return i;
}
export const order = (db: DB, id: string): any => {
  const r = db.prepare("SELECT * FROM rc_orders WHERE id=?").get(id) as any;
  if (!r) fail("Order not found.", 404);
  return { ...r, snapshot: JSON.parse(r.body) };
};
export function expire(db: DB, now = Date.now()) {
  tx(db, () => {
    db.prepare(
      "UPDATE rc_holds SET state='released' WHERE state='held' AND order_id IN (SELECT id FROM rc_orders WHERE expires<? AND state IN ('creating','awaiting_buyer','failed','canceled'))",
    ).run(now);
    db.prepare(
      "UPDATE rc_orders SET state='canceled' WHERE expires<? AND state IN ('creating','awaiting_buyer')",
    ).run(now);
  });
}
export function available(
  db: DB,
  incidentId: string,
  sku: string,
  allocation: number,
) {
  const holds = (
    db
      .prepare(
        "SELECT COALESCE(sum(h.units),0) n FROM rc_holds h JOIN rc_orders o ON o.id=h.order_id WHERE o.incident=? AND h.sku=? AND h.state IN ('held','locked')",
      )
      .get(incidentId, sku) as any
  ).n;
  const moves = (
    db
      .prepare(
        "SELECT COALESCE(sum(units),0) n FROM rc_moves WHERE incident=? AND sku=?",
      )
      .get(incidentId, sku) as any
  ).n;
  return allocation - Number(holds) + Number(moves);
}
export function viewIncident(db: DB, id: string) {
  const i = incident(db, id);
  return {
    ...i,
    stockCounts: JSON.parse(
      (
        db
          .prepare("SELECT value FROM rc_meta WHERE key=?")
          .get(`counts:${id}`) as any
      )?.value || "{}",
    ),
    rehearsal: JSON.parse(
      (
        db
          .prepare("SELECT value FROM rc_meta WHERE key=?")
          .get(`rehearsal:${id}`) as any
      )?.value || "null",
    ),
    products: i.products.map((p) => ({
      ...p,
      issues: productIssues(p),
      available: available(db, id, p.sku, p.allocation),
    })),
    sources: db
      .prepare(
        "SELECT id,name,mime,hash,length(bytes) size FROM rc_sources WHERE incident=?",
      )
      .all(id),
  };
}
export function publish(db: DB, id: string, expected: number) {
  return tx(db, () => {
    const i = incident(db, id);
    if (i.revision !== expected)
      fail("This draft changed. Refresh before publishing.", 409);
    if (!["draft", "live"].includes(i.state))
      fail("This shop is closing or closed.", 409);
    const products = i.products.filter((p) => !p.excluded);
    if (!products.length || !products.some((p) => p.allocation > 0))
      fail("Add at least one product with allocated stock.");
    if (!i.pickup.trim()) fail("Add pickup location and instructions.");
    if (products.some((p) => productIssues(p).length))
      fail("Resolve the product details before publishing.");
    if (new Set(products.map((p) => p.sku)).size !== products.length)
      fail("Each variant needs a unique SKU.");
    // Unapproved orders use their old snapshot only until a new catalog is published.
    db.prepare(
      "UPDATE rc_holds SET state='released' WHERE state='held' AND order_id IN (SELECT id FROM rc_orders WHERE incident=? AND state IN ('creating','awaiting_buyer'))",
    ).run(id);
    db.prepare(
      "UPDATE rc_orders SET state='canceled' WHERE incident=? AND state IN ('creating','awaiting_buyer')",
    ).run(id);
    i.revision++;
    i.state = "live";
    i.published = {
      revision: i.revision,
      products: structuredClone(products),
      pickup: i.pickup,
      name: i.name,
    };
    save(db, i);
    return i;
  });
}
export function reserve(
  db: DB,
  id: string,
  buyer: string,
  key: string,
  token: string,
  revision: number,
  lines: { sku: string; quantity: number }[],
) {
  return tx(db, () => {
    const existing = db
      .prepare("SELECT id FROM rc_orders WHERE buyer=? AND request_key=?")
      .get(buyer, key) as any;
    if (existing) {
      const o = order(db, existing.id);
      if (o.incident !== id) fail("Checkout key already used.", 409);
      return o;
    }
    const i = incident(db, id);
    if (i.state !== "live" || !i.published)
      fail("This rescue shop is not accepting new orders.", 409);
    if (i.published.revision !== revision)
      fail("Prices changed. Refresh your cart.", 409);
    if (
      !lines.length ||
      lines.length > 50 ||
      new Set(lines.map((l) => l.sku)).size !== lines.length
    )
      fail("Choose distinct cart items.");
    const items = lines.map((l) => {
      if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 100)
        fail("Quantity must be a whole number from 1 to 100.");
      const p = i.published!.products.find((p) => p.sku === l.sku);
      if (!p) fail("Product is no longer available.", 409);
      const allocation =
        i.products.find((v) => v.sku === l.sku)?.allocation ?? 0;
      if (available(db, id, l.sku, allocation) < l.quantity)
        fail(`${p.name} has insufficient emergency stock.`, 409);
      return {
        sku: p.sku,
        name: p.name,
        quantity: l.quantity,
        unitCents: cents(p.price),
      };
    });
    const oid = uid("order"),
      amount = items.reduce((n, l) => n + l.quantity * l.unitCents, 0);
    if (amount > 10000000) fail("Cart total exceeds this prototype's limit.");
    db.prepare(
      "INSERT INTO rc_orders(id,incident,buyer,request_key,token,state,fulfillment,amount,expires,body) VALUES(?,?,?,?,?,'creating','not_ready',?,?,?)",
    ).run(
      oid,
      id,
      buyer,
      key,
      token,
      amount,
      Date.now() + 600000,
      JSON.stringify({
        lines: items,
        revision,
        currency: "USD",
        pickup: i.published.pickup,
        name: i.published.name,
      }),
    );
    for (const l of items)
      db.prepare("INSERT INTO rc_holds VALUES(?,?,?,'held')").run(
        oid,
        l.sku,
        l.quantity,
      );
    return order(db, oid);
  });
}
export function cancel(db: DB, id: string) {
  tx(db, () => {
    const o = order(db, id);
    if (
      ["capture_requested", "pending", "needs_reconciliation", "paid"].includes(
        o.state,
      )
    )
      fail(
        "Payment is being checked or already paid. It cannot be canceled here.",
        409,
      );
    db.prepare("UPDATE rc_orders SET state='canceled' WHERE id=?").run(id);
    db.prepare(
      "UPDATE rc_holds SET state='released' WHERE order_id=? AND state='held'",
    ).run(id);
  });
}
export function lock(db: DB, id: string) {
  tx(db, () => {
    const o = order(db, id);
    if (o.state === "paid") return;
    if (
      ["capture_requested", "pending", "needs_reconciliation"].includes(o.state)
    )
      return;
    if (o.state !== "awaiting_buyer" || o.expires < Date.now())
      fail("Checkout expired. Start a fresh cart.", 409);
    db.prepare("UPDATE rc_orders SET state='capture_requested' WHERE id=?").run(
      id,
    );
    db.prepare(
      "UPDATE rc_holds SET state='locked' WHERE order_id=? AND state='held'",
    ).run(id);
  });
}
export function commitCapture(db: DB, id: string, capture: string) {
  tx(db, () => {
    const o = order(db, id);
    if (o.capture === capture) return;
    if (o.capture) fail("Order has a different capture.", 409);
    const holds = db
      .prepare("SELECT * FROM rc_holds WHERE order_id=?")
      .all(id) as any[];
    if (!holds.length || holds.some((h) => h.state !== "locked"))
      fail("Payment needs manual reconciliation; stock was not locked.", 409);
    db.prepare("UPDATE rc_orders SET state='paid',capture=? WHERE id=?").run(
      capture,
      id,
    );
    for (const h of holds)
      db.prepare("INSERT INTO rc_moves VALUES(?,?,?,?,'sale',?)").run(
        `sale:${id}:${h.sku}`,
        o.incident,
        h.sku,
        -h.units,
        id,
      );
    db.prepare("UPDATE rc_holds SET state='committed' WHERE order_id=?").run(
      id,
    );
  });
}
export function closeIncident(db: DB, id: string) {
  return tx(db, () => {
    const i = incident(db, id);
    if (i.state === "closed") return i;
    i.state = "closing";
    save(db, i);
    db.prepare(
      "UPDATE rc_holds SET state='released' WHERE state='held' AND order_id IN(SELECT id FROM rc_orders WHERE incident=? AND state IN('creating','awaiting_buyer'))",
    ).run(id);
    db.prepare(
      "UPDATE rc_orders SET state='canceled' WHERE incident=? AND state IN('creating','awaiting_buyer')",
    ).run(id);
    return i;
  });
}
export function recovery(db: DB, id: string) {
  return tx(db, () => {
    const i = incident(db, id);
    if (!["closing", "closed"].includes(i.state))
      fail("Close new checkouts before creating a recovery package.", 409);
    const pending = db
      .prepare(
        "SELECT id FROM rc_orders WHERE incident=? AND state IN ('capture_requested','pending','needs_reconciliation')",
      )
      .all(id);
    const refunds = db
      .prepare(
        "SELECT r.order_id FROM rc_refunds r JOIN rc_orders o ON o.id=r.order_id WHERE o.incident=? AND r.state='checking'",
      )
      .all(id);
    if (pending.length || refunds.length)
      fail(
        "Resolve payments and refunds still being checked before final export.",
        409,
      );
    const orders = (
      db
        .prepare(
          "SELECT id FROM rc_orders WHERE incident=? AND capture IS NOT NULL ORDER BY id",
        )
        .all(id) as any[]
    ).map((r) => order(db, r.id));
    const stock = i.products.map((p) => ({
      sku: p.sku,
      allocated: p.allocation,
      available: available(db, id, p.sku, p.allocation),
    }));
    const financial = orders.map((o) => ({
      orderId: o.id,
      capture: o.capture,
      capturedCents: o.amount,
      refundedCents: o.refunded,
      netCents: o.amount - o.refunded,
    }));
    const capturedCents = orders.reduce((s, o) => s + o.amount, 0),
      refundedCents = orders.reduce((s, o) => s + o.refunded, 0);
    const packageData = {
      schemaVersion: 1,
      incidentId: id,
      catalogRevision: i.published?.revision ?? 0,
      orders: orders.map((o) => ({
        id: o.id,
        provider: o.provider,
        capture: o.capture,
        amount: o.amount,
        refunded: o.refunded,
        fulfillment: o.fulfillment,
        ...o.snapshot,
      })),
      inventory: stock,
      financialSummary: financial,
      financialAdjustments: db
        .prepare(
          "SELECT a.id,a.order_id,a.amount,a.kind FROM rc_adjustments a JOIN rc_orders o ON o.id=a.order_id WHERE o.incident=? ORDER BY a.id",
        )
        .all(id),
      totals: {
        capturedCents,
        refundedCents,
        netCents: capturedCents - refundedCents,
      },
      unresolved: [],
      csv: {
        orders: safeCSV([
          [
            "order_id",
            "capture_id",
            "currency",
            "captured_cents",
            "refunded_cents",
            "fulfillment",
          ],
          ...orders.map((o) => [
            o.id,
            o.capture,
            "USD",
            o.amount,
            o.refunded,
            o.fulfillment,
          ]),
        ]),
        lines: safeCSV([
          ["order_id", "sku", "quantity", "unit_cents"],
          ...orders.flatMap((o) =>
            o.snapshot.lines.map((l: any) => [
              o.id,
              l.sku,
              l.quantity,
              l.unitCents,
            ]),
          ),
        ]),
        inventory: safeCSV([
          ["sku", "allocated", "available"],
          ...stock.map((s) => [s.sku, s.allocated, s.available]),
        ]),
        adjustments: safeCSV([
          [
            "order_id",
            "capture_id",
            "captured_cents",
            "refunded_cents",
            "net_cents",
          ],
          ...financial.map((f) => [
            f.orderId,
            f.capture,
            f.capturedCents,
            f.refundedCents,
            f.netCents,
          ]),
        ]),
      },
    };
    const contentHash = hash(JSON.stringify(packageData));
    const previous = db
      .prepare("SELECT id,body FROM rc_exports WHERE incident=? AND hash=?")
      .get(id, contentHash) as any;
    if (previous) return JSON.parse(previous.body);
    const eid = uid("export"),
      body = {
        ...packageData,
        manifest: {
          id: eid,
          createdAt: new Date().toISOString(),
          hash: contentHash,
          scope:
            "Emergency allocation only. Original store has NOT been updated.",
          files: Object.fromEntries(
            Object.entries(packageData.csv).map(([k, v]) => [
              k + ".csv",
              hash(v),
            ]),
          ),
        },
      };
    db.prepare("INSERT INTO rc_exports VALUES(?,?,?,?,?)").run(
      eid,
      id,
      JSON.stringify(body),
      contentHash,
      Date.now(),
    );
    i.state = "closed";
    save(db, i);
    return body;
  });
}
