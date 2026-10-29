import { paypal, paypalReady, verifyWebhook } from "../paypal";
import { order, lock, commitCapture, tx, cancel, type DB } from "./store";
import { fail, money } from "./domain";

type Transport = typeof paypal;
export function payments(db: DB, base: string, transport: Transport = paypal) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS rc_adjustments(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,amount INTEGER NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL)",
  );
  const busy = new Set<string>();
  async function ensure(id: string) {
    let o = order(db, id);
    if (o.provider && o.merchant && o.snapshot.approvalUrl) return o;
    if (o.state !== "creating" || o.expires < Date.now())
      fail("Checkout is no longer available.", 409);
    if (transport === paypal && !paypalReady())
      fail("PayPal sandbox is not configured. No payment was created.", 503);
    const expected = process.env.PAYPAL_MERCHANT_ID || "";
    const p = o.provider
      ? await transport(`/v2/checkout/orders/${o.provider}`)
      : await transport(
          "/v2/checkout/orders",
          "POST",
          {
            intent: "CAPTURE",
            purchase_units: [
              {
                reference_id: id,
                custom_id: id,
                description: `RestoreCart · ${o.snapshot.name}`,
                ...(expected ? { payee: { merchant_id: expected } } : {}),
                amount: { currency_code: "USD", value: money(o.amount) },
              },
            ],
            payment_source: {
              paypal: {
                experience_context: {
                  brand_name: "RestoreCart sandbox",
                  shipping_preference: "NO_SHIPPING",
                  user_action: "PAY_NOW",
                  return_url: `${base}/restorecart/receipt/${id}?access=${o.token}`,
                  cancel_url: `${base}/restorecart/receipt/${id}?access=${o.token}&cancel=1`,
                },
              },
            },
          },
          `rc-create-${id}`,
        );
    if (!p.id)
      fail(
        "PayPal did not return an order. Check payment status before retrying.",
        502,
      );
    db.prepare("UPDATE rc_orders SET provider=? WHERE id=?").run(p.id, id);
    const full = p.purchase_units?.[0]?.payee?.merchant_id
      ? p
      : await transport(`/v2/checkout/orders/${p.id}`);
    const pu = full.purchase_units?.[0],
      merchant = pu?.payee?.merchant_id;
    if (
      !merchant ||
      (expected && merchant !== expected) ||
      pu?.custom_id !== id ||
      pu?.amount?.value !== money(o.amount) ||
      pu?.amount?.currency_code !== "USD"
    )
      fail("Sandbox merchant or order details could not be verified.", 502);
    const approve = (p.links || full.links || []).find((l: any) =>
      ["payer-action", "approve"].includes(l.rel),
    )?.href;
    if (!approve || !/^https:\/\/(www\.)?sandbox\.paypal\.com\//.test(approve))
      fail("PayPal approval URL is unavailable.", 502);
    o = order(db, id);
    const body = { ...o.snapshot, approvalUrl: approve };
    db.prepare(
      "UPDATE rc_orders SET merchant=?,state=CASE WHEN state='creating' THEN 'awaiting_buyer' ELSE state END,body=? WHERE id=?",
    ).run(merchant, JSON.stringify(body), id);
    return order(db, id);
  }
  async function observe(id: string, p: any) {
    const o = order(db, id),
      pu = p.purchase_units?.[0];
    if (
      p.id !== o.provider ||
      !o.merchant ||
      pu?.payee?.merchant_id !== o.merchant ||
      pu?.custom_id !== id ||
      pu?.amount?.currency_code !== "USD" ||
      Number(pu?.amount?.value) !== o.amount / 100
    )
      fail("Payment details do not match this checkout.", 409);
    const captures = pu?.payments?.captures || [];
    if (captures.length > 1)
      fail("Multiple captures require manual reconciliation.", 409);
    const c = captures[0];
    if (c?.status === "COMPLETED") {
      if (
        c.amount?.currency_code !== "USD" ||
        Number(c.amount?.value) !== o.amount / 100 ||
        typeof c.id !== "string"
      )
        fail("Capture amount does not match this checkout.", 409);
      commitCapture(db, id, c.id);
    } else if (c?.status === "PENDING") {
      if (o.state !== "paid")
        db.prepare("UPDATE rc_orders SET state='pending' WHERE id=?").run(id);
    } else if (
      ["DECLINED", "DENIED", "FAILED"].includes(c?.status) ||
      p.status === "VOIDED"
    ) {
      if (o.capture) return;
      tx(db, () => {
        db.prepare("UPDATE rc_orders SET state='failed' WHERE id=?").run(id);
        db.prepare(
          "UPDATE rc_holds SET state='released' WHERE order_id=? AND state IN('held','locked')",
        ).run(id);
      });
    }
    return order(db, id);
  }
  async function reconcile(id: string, captureApproved = false) {
    if (busy.has(id)) return order(db, id);
    busy.add(id);
    try {
      let o = order(db, id);
      if (!o.provider) {
        if (o.state === "creating") o = await ensure(id);
        else return o;
      }
      if (o.capture) return o;
      let p = await transport(`/v2/checkout/orders/${o.provider}`);
      if (
        p.status === "APPROVED" &&
        [
          "awaiting_buyer",
          "capture_requested",
          "pending",
          "needs_reconciliation",
        ].includes(o.state) &&
        (captureApproved || o.state !== "awaiting_buyer")
      ) {
        lock(db, id);
        try {
          p = await transport(
            `/v2/checkout/orders/${o.provider}/capture`,
            "POST",
            {},
            `rc-capture-${id}`,
          );
        } catch (e) {
          db.prepare(
            "UPDATE rc_orders SET state='needs_reconciliation' WHERE id=? AND state!='paid'",
          ).run(id);
          throw e;
        }
      }
      return await observe(id, p);
    } catch (e) {
      const o = order(db, id);
      if (o.state === "capture_requested")
        db.prepare(
          "UPDATE rc_orders SET state='needs_reconciliation' WHERE id=?",
        ).run(id);
      throw e;
    } finally {
      busy.delete(id);
    }
  }
  function adjustment(id: string, r: any, kind = "refund") {
    const o = order(db, id),
      amount = Math.round(Number(r.amount?.value) * 100);
    if (
      r.status !== "COMPLETED" ||
      r.amount?.currency_code !== "USD" ||
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount > o.amount ||
      typeof r.id !== "string"
    )
      fail("Refund is not verified completed.", 409);
    tx(db, () => {
      const previous = db
        .prepare("SELECT order_id FROM rc_adjustments WHERE id=?")
        .get(r.id) as any;
      if (previous && previous.order_id !== id)
        fail("Refund belongs to another order.", 409);
      db.prepare("INSERT OR IGNORE INTO rc_adjustments VALUES(?,?,?,?,?)").run(
        r.id,
        id,
        amount,
        kind,
        JSON.stringify(r),
      );
      const sum = (
        db
          .prepare(
            "SELECT COALESCE(sum(amount),0) n FROM rc_adjustments WHERE order_id=?",
          )
          .get(id) as any
      ).n;
      if (sum > o.amount) fail("Refund total exceeds captured amount.", 409);
      db.prepare(
        "UPDATE rc_orders SET refunded=?,fulfillment=CASE WHEN fulfillment='collected' THEN fulfillment ELSE 'canceled' END WHERE id=?",
      ).run(sum, id);
    });
  }
  async function refund(id: string) {
    const o = order(db, id);
    if (!o.capture || o.state !== "paid" || o.fulfillment === "collected")
      fail("Only paid, uncollected orders support a full refund here.", 409);
    if (o.refunded === o.amount) return o;
    if (o.refunded)
      fail(
        "This order already has an adjustment. Handle the remaining amount in PayPal.",
        409,
      );
    const existing = db
      .prepare("SELECT * FROM rc_refunds WHERE order_id=?")
      .get(id) as any;
    if (existing?.state === "completed") return order(db, id);
    if (existing?.state === "failed")
      fail(
        "The refund failed. Check this capture in PayPal before another refund.",
        409,
      );
    db.prepare(
      "INSERT OR IGNORE INTO rc_refunds(order_id,state,amount) VALUES(?,'checking',?)",
    ).run(id, o.amount);
    const r = existing?.provider
      ? await transport(`/v2/payments/refunds/${existing.provider}`)
      : await transport(
          `/v2/payments/captures/${o.capture}/refund`,
          "POST",
          { amount: { value: money(o.amount), currency_code: "USD" } },
          `rc-refund-${id}`,
        );
    if (r.id)
      db.prepare("UPDATE rc_refunds SET provider=? WHERE order_id=?").run(
        r.id,
        id,
      );
    if (r.status === "COMPLETED") {
      adjustment(id, r);
      db.prepare(
        "UPDATE rc_refunds SET state='completed' WHERE order_id=?",
      ).run(id);
    }
    if (["FAILED", "CANCELLED"].includes(r.status)) {
      db.prepare("UPDATE rc_refunds SET state='failed' WHERE order_id=?").run(
        id,
      );
      fail("The refund did not complete. Check it in PayPal.", 409);
    }
    return order(db, id);
  }
  function restock(id: string) {
    tx(db, () => {
      const o = order(db, id);
      if (o.refunded !== o.amount || o.fulfillment === "collected")
        fail(
          "Confirm a full refund of an uncollected order before restocking.",
          409,
        );
      for (const l of o.snapshot.lines)
        db.prepare(
          "INSERT OR IGNORE INTO rc_moves VALUES(?,?,?,?,'restock',?)",
        ).run(`restock:${id}:${l.sku}`, o.incident, l.sku, l.quantity, id);
      db.prepare(
        "INSERT INTO rc_refunds(order_id,state,amount,restocked) VALUES(?,'completed',?,1) ON CONFLICT(order_id) DO UPDATE SET restocked=1",
      ).run(id, o.amount);
    });
    return order(db, id);
  }
  async function processEvent(e: any) {
    const related = e.resource?.supplementary_data?.related_ids || {};
    let captureId = related.capture_id;
    if (
      [
        "PAYMENT.CAPTURE.COMPLETED",
        "PAYMENT.CAPTURE.PENDING",
        "PAYMENT.CAPTURE.DENIED",
        "PAYMENT.CAPTURE.REVERSED",
      ].includes(e.event_type)
    )
      captureId = e.resource?.id;
    if (!captureId && e.event_type === "PAYMENT.CAPTURE.REFUNDED") {
      const up =
        e.resource?.links?.find((l: any) => l.rel === "up")?.href || "";
      captureId = /\/v2\/payments\/captures\/([A-Z0-9]+)$/.exec(up)?.[1];
    }
    const found = db
      .prepare("SELECT id FROM rc_orders WHERE provider=? OR capture=?")
      .get(related.order_id || e.resource?.id || "", captureId || "") as any;
    if (!found) fail("Webhook has no matching RestoreCart order.", 409);
    if (e.event_type === "PAYMENT.CAPTURE.REFUNDED") {
      const r = await transport(
        `/v2/payments/refunds/${encodeURIComponent(e.resource.id)}`,
      );
      if (r.status !== "COMPLETED") fail("Refund is still pending.", 409);
      adjustment(found.id, r);
      db.prepare(
        "UPDATE rc_refunds SET state='completed' WHERE order_id=? AND provider=?",
      ).run(found.id, r.id);
    } else if (e.event_type === "PAYMENT.CAPTURE.REVERSED") {
      const c = await transport(`/v2/payments/captures/${captureId}`);
      if (c.status !== "REVERSED") fail("Reversal is not confirmed.", 409);
      adjustment(
        found.id,
        { id: `reversed:${captureId}`, status: "COMPLETED", amount: c.amount },
        "reversal",
      );
    } else await reconcile(found.id, true);
  }
  async function receive(headers: Record<string, unknown>, event: any) {
    if (typeof event.id !== "string" || !(await verifyWebhook(headers, event)))
      fail("Webhook signature could not be verified.", 400);
    db.prepare(
      "INSERT OR IGNORE INTO rc_events(id,body,state,error,created) VALUES(?,?,'queued',NULL,?)",
    ).run(event.id, JSON.stringify(event), Date.now());
  }
  async function worker() {
    const active = db
      .prepare(
        "SELECT id FROM rc_orders WHERE state IN('creating','awaiting_buyer','capture_requested','pending','needs_reconciliation') ORDER BY last_checked LIMIT 10",
      )
      .all() as any[];
    for (const o of active)
      try {
        db.prepare("UPDATE rc_orders SET last_checked=? WHERE id=?").run(
          Date.now(),
          o.id,
        );
        await reconcile(o.id, true);
      } catch {
        /* Persisted state remains available for the next bounded pass. */
      }
    for (const r of db
      .prepare("SELECT order_id FROM rc_refunds WHERE state='checking' LIMIT 5")
      .all() as any[]) {
      try {
        await refund(r.order_id);
      } catch {
        /* Still persisted; retry or merchant investigation remains possible. */
      }
    }
    for (const e of db
      .prepare(
        "SELECT id,body,attempts FROM rc_events WHERE state!='done' AND next_run<=? ORDER BY created LIMIT 10",
      )
      .all(Date.now()) as any[]) {
      try {
        await processEvent(JSON.parse(e.body));
        db.prepare(
          "UPDATE rc_events SET state='done',error=NULL WHERE id=?",
        ).run(e.id);
      } catch (err) {
        db.prepare(
          "UPDATE rc_events SET state='retry',error=?,attempts=attempts+1,next_run=? WHERE id=?",
        ).run(
          (err as Error).message,
          Date.now() + Math.min(900000, 15000 * 2 ** Math.min(e.attempts, 6)),
          e.id,
        );
      }
    }
  }
  return {
    ensure,
    reconcile,
    refund,
    restock,
    worker,
    receive,
    processEvent,
    observe,
    adjustment,
  };
}
