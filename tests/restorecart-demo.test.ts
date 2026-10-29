import test from "node:test";
import assert from "node:assert/strict";
import { openRC, save, incident } from "../server/restorecart/store";
import { accountTables } from "../server/restorecart/accounts";
import { prepareDemoShop } from "../server/restorecart/demo";
import { readiness } from "../server/restorecart/continuity";
import { orderProgress } from "../src/restorecart/orderStatus";

test("Prepared demo has evidence and contact details but requires human review and creates no sales", async () => {
  const db = openRC(":memory:");
  accountTables(db);
  try {
    const shop = await prepareDemoShop(db, "demo-test");
    assert.equal(shop.products.length, 3);
    assert.ok(shop.pickup);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM rc_sources WHERE incident=?")
        .get(shop.id)?.n,
      2,
    );
    assert.equal(readiness(db, shop.id).ready, 0);
    assert.equal(readiness(db, shop.id).needsInformation, 3);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM rc_orders").get()?.n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM rc_moves").get()?.n, 0);
    const contact = JSON.parse(
      (
        db
          .prepare("SELECT value FROM rc_meta WHERE key=?")
          .get(`contact:${shop.id}`) as any
      ).value,
    );
    assert.equal(contact.contact, "hello@sunday.example");
    shop.products[0].resolutionNote = "Seller chose $20";
    save(db, shop);
    const second = await prepareDemoShop(db, "demo-test");
    assert.equal(second.id, shop.id);
    assert.equal(second.products[0].resolutionNote, "Seller chose $20");
  } finally {
    db.close();
  }
});
test("Demo preparation preserves published shops", async () => {
  const db = openRC(":memory:");
  accountTables(db);
  try {
    const shop = await prepareDemoShop(db, "owner");
    delete (shop as any).demoPrepared;
    shop.state = "live";
    shop.published = {
      revision: 1,
      products: shop.products,
      pickup: "Existing pickup",
      name: shop.name,
    };
    save(db, shop);
    await prepareDemoShop(db, "owner");
    assert.equal(incident(db, shop.id).published?.pickup, "Existing pickup");
    assert.equal(incident(db, shop.id).state, "live");
  } finally {
    db.close();
  }
});
test("Buyer tracking never mistakes approval or refund for ready paid pickup", () => {
  for (const state of [
    "awaiting_buyer",
    "pending",
    "needs_reconciliation",
    "capture_requested",
  ])
    assert.equal(
      orderProgress({ state, fulfillment: "ready", refunded: 0 }).step,
      0,
    );
  assert.equal(
    orderProgress({ state: "paid", fulfillment: "not_ready", refunded: 0 })
      .step,
    1,
  );
  assert.equal(
    orderProgress({ state: "paid", fulfillment: "ready", refunded: 0 }).step,
    2,
  );
  assert.equal(
    orderProgress({ state: "paid", fulfillment: "collected", refunded: 0 })
      .step,
    3,
  );
  assert.equal(
    orderProgress({ state: "paid", fulfillment: "ready", refunded: 2000 }).step,
    -1,
  );
  assert.equal(
    orderProgress({ state: "canceled", fulfillment: "not_ready", refunded: 0 })
      .step,
    -1,
  );
});
