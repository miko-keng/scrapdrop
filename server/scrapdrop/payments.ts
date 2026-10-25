import { type Store } from "../store";
import { paypal, paypalReady, captureObservation } from "../paypal";
import { finalizeKit, lockCapture, expireHolds } from "./store";
export type PaymentTransport = typeof paypal;
export function scrapPayments(db: Store, transport: PaymentTransport = paypal) {
  async function ensure(oid: string) {
    let o = db.prepare("SELECT * FROM sd_orders WHERE id=?").get(oid) as any;
    if (!o) throw Error("Kit order not found.");
    if (o.provider_id && o.merchant) return o;
    if (o.provider_id) {
      const details = await transport(`/v2/checkout/orders/${o.provider_id}`);
      const merchant = details.purchase_units?.[0]?.payee?.merchant_id;
      if (
        !merchant ||
        (process.env.PAYPAL_MERCHANT_ID &&
          merchant !== process.env.PAYPAL_MERCHANT_ID)
      )
        throw Error("Seller verification is pending.");
      db.prepare(
        "UPDATE sd_orders SET merchant=?,payment=CASE WHEN payment IN ('creating','needs_creation') THEN 'awaiting_buyer' ELSE payment END WHERE id=?",
      ).run(merchant, o.id);
      return db.prepare("SELECT * FROM sd_orders WHERE id=?").get(o.id) as any;
    }
    if (
      !["creating", "needs_creation"].includes(o.payment) ||
      o.expires <= Date.now()
    )
      throw Error("The kit reservation expired.");
    const kit = JSON.parse(o.body);
    try {
      const p = await transport(
        "/v2/checkout/orders",
        "POST",
        {
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: o.id,
              custom_id: o.id,
              description: `ScrapDrop: ${kit.template.title}`,
              amount: {
                currency_code: "USD",
                value: (kit.total / 100).toFixed(2),
              },
              ...(process.env.PAYPAL_MERCHANT_ID
                ? { payee: { merchant_id: process.env.PAYPAL_MERCHANT_ID } }
                : {}),
            },
          ],
        },
        `sd-create-${o.id}`,
      );
      db.prepare("UPDATE sd_orders SET provider_id=? WHERE id=?").run(
        p.id,
        o.id,
      );
      const details = p.purchase_units?.[0]?.payee?.merchant_id
        ? p
        : await transport(`/v2/checkout/orders/${p.id}`);
      const merchant = details.purchase_units?.[0]?.payee?.merchant_id;
      if (
        !merchant ||
        (process.env.PAYPAL_MERCHANT_ID &&
          merchant !== process.env.PAYPAL_MERCHANT_ID)
      )
        throw Error("The sandbox seller could not be verified.");
      db.prepare(
        "UPDATE sd_orders SET merchant=?,payment=CASE WHEN payment IN ('creating','needs_creation') THEN 'awaiting_buyer' ELSE payment END WHERE id=?",
      ).run(merchant, o.id);
      return db.prepare("SELECT * FROM sd_orders WHERE id=?").get(o.id) as any;
    } catch (e) {
      db.prepare(
        "UPDATE sd_orders SET payment='needs_creation' WHERE id=? AND payment='creating'",
      ).run(o.id);
      throw e;
    }
  }
  async function reconcile(oid: string) {
    let o = db.prepare("SELECT * FROM sd_orders WHERE id=?").get(oid) as any;
    if (!o) return;
    if (!o.provider_id) {
      await ensure(oid);
      return;
    }
    let p = await transport(`/v2/checkout/orders/${o.provider_id}`);
    if (!o.merchant) {
      const merchant = p.purchase_units?.[0]?.payee?.merchant_id;
      if (
        !merchant ||
        (process.env.PAYPAL_MERCHANT_ID &&
          merchant !== process.env.PAYPAL_MERCHANT_ID)
      )
        throw Error("Seller verification is pending.");
      db.prepare(
        "UPDATE sd_orders SET merchant=?,payment=CASE WHEN payment IN ('creating','needs_creation') THEN 'awaiting_buyer' ELSE payment END WHERE id=?",
      ).run(merchant, oid);
      o = {
        ...o,
        merchant,
        payment: ["creating", "needs_creation"].includes(o.payment)
          ? "awaiting_buyer"
          : o.payment,
      };
    }
    if (
      p.status === "APPROVED" &&
      ["capture_requested", "needs_reconciliation"].includes(o.payment)
    ) {
      await transport(
        `/v2/checkout/orders/${o.provider_id}/capture`,
        "POST",
        {},
        `sd-capture-${oid}`,
      );
      p = await transport(`/v2/checkout/orders/${o.provider_id}`);
    }
    const capture = p.purchase_units?.[0]?.payments?.captures?.[0];
    if (p.status === "COMPLETED" && capture?.status === "COMPLETED")
      finalizeKit(db, oid, captureObservation(p));
    else if (capture?.status === "PENDING")
      db.prepare(
        "UPDATE sd_orders SET payment='pending' WHERE id=? AND payment NOT IN ('paid','refunded','reversed','partially_refunded')",
      ).run(oid);
    else if (
      ["DECLINED", "DENIED", "FAILED"].includes(capture?.status) ||
      p.status === "VOIDED"
    ) {
      db.prepare(
        "UPDATE sd_orders SET payment='denied',fulfillment='canceled' WHERE id=? AND payment NOT IN ('paid','refunded','reversed','partially_refunded')",
      ).run(oid);
      db.prepare(
        "UPDATE sd_holds SET state='released' WHERE order_id=? AND state IN ('held','capture_locked') AND NOT EXISTS(SELECT 1 FROM sd_captures WHERE order_id=?)",
      ).run(oid, oid);
    }
  }
  async function capture(oid: string) {
    lockCapture(db, oid);
    try {
      await reconcile(oid);
    } catch (e) {
      db.prepare(
        "UPDATE sd_orders SET payment='needs_reconciliation' WHERE id=? AND payment='capture_requested'",
      ).run(oid);
      throw e;
    }
  }
  async function event(event: any) {
    const providerId =
      event.resource?.supplementary_data?.related_ids?.order_id;
    let order = providerId
      ? (db
          .prepare("SELECT * FROM sd_orders WHERE provider_id=?")
          .get(providerId) as any)
      : null;
    let captureId = event.resource?.supplementary_data?.related_ids?.capture_id;
    if (!captureId && event.event_type === "PAYMENT.CAPTURE.REVERSED")
      captureId = event.resource?.id;
    if (
      !captureId &&
      event.event_type === "PAYMENT.CAPTURE.REFUNDED" &&
      event.resource?.id
    ) {
      const refund = await transport(
        `/v2/payments/refunds/${event.resource.id}`,
      );
      const up = refund.links?.find((x: any) => x.rel === "up")?.href;
      captureId = /\/v2\/payments\/captures\/([A-Z0-9]+)$/.exec(up || "")?.[1];
    }
    if (!order) {
      const c = db
        .prepare("SELECT order_id FROM sd_captures WHERE id=?")
        .get(captureId || event.resource?.id || "") as any;
      if (c)
        order = db
          .prepare("SELECT * FROM sd_orders WHERE id=?")
          .get(c.order_id);
    }
    if (!order) return false;
    if (
      ["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED"].includes(
        event.event_type,
      ) &&
      captureId
    ) {
      const c = await transport(`/v2/payments/captures/${captureId}`);
      if (
        ["REFUNDED", "PARTIALLY_REFUNDED", "REVERSED", "DECLINED"].includes(
          c.status,
        )
      ) {
        const state =
          c.status === "REFUNDED"
            ? "refunded"
            : c.status === "PARTIALLY_REFUNDED"
              ? "partially_refunded"
              : "reversed";
        db.prepare(
          "UPDATE sd_orders SET payment=?,fulfillment=CASE WHEN fulfillment='collected' THEN 'collected' ELSE 'canceled' END WHERE id=?",
        ).run(state, order.id);
      }
    } else await reconcile(order.id);
    return true;
  }
  async function worker() {
    expireHolds(db);
    if (!paypalReady() && transport === paypal) return;
    for (const o of db
      .prepare(
        "SELECT id FROM sd_orders WHERE payment IN ('creating','needs_creation','capture_requested','pending','needs_reconciliation') LIMIT 5",
      )
      .all() as any[])
      try {
        await reconcile(o.id);
      } catch {}
  }
  return { ensure, capture, reconcile, event, worker };
}
