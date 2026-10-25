import { createHash, randomBytes } from "node:crypto";
import { type Store, id, transaction } from "../store";
import {
  buildKit,
  type Material,
  type KitConfig,
} from "../../src/scrapdrop/model";
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const fail = (message: string, status = 400): never => {
  throw Object.assign(Error(message), { status });
};
export function initScrap(db: Store) {
  db.exec(`CREATE TABLE IF NOT EXISTS sd_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sd_slots(id TEXT PRIMARY KEY,label TEXT NOT NULL,starts INTEGER NOT NULL,ends INTEGER NOT NULL,capacity INTEGER NOT NULL CHECK(capacity>0));
 CREATE TABLE IF NOT EXISTS sd_stock(id TEXT PRIMARY KEY,body TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>=0),revision INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sd_images(id TEXT PRIMARY KEY,owner TEXT NOT NULL,type TEXT NOT NULL,bytes BLOB NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sd_quotes(id TEXT PRIMARY KEY,owner TEXT NOT NULL,hash TEXT NOT NULL,body TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sd_orders(id TEXT PRIMARY KEY,owner TEXT NOT NULL,quote TEXT NOT NULL,request_key TEXT NOT NULL,payment TEXT NOT NULL,fulfillment TEXT NOT NULL,provider_id TEXT UNIQUE,merchant TEXT,body TEXT NOT NULL,expires INTEGER NOT NULL,created INTEGER NOT NULL,UNIQUE(owner,request_key));
 CREATE TABLE IF NOT EXISTS sd_holds(order_id TEXT NOT NULL,item TEXT NOT NULL,units INTEGER NOT NULL CHECK(units>0),state TEXT NOT NULL,PRIMARY KEY(order_id,item));
 CREATE TABLE IF NOT EXISTS sd_captures(id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE,amount INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sd_pickups(order_id TEXT PRIMARY KEY,code_hash TEXT UNIQUE NOT NULL,code TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sd_ledger(id TEXT PRIMARY KEY,item TEXT NOT NULL,units INTEGER NOT NULL,kind TEXT NOT NULL,event_key TEXT UNIQUE NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sd_ai_usage(owner TEXT NOT NULL,day TEXT NOT NULL,n INTEGER NOT NULL,PRIMARY KEY(owner,day));`);
  db.prepare(
    "INSERT OR IGNORE INTO sd_meta VALUES('schema-version','1')",
  ).run();
  if (
    (
      db
        .prepare("SELECT value FROM sd_meta WHERE key='schema-version'")
        .get() as any
    ).value !== "1"
  )
    throw Error("Unsupported ScrapDrop database schema.");
  ensurePickupSlots(db);
  if (!db.prepare("SELECT 1 FROM sd_meta WHERE key='seed-v1'").get())
    transaction(db, () => {
      const stock = [
        [
          "card-olive",
          "Olive card offcut",
          "card",
          "#7d8963",
          "Olive",
          300,
          420,
          1,
          4,
          190,
        ],
        [
          "card-clay",
          "Clay card offcut",
          "card",
          "#cf8772",
          "Clay",
          300,
          420,
          1,
          3,
          210,
        ],
        [
          "card-cream",
          "Oat card offcut",
          "card",
          "#ded3b6",
          "Oat",
          300,
          420,
          1,
          2,
          170,
        ],
        [
          "fabric-indigo",
          "Indigo cotton offcut",
          "fabric",
          "#566479",
          "Indigo",
          350,
          260,
          1,
          4,
          260,
        ],
        [
          "fabric-ochre",
          "Ochre cotton offcut",
          "fabric",
          "#c4a15b",
          "Ochre",
          350,
          260,
          1,
          3,
          240,
        ],
        [
          "ribbon-cream",
          "Cream ribbon · 900 mm",
          "ribbon",
          "#e7d9b7",
          "Cream",
          15,
          900,
          1,
          5,
          80,
        ],
        [
          "ribbon-rust",
          "Rust ribbon · 900 mm",
          "ribbon",
          "#ac6049",
          "Rust",
          15,
          900,
          1,
          3,
          90,
        ],
      ];
      for (const [
        sid,
        name,
        type,
        color,
        shade,
        width,
        length,
        thickness,
        quantity,
        price,
      ] of stock) {
        const body = {
          id: sid,
          name,
          type,
          color,
          shade,
          width,
          length,
          thickness,
          price,
          active: true,
          confirmed: true,
          sample: true,
          imageId: null,
        };
        db.prepare("INSERT INTO sd_stock VALUES(?,?,?,1)").run(
          String(sid),
          JSON.stringify(body),
          Number(quantity),
        );
      }
      db.prepare(
        "INSERT INTO sd_meta VALUES('seed-v1','synthetic sample inventory')",
      ).run();
    });
}
export function expireHolds(db: Store, now = Date.now()) {
  transaction(db, () => {
    const expired = db
      .prepare(
        "SELECT id FROM sd_orders WHERE payment IN ('creating','awaiting_buyer','needs_creation') AND expires<?",
      )
      .all(now) as any[];
    for (const order of expired) {
      db.prepare(
        "UPDATE sd_orders SET payment='expired',fulfillment='canceled' WHERE id=? AND payment IN ('creating','awaiting_buyer','needs_creation')",
      ).run(order.id);
      db.prepare(
        "UPDATE sd_holds SET state='expired' WHERE order_id=? AND state='held'",
      ).run(order.id);
    }
  });
}
export function inventory(db: Store): Material[] {
  return (
    db
      .prepare(
        `SELECT s.*,COALESCE((SELECT sum(h.units) FROM sd_holds h WHERE h.item=s.id AND h.state IN ('held','capture_locked','committed')),0) reserved FROM sd_stock s`,
      )
      .all() as any[]
  ).map((s) => ({
    ...JSON.parse(s.body),
    quantity: s.quantity,
    revision: s.revision,
    available: Math.max(0, s.quantity - s.reserved),
  }));
}
function ensurePickupSlots(db: Store) {
  for (let i = 1; i <= 3; i++) {
    const date = new Date(Date.now() + 8 * 3600000 + i * 86400000)
        .toISOString()
        .slice(0, 10),
      starts = Date.parse(date + "T10:00:00+08:00"),
      ends = Date.parse(date + "T16:00:00+08:00");
    const label =
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kuala_Lumpur",
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(starts) + " · 10am–4pm MYT";
    db.prepare("INSERT OR IGNORE INTO sd_slots VALUES(?,?,?,?,12)").run(
      "pickup-" + date,
      label,
      starts,
      ends,
    );
  }
}
export function pickupSlots(db: Store, now = Date.now()) {
  ensurePickupSlots(db);
  return (
    db
      .prepare("SELECT * FROM sd_slots WHERE ends>? ORDER BY starts LIMIT 3")
      .all(now) as any[]
  ).map((slot) => {
    const used = (
      db
        .prepare(
          "SELECT COALESCE(sum(json_extract(body,'$.config.quantity')),0) n FROM sd_orders WHERE json_extract(body,'$.fulfillmentTerms.pickupSlotId')=? AND (payment IN ('creating','needs_creation','awaiting_buyer','capture_requested','pending','needs_reconciliation','paid') OR fulfillment='collected')",
        )
        .get(slot.id) as any
    ).n;
    return { ...slot, available: Math.max(0, slot.capacity - used) };
  });
}
export function quote(
  db: Store,
  owner: string,
  config: unknown,
  slotId?: string,
) {
  const base = buildKit(config, inventory(db));
  const slot = pickupSlots(db).find(
    (slot) => slot.id === (slotId || pickupSlots(db)[0]?.id),
  );
  if (!slot || slot.available < base.config.quantity)
    fail("Choose a pickup window with enough capacity.", 409);
  const kit = {
      ...base,
      fulfillmentTerms: {
        pickupSlotId: slot.id,
        label: slot.label,
        starts: slot.starts,
        ends: slot.ends,
        location: "Studio collection desk · sandbox demonstration",
      },
    },
    body = JSON.stringify(kit),
    qid = id("quote");
  db.prepare("INSERT INTO sd_quotes VALUES(?,?,?,?,?)").run(
    qid,
    owner,
    hash(body),
    body,
    Date.now() + 5 * 60000,
  );
  return { id: qid, hash: hash(body), kit, expires: Date.now() + 5 * 60000 };
}
export function reserveKit(
  db: Store,
  owner: string,
  quoteId: string,
  key: string,
  now = Date.now(),
) {
  expireHolds(db, now);
  return transaction(db, () => {
    const old = db
      .prepare("SELECT * FROM sd_orders WHERE owner=? AND request_key=?")
      .get(owner, key) as any;
    if (old) {
      if (old.quote !== quoteId)
        fail("Use a new checkout key for a changed design.", 409);
      return old;
    }
    const q = db
      .prepare("SELECT * FROM sd_quotes WHERE id=? AND owner=?")
      .get(quoteId, owner) as any;
    if (!q || q.expires <= now)
      fail("Your quote expired. Refresh the design before reserving.", 409);
    const snapshot = JSON.parse(q.body),
      kit = buildKit(snapshot.config, inventory(db));
    if (
      JSON.stringify(kit.lines) !== JSON.stringify(snapshot.lines) ||
      kit.total !== snapshot.total
    )
      fail("Materials changed. Refresh your quote.", 409);
    const slot = pickupSlots(db, now).find(
      (slot) => slot.id === snapshot.fulfillmentTerms?.pickupSlotId,
    );
    if (!slot || slot.available < kit.config.quantity)
      fail("This pickup window filled up. Choose another window.", 409);
    const orderId = id("kit"),
      expires =
        now +
        Math.min(
          1800,
          Math.max(60, Number(process.env.SCRAPDROP_HOLD_SECONDS) || 600),
        ) *
          1000;
    db.prepare(
      "INSERT INTO sd_orders VALUES(?,?,?,?,'creating','awaiting_payment',NULL,NULL,?,?,?)",
    ).run(orderId, owner, quoteId, key, q.body, expires, now);
    for (const l of kit.lines) {
      db.prepare("INSERT INTO sd_holds VALUES(?,?,?,'held')").run(
        orderId,
        l.itemId,
        l.units,
      );
      db.prepare("INSERT INTO sd_ledger VALUES(?,?,?,?,?,?)").run(
        id("ledger"),
        l.itemId,
        l.units,
        "reserved",
        `reserve:${orderId}:${l.itemId}`,
        now,
      );
    }
    return db.prepare("SELECT * FROM sd_orders WHERE id=?").get(orderId) as any;
  });
}
export function lockCapture(db: Store, oid: string, now = Date.now()) {
  return transaction(db, () => {
    const o = db.prepare("SELECT * FROM sd_orders WHERE id=?").get(oid) as any;
    if (!o) fail("Order not found.", 404);
    if (o.payment === "paid") return o;
    if (
      ["capture_requested", "pending", "needs_reconciliation"].includes(
        o.payment,
      )
    )
      return o;
    if (!["awaiting_buyer", "creating"].includes(o.payment) || o.expires <= now)
      fail(
        "This reservation expired. Please choose your materials again.",
        409,
      );
    db.prepare(
      "UPDATE sd_orders SET payment='capture_requested' WHERE id=?",
    ).run(oid);
    db.prepare(
      "UPDATE sd_holds SET state='capture_locked' WHERE order_id=? AND state='held'",
    ).run(oid);
    return { ...o, payment: "capture_requested" };
  });
}
export function finalizeKit(
  db: Store,
  oid: string,
  obs: {
    id: string;
    amount: string;
    currency: string;
    merchant: string;
    status: string;
  },
) {
  return transaction(db, () => {
    const o = db.prepare("SELECT * FROM sd_orders WHERE id=?").get(oid) as any;
    if (!o) fail("Order not found.", 404);
    const kit = JSON.parse(o.body);
    if (
      obs.status !== "COMPLETED" ||
      obs.currency !== "USD" ||
      obs.amount !== (kit.total / 100).toFixed(2) ||
      !o.merchant ||
      obs.merchant !== o.merchant
    )
      fail("Payment details do not match this kit.");
    const seen = db
      .prepare("SELECT * FROM sd_captures WHERE id=? OR order_id=?")
      .all(obs.id, oid) as any[];
    if (seen.some((s) => s.order_id !== oid || s.id !== obs.id))
      fail("Capture already belongs to a different order.");
    if (["refunded", "reversed", "partially_refunded"].includes(o.payment))
      return;
    const holds = db
      .prepare("SELECT * FROM sd_holds WHERE order_id=?")
      .all(oid) as any[];
    const locked =
      holds.length === kit.lines.length &&
      holds.every((h) =>
        ["held", "capture_locked", "committed"].includes(h.state),
      );
    db.prepare("INSERT OR IGNORE INTO sd_captures VALUES(?,?,?)").run(
      obs.id,
      oid,
      kit.total,
    );
    if (!locked) {
      db.prepare(
        "UPDATE sd_orders SET payment='paid',fulfillment='paid_needs_resolution' WHERE id=?",
      ).run(oid);
      return;
    }
    db.prepare("UPDATE sd_holds SET state='committed' WHERE order_id=?").run(
      oid,
    );
    for (const l of kit.lines)
      db.prepare("INSERT OR IGNORE INTO sd_ledger VALUES(?,?,?,?,?,?)").run(
        id("ledger"),
        l.itemId,
        l.units,
        "sold",
        `sold:${oid}:${l.itemId}`,
        Date.now(),
      );
    const code = randomBytes(16).toString("hex");
    db.prepare("INSERT OR IGNORE INTO sd_pickups VALUES(?,?,?,0)").run(
      oid,
      hash(code),
      code,
    );
    db.prepare(
      "UPDATE sd_orders SET payment='paid',fulfillment=CASE WHEN fulfillment IN ('ready','collected') THEN fulfillment ELSE 'preparing' END WHERE id=?",
    ).run(oid);
  });
}
export function cancelKit(db: Store, oid: string) {
  transaction(db, () => {
    const o = db
      .prepare("SELECT payment FROM sd_orders WHERE id=?")
      .get(oid) as any;
    if (
      !o ||
      !["creating", "awaiting_buyer", "needs_creation", "expired"].includes(
        o.payment,
      )
    )
      fail(
        "Payment may be in progress. Check its status before canceling.",
        409,
      );
    db.prepare(
      "UPDATE sd_orders SET payment='canceled',fulfillment='canceled' WHERE id=?",
    ).run(oid);
    db.prepare(
      "UPDATE sd_holds SET state='released' WHERE order_id=? AND state='held'",
    ).run(oid);
  });
}
export function updateStock(db: Store, itemId: string, body: any) {
  transaction(db, () => {
    const old = db
      .prepare("SELECT * FROM sd_stock WHERE id=?")
      .get(itemId) as any;
    if (!old || old.revision !== body.revision)
      fail("This stock changed. Refresh and try again.", 409);
    const held = (
      db
        .prepare(
          "SELECT COALESCE(sum(units),0) n FROM sd_holds WHERE item=? AND state IN ('held','capture_locked','committed')",
        )
        .get(itemId) as any
    ).n;
    if (body.quantity < held)
      fail("These units are already reserved or sold.", 409);
    const previous = JSON.parse(old.body);
    const details = [
      "name",
      "type",
      "color",
      "shade",
      "width",
      "length",
      "thickness",
      "price",
      "imageId",
    ];
    if (
      held &&
      details.some((key) => (body[key] ?? null) !== (previous[key] ?? null))
    )
      fail(
        "Material details cannot change while allocated. Add a separate stock item.",
        409,
      );
    const stored = { ...previous, ...body, id: itemId };
    db.prepare(
      "UPDATE sd_stock SET body=?,quantity=?,revision=revision+1 WHERE id=?",
    ).run(JSON.stringify(stored), body.quantity, itemId);
    db.prepare("INSERT INTO sd_ledger VALUES(?,?,?,?,?,?)").run(
      id("ledger"),
      itemId,
      body.quantity - old.quantity,
      "adjusted",
      id("stock-adjustment"),
      Date.now(),
    );
  });
}
