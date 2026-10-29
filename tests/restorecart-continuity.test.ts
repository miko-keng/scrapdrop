import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRC, createIncident, save } from "../server/restorecart/store";
import {
  originalExample,
  reconciliation,
  applyReconciliation,
  putMeta,
  meta,
  readiness,
} from "../server/restorecart/continuity";

test("RestoreCart return journal survives a database restart and rejects ambiguous imported history", () => {
  const folder = mkdtempSync(join(tmpdir(), "restorecart-return-")),
    path = join(folder, "test.sqlite");
  let db = openRC(path);
  try {
    const i = createIncident(db, "Restart fixture");
    i.state = "closing";
    i.products = [
      {
        sku: "X",
        name: "Test mug",
        description: "",
        candidates: [],
        price: "10.00",
        currency: "USD",
        allocation: 4,
        excluded: false,
        resolved: true,
        resolutionNote: "",
      },
    ];
    save(db, i);
    db.prepare(
      "INSERT INTO rc_orders(id,incident,buyer,request_key,token,state,fulfillment,capture,amount,expires,body) VALUES('O',?,'B','K','T','paid','ready','C',1000,?,?)",
    ).run(
      i.id,
      Date.now(),
      JSON.stringify({ lines: [{ sku: "X", quantity: 1, unitCents: 1000 }] }),
    );
    db.prepare(
      "INSERT INTO rc_moves VALUES('sale:O:X',?,'X',-1,'sale','O')",
    ).run(i.id);
    const original = originalExample(db, i.id),
      preview = reconciliation(db, i.id, original);
    putMeta(db, "preview:P", preview);
    const result = applyReconciliation(db, i.id, "P");
    assert.equal(result.output.inventory[0].quantity, 3);
    assert.equal(result.changesApplied, 2);
    db.close();
    db = openRC(path);
    assert.equal(applyReconciliation(db, i.id, "P").repeated, true);
    assert.equal(reconciliation(db, i.id, result.output).changes.length, 0);
    assert.deepEqual(meta(db, `destination:${result.storeId}`), result.output);
    const changed = {
      ...result.output,
      revision: result.output.revision + 1,
      inventoryEvents: [],
    };
    assert.throws(
      () => reconciliation(db, i.id, changed),
      /dropped recorded emergency history/,
    );
    const newerRefund = structuredClone(result.output);
    newerRefund.storeId = "other-refund-destination";
    newerRefund.orders[0].refunded = 1000;
    assert.match(
      reconciliation(db, i.id, newerRefund).conflicts.join(" "),
      /newer refund or collection/,
    );
    const independent = {
      ...original,
      storeId: "new-destination",
      orders: result.output.orders,
      inventoryEvents: [],
    };
    assert.match(
      reconciliation(db, i.id, independent).conflicts.join(" "),
      /without inventory trace/,
    );
  } finally {
    db.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

function readinessFixture() {
  const db = openRC(":memory:"),
    i = createIncident(db, "Readiness acceptance");
  i.products = [
    {
      sku: "BLUE",
      name: "Blue mug",
      description: "Blue stoneware",
      candidates: [],
      price: "20.00",
      currency: "USD",
      allocation: 2,
      excluded: false,
      resolved: true,
      resolutionNote: "",
    },
  ];
  save(db, i);
  return { db, i };
}
test("RestoreCart readiness separates reported dates, counted stock, stale warnings and changed allocations", () => {
  const { db, i } = readinessFixture();
  try {
    putMeta(db, "source:some-record", {
      observedAt: new Date().toISOString(),
      uploadedAt: new Date().toISOString(),
    });
    let result = readiness(db, i.id);
    assert.equal(result.ready, 0);
    assert.equal(result.products[0].count, null);
    putMeta(db, `counts:${i.id}`, {
      BLUE: { quantity: 5, allocation: 2, at: Date.now() },
    });
    result = readiness(db, i.id);
    assert.equal(result.ready, 1);
    assert.equal(result.products[0].stale, false);
    putMeta(db, `counts:${i.id}`, {
      BLUE: { quantity: 5, allocation: 2, at: Date.now() - 8 * 86400000 },
    });
    result = readiness(db, i.id);
    assert.equal(result.products[0].stale, true);
    assert.equal(result.products[0].count.quantity, 5);
    i.products[0].allocation = 3;
    save(db, i);
    assert.equal(readiness(db, i.id).needsInformation, 1);
  } finally {
    db.close();
  }
});
test("RestoreCart readiness requires the current variant photo to be confirmed and handles exclusions", () => {
  const { db, i } = readinessFixture();
  try {
    putMeta(db, `counts:${i.id}`, {
      BLUE: { quantity: 5, allocation: 2, at: Date.now() },
    });
    i.products[0].imageSourceId = "blue-image";
    save(db, i);
    assert.match(
      readiness(db, i.id).products[0].questions.join(" "),
      /exact variant/,
    );
    putMeta(db, `photos:${i.id}`, { BLUE: "red-image" });
    assert.equal(readiness(db, i.id).ready, 0);
    putMeta(db, `photos:${i.id}`, { BLUE: "blue-image" });
    assert.equal(readiness(db, i.id).ready, 1);
    i.products[0].excluded = true;
    i.products[0].price = "";
    save(db, i);
    const result = readiness(db, i.id);
    assert.equal(result.excluded, 1);
    assert.equal(result.needsInformation, 0);
    assert.deepEqual(result.products[0].questions, []);
  } finally {
    db.close();
  }
});
test("RestoreCart readiness cannot hide a price conflict behind a confirmation checkbox", () => {
  const { db, i } = readinessFixture();
  try {
    putMeta(db, `counts:${i.id}`, {
      BLUE: { quantity: 5, allocation: 2, at: Date.now() },
    });
    i.products[0].candidates = ["18.00", "20.00"].map((value) => ({
      field: "price" as const,
      value,
      sourceId: "record",
      location: "Row 2",
      excerpt: value,
    }));
    save(db, i);
    assert.equal(readiness(db, i.id).ready, 0);
    assert.match(
      readiness(db, i.id).products[0].questions.join(" "),
      /Explain which price/,
    );
    i.products[0].resolutionNote = "Seller confirms the current stock sheet.";
    save(db, i);
    assert.equal(readiness(db, i.id).ready, 1);
  } finally {
    db.close();
  }
});
