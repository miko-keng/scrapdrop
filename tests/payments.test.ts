import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore, grantCapture, hasAccess } from "../server/store";
import { captureObservation } from "../server/paypal";
function fixture() {
  const db = openStore(":memory:");
  const order = {
    id: "o1",
    learner: "l1",
    lesson: "summarise-sales",
    amount: 200,
  };
  db.prepare("INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?)").run(
    "o1",
    "l1",
    "summarise-sales",
    "t1",
    "awaiting_buyer",
    "p1",
    "k1",
    200,
    "{}",
    new Date().toISOString(),
  );
  return { db, order };
}
const valid = {
  id: "cap1",
  amount: "2.00",
  currency: "USD",
  merchant: "seller1",
  status: "COMPLETED",
};
test("verified completed capture grants access exactly once", () => {
  const { db, order } = fixture();
  grantCapture(db, order, valid, "seller1");
  grantCapture(db, order, valid, "seller1");
  assert.equal(hasAccess(db, "l1", "summarise-sales")?.source, "paypal");
  assert.equal(
    (db.prepare("SELECT count(*) AS n FROM grants").get() as any).n,
    1,
  );
  db.close();
});
test("price, currency, seller and pending captures never unlock lessons", () => {
  for (const change of [
    { amount: "0.01" },
    { currency: "EUR" },
    { merchant: "other" },
    { status: "PENDING" },
  ]) {
    const { db, order } = fixture();
    assert.throws(() =>
      grantCapture(db, order, { ...valid, ...change }, "seller1"),
    );
    assert.equal(hasAccess(db, "l1", "summarise-sales"), undefined);
    db.close();
  }
});
test("late completion does not restore a refunded order", () => {
  const { db, order } = fixture();
  db.prepare("UPDATE orders SET status='refunded' WHERE id='o1'").run();
  grantCapture(db, order, valid, "seller1");
  assert.equal(hasAccess(db, "l1", "summarise-sales"), undefined);
  db.close();
});
test("capture extraction rejects multiple purchase units and pending structure", () => {
  assert.throws(() => captureObservation({ purchase_units: [] }));
  assert.throws(() =>
    captureObservation({ purchase_units: [{ payments: { captures: [] } }] }),
  );
});

test("PayPal setup needs app credentials, not account passwords or a mandatory merchant ID", async (t) => {
  const keys = [
    "PAYPAL_CLIENT_ID",
    "PAYPAL_CLIENT_SECRET",
    "PAYPAL_MERCHANT_ID",
  ] as const;
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  process.env.PAYPAL_CLIENT_ID = "test-app-id";
  process.env.PAYPAL_CLIENT_SECRET = "test-app-secret";
  delete process.env.PAYPAL_MERCHANT_ID;
  const { paypalReady } = await import("../server/paypal");
  assert.equal(paypalReady(), true);
  delete process.env.PAYPAL_CLIENT_SECRET;
  assert.equal(paypalReady(), false);
});
