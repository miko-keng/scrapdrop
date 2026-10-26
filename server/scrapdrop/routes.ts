import type { Express, Response } from "express";
import { z } from "zod";
import { imageSize } from "image-size";
import { id, transaction, type Store } from "../store";
import { accountId } from "../market/store";
import { paypalReady } from "../paypal";
import { aiStatus, isLiveAI } from "../ai-mode";
import { buildKit, templates } from "../../src/scrapdrop/model";
import {
  ownedMaterials,
  saveOwned,
  quoteBatch,
  saveBatchJob,
  completeBatch,
  initScrap,
  inventory,
  pickupSlots,
  quote,
  reserveKit,
  expireHolds,
  cancelKit,
  finalizeKit,
  lockCapture,
  hash,
  fail,
  updateStock,
} from "./store";
import { buildBatchKit, batchSchema } from "../../src/scrapdrop/batch";
import { scrapPayments } from "./payments";
import { ideas, imageSuggestion } from "./ai";
const stockSchema = z.object({
  name: z.string().trim().min(3).max(100),
  type: z.enum(["card", "fabric", "ribbon"]),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  shade: z.string().trim().min(2).max(40),
  width: z.number().int().min(1).max(2000),
  length: z.number().int().min(1).max(3000),
  thickness: z.number().min(0.1).max(10),
  quantity: z.number().int().min(0).max(1000),
  price: z.number().int().min(0).max(100000),
  revision: z.number().int().optional(),
  active: z.boolean(),
  confirmed: z.literal(true),
  imageId: z.string().max(100).nullable().optional(),
});
export function registerScrap(
  app: Express,
  db: Store,
  context: {
    demo: boolean;
    limit: (key: string, max: number, ms: number) => void;
  },
) {
  initScrap(db);
  const payments = scrapPayments(db);
  const owner = (res: Response) =>
    accountId(db, res.locals.learner) || res.locals.learner;
  const requireAccount = (res: Response) =>
    accountId(db, res.locals.learner) ||
    fail("Sign in to reserve your kit and keep your orders.", 401);
  const operator = (res: Response) => {
    const aid = requireAccount(res);
    if (
      !process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID ||
      aid !== process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID
    )
      fail(
        "Only the configured shop operator can manage materials and pickup.",
        403,
      );
    return aid;
  };
  function ownOrder(res: Response, oid: string) {
    const aid = requireAccount(res),
      o = db
        .prepare("SELECT * FROM sd_orders WHERE id=? AND owner=?")
        .get(oid, aid) as any;
    if (!o) fail("Order not found.", 404);
    return o;
  }
  function dto(o: any, includeCode = true) {
    const p = db
      .prepare("SELECT * FROM sd_pickups WHERE order_id=?")
      .get(o.id) as any;
    const cap = db
      .prepare("SELECT id FROM sd_captures WHERE order_id=?")
      .get(o.id) as any;
    return {
      id: o.id,
      quoteId: o.quote,
      payment: o.payment,
      fulfillment: o.fulfillment,
      providerId: o.provider_id,
      kit: JSON.parse(o.body),
      expires: o.expires,
      created: o.created,
      source: cap?.id?.startsWith("DEMO-") ? "demo" : "paypal",
      pickupCode:
        includeCode &&
        o.payment === "paid" &&
        o.fulfillment === "ready" &&
        !p?.used
          ? p?.code
          : null,
    };
  }
  app.get("/api/scrapdrop/shop", (_req, res) => {
    expireHolds(db);
    const aid = accountId(db, res.locals.learner);
    res.json({
      name: "ScrapDrop Studio",
      pickup: "Studio collection desk · sandbox demonstration",
      hours: "Collect after the shop marks your kit ready.",
      sample: true,
      pickupSlots: pickupSlots(db),
      templates,
      inventory: inventory(db).filter(
        (m) =>
          aid === process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID ||
          (m.active && m.confirmed),
      ),
      operator: !!aid && aid === process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID,
      operatorConfigured: !!process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID,
      accountId: aid || null,
      ai: { ...aiStatus(), available: isLiveAI() },
      demo: context.demo,
      paypalReady: paypalReady(),
    });
  });

  app.get("/api/scrapdrop/owned", (_req, res) =>
    res.json(ownedMaterials(db, requireAccount(res))),
  );
  app.put("/api/scrapdrop/owned", (req, res) => {
    const { revision, materials } = z
      .object({ revision: z.number().int().min(0), materials: z.unknown() })
      .parse(req.body);
    res.json(saveOwned(db, requireAccount(res), revision, materials));
  });
  app.post("/api/scrapdrop/batch/plan", (req, res) => {
    context.limit(`sd-batch:${owner(res)}`, 80, 3600000);
    expireHolds(db);
    const input = batchSchema.parse(req.body);
    const kit = buildBatchKit(input, inventory(db));
    const alternatives = [{ id: "current", label: "Keep my design", kit }];
    if (input.config.templateId !== "wrap") {
      const config = {
        ...input.config,
        width: Math.max(25, Math.floor(input.config.width * 0.85)),
        depth: Math.max(30, Math.floor(input.config.depth * 0.85)),
        height:
          input.config.templateId === "giftbox"
            ? Math.max(20, Math.floor(input.config.height * 0.85))
            : input.config.height,
      };
      try {
        alternatives.push({
          id: "smaller",
          label: "A smaller finished size",
          kit: buildBatchKit({ ...input, config }, inventory(db)),
        });
      } catch {}
    }
    if (input.mixColors)
      try {
        const matching = buildBatchKit(
          { ...input, mixColors: false },
          inventory(db),
        );
        if (
          JSON.stringify(matching.batch!.plan.allocations) !==
          JSON.stringify(kit.batch!.plan.allocations)
        )
          alternatives.push({
            id: "matching",
            label: "Match the selected colors",
            kit: matching,
          });
      } catch {}
    res.json({ alternatives });
  });
  app.post("/api/scrapdrop/batch/quotes", (req, res) => {
    context.limit(`sd-batch-quote:${owner(res)}`, 40, 3600000);
    expireHolds(db);
    const { input, pickupSlotId } = z
      .object({ input: z.unknown(), pickupSlotId: z.string().optional() })
      .parse(req.body);
    res.json(quoteBatch(db, requireAccount(res), input, pickupSlotId));
  });
  app.get("/api/scrapdrop/batch/jobs", (_req, res) => {
    const aid = requireAccount(res);
    res.json(
      (
        db
          .prepare(
            "SELECT j.*,m.job AS made FROM sd_batch_jobs j LEFT JOIN sd_batch_made m ON m.job=j.id WHERE j.owner=? ORDER BY j.created DESC LIMIT 20",
          )
          .all(aid) as any[]
      ).map((j) => ({ id: j.id, kit: JSON.parse(j.body), made: !!j.made })),
    );
  });
  app.post("/api/scrapdrop/batch/jobs", (req, res) =>
    res.json(saveBatchJob(db, requireAccount(res), req.body)),
  );
  app.post("/api/scrapdrop/batch/:id/made", (req, res) =>
    res.json(completeBatch(db, requireAccount(res), String(req.params.id))),
  );
  app.post("/api/scrapdrop/ideas", async (req, res) => {
    context.limit(`sd-ideas:${owner(res)}`, 15, 3600000);
    expireHolds(db);
    const input = z
      .object({
        text: z.string().trim().min(5).max(1000),
        budget: z.number().int().min(100).max(100000),
        minutes: z.number().int().min(5).max(240),
        quantity: z.number().int().min(1).max(6),
        tools: z
          .array(z.enum(["scissors", "ruler", "glue", "hole punch"]))
          .max(4),
      })
      .parse(req.body);
    res.json(await ideas(db, owner(res), input, inventory(db)));
  });
  app.post("/api/scrapdrop/configurations/validate", (req, res) => {
    expireHolds(db);
    res.json(buildKit(req.body, inventory(db)));
  });
  app.post("/api/scrapdrop/quotes", (req, res) => {
    context.limit(`sd-quote:${owner(res)}`, 40, 3600000);
    expireHolds(db);
    const { pickupSlotId, ...configuration } = req.body;
    if (pickupSlotId !== undefined && typeof pickupSlotId !== "string")
      fail("Invalid pickup window.");
    res.json(quote(db, requireAccount(res), configuration, pickupSlotId));
  });
  app.post("/api/scrapdrop/checkout", async (req, res) => {
    context.limit(`sd-checkout:${owner(res)}`, 15, 3600000);
    if (!paypalReady())
      fail(
        "PayPal sandbox is not configured. Your kit has not been charged.",
        503,
      );
    const { quoteId, requestKey } = z
      .object({
        quoteId: z.string().min(1).max(100),
        requestKey: z.string().min(8).max(100),
        toolsConfirmed: z.literal(true),
      })
      .parse(req.body);
    const o = reserveKit(db, requireAccount(res), quoteId, requestKey);
    try {
      await payments.ensure(o.id);
    } catch {
      res.status(202).json({
        ...dto(db.prepare("SELECT * FROM sd_orders WHERE id=?").get(o.id)),
        message:
          "Your kit is reserved. Payment setup needs a status check; do not start a second order.",
      });
      return;
    }
    res.json(dto(db.prepare("SELECT * FROM sd_orders WHERE id=?").get(o.id)));
  });
  app.get("/api/scrapdrop/orders", (_req, res) => {
    expireHolds(db);
    res.json(
      (
        db
          .prepare(
            "SELECT * FROM sd_orders WHERE owner=? ORDER BY created DESC",
          )
          .all(requireAccount(res)) as any[]
      ).map((o) => dto(o)),
    );
  });
  app.get("/api/scrapdrop/orders/:id", async (req, res) => {
    expireHolds(db);
    let o = ownOrder(res, String(req.params.id));
    if (
      o.provider_id &&
      [
        "pending",
        "capture_requested",
        "needs_reconciliation",
        "needs_creation",
      ].includes(o.payment)
    )
      try {
        await payments.reconcile(o.id);
      } catch {}
    o = ownOrder(res, String(req.params.id));
    res.json(dto(o));
  });
  app.post("/api/scrapdrop/orders/:id/capture", async (req, res) => {
    const o = ownOrder(res, String(req.params.id));
    context.limit(`sd-capture:${o.id}`, 15, 3600000);
    if (o.payment !== "paid")
      try {
        await payments.capture(o.id);
      } catch (e) {
        if ((e as any).status) throw e;
        res.status(202).json({
          ...dto(ownOrder(res, o.id)),
          message:
            "Checking payment with PayPal. Keep this order and check its status.",
        });
        return;
      }
    res.json(dto(ownOrder(res, o.id)));
  });
  app.post("/api/scrapdrop/orders/:id/cancel", (req, res) => {
    const o = ownOrder(res, String(req.params.id));
    cancelKit(db, o.id);
    res.json(dto(ownOrder(res, o.id)));
  });
  app.post("/api/scrapdrop/demo-order", (req, res) => {
    if (!context.demo)
      fail("Demonstration payments are disabled in sandbox mode.", 403);
    const aid = requireAccount(res),
      { quoteId, requestKey } = z
        .object({
          quoteId: z.string(),
          requestKey: z.string().min(8).max(100),
          toolsConfirmed: z.literal(true),
        })
        .parse(req.body);
    let o = reserveKit(db, aid, quoteId, requestKey);
    if (o.payment !== "paid") {
      db.prepare(
        "UPDATE sd_orders SET merchant='demo-seller',payment='awaiting_buyer' WHERE id=?",
      ).run(o.id);
      lockCapture(db, o.id);
      finalizeKit(db, o.id, {
        id: `DEMO-${o.id}`,
        amount: (JSON.parse(o.body).total / 100).toFixed(2),
        currency: "USD",
        merchant: "demo-seller",
        status: "COMPLETED",
      });
    }
    res.json(dto(ownOrder(res, o.id)));
  });
  app.get("/api/scrapdrop/orders/:id/instructions", (req, res) => {
    const o = ownOrder(res, String(req.params.id));
    if (o.payment !== "paid" || o.fulfillment === "paid_needs_resolution")
      fail("A confirmed paid kit is required.", 403);
    const k = JSON.parse(o.body);
    res.json({
      title: k.template.title,
      steps: k.template.guide,
      tools: k.template.tools,
      cut: k.cut,
      materials: k.lines,
      config: k.config,
      warnings: k.warnings,
    });
  });
  app.get("/api/scrapdrop/operator/orders", (_req, res) => {
    operator(res);
    res.json(
      (
        db
          .prepare("SELECT * FROM sd_orders ORDER BY created DESC LIMIT 100")
          .all() as any[]
      ).map((o) => dto(o, false)),
    );
  });
  app.post("/api/scrapdrop/operator/orders/:id/ready", (req, res) => {
    operator(res);
    const result = db
      .prepare(
        "UPDATE sd_orders SET fulfillment='ready' WHERE id=? AND payment='paid' AND fulfillment='preparing'",
      )
      .run(String(req.params.id));
    if (!result.changes)
      fail("Only a paid, preparing kit can be marked ready.", 409);
    res.json({ ready: true });
  });
  app.post("/api/scrapdrop/operator/pickups/redeem", (req, res) => {
    operator(res);
    const { code } = z
      .object({ code: z.string().min(20).max(100) })
      .parse(req.body);
    context.limit(`sd-pickup:${res.locals.learner}`, 20, 60000);
    transaction(db, () => {
      const p = db
        .prepare(
          "SELECT p.*,o.payment,o.fulfillment FROM sd_pickups p JOIN sd_orders o ON o.id=p.order_id WHERE code_hash=?",
        )
        .get(hash(code)) as any;
      if (!p || p.used || p.payment !== "paid" || p.fulfillment !== "ready")
        fail(
          "This pickup code is not ready, has already been used, or was canceled.",
          409,
        );
      db.prepare(
        "UPDATE sd_pickups SET used=1 WHERE order_id=? AND used=0",
      ).run(p.order_id);
      db.prepare("UPDATE sd_orders SET fulfillment='collected' WHERE id=?").run(
        p.order_id,
      );
    });
    res.json({ collected: true });
  });
  app.post("/api/scrapdrop/operator/orders/:id/return", (req, res) => {
    operator(res);
    const { itemId, units } = z
      .object({ itemId: z.string(), units: z.number().int().min(1).max(1000) })
      .parse(req.body);
    transaction(db, () => {
      const o = db
        .prepare("SELECT payment FROM sd_orders WHERE id=?")
        .get(String(req.params.id)) as any;
      if (
        !o ||
        !["refunded", "partially_refunded", "reversed"].includes(o.payment)
      )
        fail(
          "Record a confirmed refund or reversal before returning stock.",
          409,
        );
      const h = db
        .prepare(
          "SELECT * FROM sd_holds WHERE order_id=? AND item=? AND state='committed'",
        )
        .get(String(req.params.id), itemId) as any;
      if (!h || h.units !== units)
        fail(
          "Confirm the full original unit allocation for this material.",
          409,
        );
      db.prepare(
        "UPDATE sd_holds SET state='returned' WHERE order_id=? AND item=?",
      ).run(String(req.params.id), itemId);
      db.prepare("INSERT INTO sd_ledger VALUES(?,?,?,?,?,?)").run(
        id("ledger"),
        itemId,
        units,
        "returned",
        `return:${req.params.id}:${itemId}`,
        Date.now(),
      );
    });
    res.json({ returned: true });
  });
  app.post("/api/scrapdrop/operator/inventory", (req, res) => {
    const aid = operator(res);
    context.limit(`sd-stock:${aid}`, 40, 3600000);
    const input = stockSchema.parse(req.body);
    if (
      input.imageId &&
      !db
        .prepare("SELECT id FROM sd_images WHERE id=? AND owner=?")
        .get(input.imageId, aid)
    )
      fail("Image not found.");
    const sid = id("stock");
    db.prepare("INSERT INTO sd_stock VALUES(?,?,?,1)").run(
      sid,
      JSON.stringify({ ...input, id: sid, sample: false }),
      input.quantity,
    );
    res.json({ id: sid });
  });
  app.patch("/api/scrapdrop/operator/inventory/:id", (req, res) => {
    const aid = operator(res);
    const input = stockSchema.parse(req.body);
    if (
      input.imageId &&
      !db
        .prepare("SELECT id FROM sd_images WHERE id=? AND owner=?")
        .get(input.imageId, aid)
    )
      fail("Image not found.");
    updateStock(db, String(req.params.id), input);
    res.json({ saved: true });
  });
  app.post("/api/scrapdrop/operator/images", (req, res) => {
    const aid = operator(res);
    context.limit(`sd-image:${aid}`, 30, 3600000);
    const input = z
      .object({
        type: z.enum(["image/png", "image/jpeg"]),
        data: z.string().max(2800000),
      })
      .parse(req.body);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data) || input.data.length % 4)
      fail("Invalid image encoding.");
    let bytes = Buffer.from(input.data, "base64");
    if (bytes.length > 2 * 1024 * 1024)
      fail("Use an image no larger than 2 MB.");
    const size = imageSize(bytes);
    if (
      !["png", "jpg"].includes(size.type || "") ||
      (size.type === "png") !== (input.type === "image/png") ||
      !size.width ||
      !size.height ||
      size.width * size.height > 16000000
    )
      fail("Use a valid JPEG/PNG up to 16 megapixels.");
    if (size.type === "png") {
      let offset = 8;
      const chunks = [bytes.subarray(0, 8)];
      let complete = false;
      while (offset + 12 <= bytes.length) {
        const n = bytes.readUInt32BE(offset),
          end = offset + 12 + n;
        if (end > bytes.length) fail("Invalid PNG.");
        const kind = bytes.subarray(offset + 4, offset + 8).toString("ascii");
        if (["IHDR", "PLTE", "IDAT", "tRNS", "IEND"].includes(kind))
          chunks.push(bytes.subarray(offset, end));
        offset = end;
        if (kind === "IEND") {
          complete = true;
          break;
        }
      }
      if (!complete) fail("Invalid PNG.");
      bytes = Buffer.concat(chunks);
    }
    if (size.type === "jpg") {
      let off = 2;
      const chunks = [bytes.subarray(0, 2)];
      while (off + 4 < bytes.length && bytes[off] === 255) {
        const marker = bytes[off + 1];
        if (marker === 218) break;
        const n = bytes.readUInt16BE(off + 2);
        if (n < 2 || off + n + 2 > bytes.length) fail("Invalid JPEG.");
        if (marker !== 225) chunks.push(bytes.subarray(off, off + n + 2));
        off += n + 2;
      }
      chunks.push(bytes.subarray(off));
      bytes = Buffer.concat(chunks);
    }
    const iid = id("image");
    db.prepare("INSERT INTO sd_images VALUES(?,?,?,?,?)").run(
      iid,
      aid,
      input.type,
      bytes,
      Date.now(),
    );
    res.json({ id: iid, width: size.width, height: size.height });
  });
  app.get("/api/scrapdrop/images/:id", (_req, res) => {
    const image = db
      .prepare("SELECT * FROM sd_images WHERE id=?")
      .get(String(_req.params.id)) as any;
    if (!image) fail("Image not found.", 404);
    const published = inventory(db).some(
      (s) => s.imageId === image.id && s.active && s.confirmed,
    );
    if (!published && image.owner !== accountId(db, res.locals.learner))
      fail("Image not found.", 404);
    res.type(image.type).send(image.bytes);
  });
  app.post("/api/scrapdrop/operator/images/:id/suggest", async (req, res) => {
    const aid = operator(res);
    if (req.body?.shareWithAI !== true)
      fail("Confirm sending this selected image to AI first.");
    const image = db
      .prepare("SELECT * FROM sd_images WHERE id=? AND owner=?")
      .get(String(req.params.id), aid) as any;
    if (!image) fail("Image not found.", 404);
    res.json(
      await imageSuggestion(db, aid, {
        type: image.type,
        bytes: Buffer.from(image.bytes),
      }),
    );
  });
  return payments;
}
