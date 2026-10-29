import { assist } from "./assistant";
import { assignOwner, owns, requireOwned } from "./accounts";
import { z } from "zod";
import Papa from "papaparse";
import {
  hash,
  uid,
  fail,
  productIssues,
  candidateSchema,
  cents,
} from "./domain";
import {
  incident,
  save,
  viewIncident,
  tx,
  available,
  createIncident,
  openRC,
  type DB,
} from "./store";
import { sourceList, addSource, csvCandidates } from "./sources";

export function meta(db: DB, key: string, fallback: any = {}) {
  const row = db
    .prepare("SELECT value FROM rc_meta WHERE key=?")
    .get(key) as any;
  return row ? JSON.parse(row.value) : fallback;
}
export function putMeta(db: DB, key: string, value: any) {
  db.prepare("INSERT OR REPLACE INTO rc_meta VALUES(?,?)").run(
    key,
    JSON.stringify(value),
  );
}
export function readiness(db: DB, id: string) {
  const i = incident(db, id),
    counts = meta(db, `counts:${id}`),
    photos = meta(db, `photos:${id}`);
  const products = i.products.map((p) => {
    const count = Object.hasOwn(counts, p.sku) ? counts[p.sku] : null;
    const questions = productIssues(p).filter(
      (q) => !q.startsWith("Allocation"),
    );
    if (!p.allocation)
      questions.push(
        "Reserve at least one physical unit, or exclude this product",
      );
    if (!count || count.allocation !== p.allocation)
      questions.push("Confirm the physical stock count for this allocation");
    if (p.imageSourceId && photos[p.sku] !== p.imageSourceId)
      questions.push(
        "Confirm the suggested photo belongs to this exact variant",
      );
    const prices = [
      ...new Set(
        p.candidates.filter((e) => e.field === "price").map((e) => e.value),
      ),
    ];
    if (prices.length > 1 && !p.resolutionNote.trim())
      questions.push(`Explain which price is current (${prices.join(" / ")})`);
    return {
      sku: p.sku,
      name: p.name,
      status: p.excluded
        ? "excluded"
        : questions.length
          ? "needs-information"
          : "ready",
      questions: p.excluded ? [] : questions,
      count: count || null,
      stale: !!count && Date.now() - count.at > 7 * 86400000,
      available: available(db, id, p.sku, p.allocation),
      priceCandidates: prices,
      imageSourceId: p.imageSourceId || null,
    };
  });
  return {
    rehearsal: meta(db, `rehearsal:${id}`, null),
    products,
    ready: products.filter((p) => p.status === "ready").length,
    needsInformation: products.filter((p) => p.status === "needs-information")
      .length,
    excluded: products.filter((p) => p.status === "excluded").length,
  };
}
export const originalSchema = z
  .object({
    schema: z.literal("restorecart.original-store.v1"),
    storeId: z.string().min(1).max(80),
    revision: z.number().int().nonnegative(),
    exportedAt: z.iso.datetime(),
    inventory: z
      .array(
        z
          .object({
            sku: z.string().min(1).max(80),
            quantity: z.number().int().min(0).max(1000000),
          })
          .strict(),
      )
      .max(500),
    orders: z
      .array(
        z
          .object({
            emergencyOrderId: z.string(),
            capture: z.string(),
            amount: z.number().int().nonnegative(),
            refunded: z.number().int().nonnegative(),
            fulfillment: z.string(),
            lines: z.array(
              z
                .object({
                  sku: z.string(),
                  quantity: z.number().int().positive(),
                  unitCents: z.number().int().positive(),
                })
                .strict(),
            ),
          })
          .strict(),
      )
      .max(5000),
    inventoryEvents: z
      .array(
        z
          .object({ key: z.string(), sku: z.string(), units: z.number().int() })
          .strict(),
      )
      .max(10000),
  })
  .strict();
export type Original = z.infer<typeof originalSchema>;
export function originalExample(db: DB, id: string): Original {
  const i = incident(db, id);
  return {
    schema: "restorecart.original-store.v1",
    storeId: `practice-${id}`,
    revision: 0,
    exportedAt: new Date().toISOString(),
    inventory: i.products.map((p) => ({
      sku: p.sku,
      quantity: Math.max(
        p.allocation,
        Number(p.candidates.find((e) => e.field === "stock")?.value) || 0,
      ),
    })),
    orders: [],
    inventoryEvents: [],
  };
}
function validateOriginal(input: unknown) {
  const o = originalSchema.parse(input);
  if (Date.parse(o.exportedAt) > Date.now() + 60000)
    fail("The original-store export date is in the future.");
  if (
    new Set(o.inventory.map((p) => p.sku)).size !== o.inventory.length ||
    new Set(o.orders.map((p) => p.emergencyOrderId)).size !== o.orders.length ||
    new Set(o.orders.map((p) => p.capture)).size !== o.orders.length ||
    new Set(o.inventoryEvents.map((p) => p.key)).size !==
      o.inventoryEvents.length
  )
    fail(
      "Duplicate SKUs, order references or inventory event references in the original export.",
    );
  if (o.orders.some((p) => p.refunded > p.amount))
    fail("Refunds cannot exceed captured amounts.");
  return o;
}
export function reconciliation(db: DB, id: string, input: unknown) {
  const i = incident(db, id),
    original = validateOriginal(input);
  if (!["closing", "closed"].includes(i.state))
    fail(
      "Close new checkouts before comparing the return to your original store.",
      409,
    );
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
    fail("Resolve pending payments and refunds before reconciliation.", 409);
  const saved = meta(db, `destination:${original.storeId}`, null);
  if (
    saved &&
    (saved.revision > original.revision ||
      (saved.revision === original.revision &&
        hash(JSON.stringify(saved)) !== hash(JSON.stringify(original))))
  )
    fail(
      "This original-store export is stale. Download the latest local destination, or supply a newer export.",
      409,
    );
  if (
    saved &&
    (saved.inventoryEvents.some(
      (e: any) =>
        !original.inventoryEvents.some(
          (v) => v.key === e.key && v.sku === e.sku && v.units === e.units,
        ),
    ) ||
      saved.orders.some(
        (o: any) =>
          !original.orders.some(
            (v) =>
              v.emergencyOrderId === o.emergencyOrderId &&
              v.capture === o.capture,
          ),
      ))
  )
    fail(
      "The newer export dropped recorded emergency history. Preserve order and inventory event references before comparing.",
      409,
    );
  const captured = (
    db
      .prepare(
        "SELECT * FROM rc_orders WHERE incident=? AND capture IS NOT NULL ORDER BY id",
      )
      .all(id) as any[]
  ).map((o) => ({
    emergencyOrderId: o.id,
    capture: o.capture,
    amount: o.amount,
    refunded: o.refunded,
    fulfillment: o.fulfillment,
    lines: JSON.parse(o.body).lines.map((l: any) => ({
      sku: l.sku,
      quantity: l.quantity,
      unitCents: l.unitCents,
    })),
  }));
  const changes: any[] = [],
    conflicts: string[] = [],
    next = structuredClone(original);
  for (const o of captured) {
    const previous = next.orders.find(
      (p) => p.emergencyOrderId === o.emergencyOrderId,
    );
    if (
      previous &&
      (previous.capture !== o.capture ||
        previous.amount !== o.amount ||
        JSON.stringify(previous.lines) !== JSON.stringify(o.lines))
    ) {
      conflicts.push(
        `Order ${o.emergencyOrderId} has conflicting payment or line details`,
      );
      continue;
    }
    if (
      previous &&
      (previous.refunded > o.refunded ||
        (previous.fulfillment === "collected" && o.fulfillment !== "collected"))
    ) {
      conflicts.push(
        `Order ${o.emergencyOrderId} has newer refund or collection information in the original store; resolve it before returning changes`,
      );
      continue;
    }
    if (!previous && original.orders.some((p) => p.capture === o.capture)) {
      conflicts.push(
        `Capture ${o.capture} already belongs to another original-store order`,
      );
      continue;
    }
    if (!previous) {
      next.orders.push(o);
      changes.push({
        kind: "order",
        reference: o.emergencyOrderId,
        action: "add",
        amount: o.amount,
        refunded: o.refunded,
        fulfillment: o.fulfillment,
      });
    } else if (JSON.stringify(previous) !== JSON.stringify(o)) {
      Object.assign(previous, o);
      changes.push({
        kind: "order",
        reference: o.emergencyOrderId,
        action: "update",
        amount: o.amount,
        refunded: o.refunded,
        fulfillment: o.fulfillment,
      });
    }
  }
  const moves = db
    .prepare(
      "SELECT m.* FROM rc_moves m JOIN rc_orders o ON o.id=m.order_id WHERE m.incident=? AND o.capture IS NOT NULL ORDER BY m.event_key",
    )
    .all(id) as any[];
  for (const m of moves) {
    const old = next.inventoryEvents.find((e) => e.key === m.event_key);
    if (old) {
      if (old.sku !== m.sku || old.units !== m.units)
        conflicts.push(
          `Inventory event ${m.event_key} has conflicting details`,
        );
      continue;
    }
    if (
      m.kind === "sale" &&
      original.orders.some((o) => o.emergencyOrderId === m.order_id)
    ) {
      conflicts.push(
        `Order ${m.order_id} exists without inventory trace ${m.event_key}; supply the matching event history before applying stock again`,
      );
      continue;
    }
    const stock = next.inventory.find((p) => p.sku === m.sku);
    if (!stock) {
      conflicts.push(`Missing original-store SKU ${m.sku}`);
      continue;
    }
    stock.quantity += m.units;
    next.inventoryEvents.push({ key: m.event_key, sku: m.sku, units: m.units });
    changes.push({
      kind: "inventory",
      reference: m.event_key,
      sku: m.sku,
      units: m.units,
    });
  }
  for (const p of next.inventory)
    if (p.quantity < 0)
      conflicts.push(`Not enough original-store stock for ${p.sku}`);
  const fingerprint = hash(
    JSON.stringify([captured, moves.map((m) => [m.event_key, m.sku, m.units])]),
  );
  return {
    schema: "restorecart.reconciliation.v1",
    storeId: original.storeId,
    incidentId: id,
    original,
    changes,
    conflicts,
    canApply: !conflicts.length,
    alreadyRecorded:
      captured.length - changes.filter((c) => c.kind === "order").length,
    totals: {
      captured: captured.reduce((n, o) => n + o.amount, 0),
      refunded: captured.reduce((n, o) => n + o.refunded, 0),
    },
    inventory: next.inventory,
    fingerprint,
    next,
  };
}
export function applyReconciliation(db: DB, id: string, previewId: string) {
  return tx(db, () => {
    const stored = meta(db, `preview:${previewId}`, null);
    if (!stored || stored.incidentId !== id)
      fail("Comparison not found. Compare again.", 404);
    const applied = meta(db, `applied:${previewId}`, null);
    if (applied) return { ...applied, repeated: true };
    const fresh = reconciliation(db, id, stored.original);
    if (fresh.fingerprint !== stored.fingerprint)
      fail("Emergency records changed. Compare again before applying.", 409);
    if (fresh.conflicts.length) fail(fresh.conflicts.join("; "), 409);
    const output = structuredClone(fresh.next);
    if (fresh.changes.length) {
      output.revision++;
      output.exportedAt = new Date().toISOString();
    }
    putMeta(db, `destination:${output.storeId}`, output);
    const result = {
      id: previewId,
      storeId: output.storeId,
      changesApplied: fresh.changes.length,
      repeated: false,
      output,
      scope:
        "Local Original Store JSON v1 updated. No external website or payment was changed.",
    };
    putMeta(db, `applied:${previewId}`, result);
    putMeta(db, `return:${id}`, { storeId: output.storeId, previewId });
    return result;
  });
}
const contactSchema = z
  .object({
    contact: z.string().max(160),
    hours: z.string().max(160),
    status: z.string().max(300),
  })
  .strict();
export function mountContinuity(router: any, db: DB, seller: any, wrap: any) {
  const get = (path: string, fn: any) => router.get(path, seller, wrap(fn));
  const post = (path: string, fn: any) => router.post(path, seller, wrap(fn));
  post("/incidents/:id/review", async (req: any, res: any) =>
    res.json(await assist(db, String(req.params.id), "review")),
  );
  post("/incidents/:id/payment-help", async (req: any, res: any) => {
    const body = z.object({ orderId: z.string() }).strict().parse(req.body);
    res.json(await assist(db, String(req.params.id), "payment", body.orderId));
  });
  post("/incidents/:id/editor-product", (req: any, res: any) => {
    const id = String(req.params.id),
      b = z
        .object({
          revision: z.number().int(),
          sku: z.string().trim().min(1).max(80),
          name: z.string().trim().min(1).max(160),
          description: z.string().max(1000),
          price: z.string(),
          quantity: z.number().int().min(0).max(10000),
          allocation: z.number().int().min(0).max(10000),
          excluded: z.boolean(),
          confirm: z.boolean(),
          create: z.boolean().default(false),
          resolutionNote: z.string().max(1000),
          imageSourceId: z.string(),
        })
        .strict()
        .parse(req.body);
    tx(db, () => {
      const i = incident(db, id);
      if (i.revision !== b.revision || !["draft", "live"].includes(i.state))
        fail("This draft changed or closed. Refresh before saving.", 409);
      let p = i.products.find((p) => p.sku === b.sku);
      if (b.create && p)
        fail(
          "This SKU already exists. Edit that product or choose a different SKU.",
          409,
        );
      if (!p) {
        if (i.products.length >= 50) fail("The catalog limit is 50 products.");
        p = {
          sku: b.sku,
          name: b.name,
          description: b.description,
          candidates: [],
          price: "",
          currency: "USD",
          allocation: 0,
          excluded: false,
          resolved: false,
          resolutionNote: "",
        };
        i.products.push(p);
      }
      const committed = p.allocation - available(db, id, p.sku, p.allocation);
      if (
        b.allocation < committed ||
        b.quantity < committed ||
        b.allocation > b.quantity
      )
        fail(
          "Set aside no more than your physical count, and keep already committed units covered.",
        );
      if (
        b.imageSourceId &&
        !sourceList(db, id).some(
          (s) => s.id === b.imageSourceId && s.mime.startsWith("image/"),
        )
      )
        fail("Choose an image uploaded to this shop.");
      if (!b.excluded) {
        cents(b.price);
        if (!b.confirm)
          fail("Confirm the details and physical count before saving.");
        if (
          new Set(
            p.candidates.filter((e) => e.field === "price").map((e) => e.value),
          ).size > 1 &&
          !b.resolutionNote.trim()
        )
          fail("Explain which source confirms the current price.");
      }
      Object.assign(p, {
        name: b.name,
        description: b.description,
        price: b.price,
        currency: "USD",
        allocation: b.allocation,
        excluded: b.excluded,
        resolved: b.confirm,
        resolutionNote: b.resolutionNote,
        imageSourceId: b.imageSourceId || undefined,
      });
      putMeta(db, `photos:${id}`, {
        ...meta(db, `photos:${id}`),
        [p.sku]: b.imageSourceId,
      });
      if (b.confirm)
        putMeta(db, `counts:${id}`, {
          ...meta(db, `counts:${id}`),
          [p.sku]: {
            quantity: b.quantity,
            allocation: b.allocation,
            at: Date.now(),
          },
        });
      i.revision++;
      save(db, i);
    });
    res.json(viewIncident(db, id));
  });
  get("/incidents/:id/readiness", (req: any, res: any) =>
    res.json(readiness(db, String(req.params.id))),
  );
  get("/incidents/:id/mappings", (req: any, res: any) =>
    res.json(
      sourceList(db, String(req.params.id))
        .filter((s) => s.mime === "text/csv")
        .map((s) => {
          const rows = Papa.parse<string[]>(s.text, {
            skipEmptyLines: "greedy",
          }).data;
          return {
            id: s.id,
            name: s.name,
            headers: rows[0] || [],
            sample: rows.slice(1, 4),
            settings: meta(db, `source:${s.id}`),
            recognizedProducts: csvCandidates(s).length,
          };
        }),
    ),
  );
  post("/incidents/:id/mappings", (req: any, res: any) => {
    const id = String(req.params.id),
      i = incident(db, id);
    if (!["draft", "live"].includes(i.state)) fail("This shop is closed.", 409);
    const b = z
      .object({
        sourceId: z.string(),
        mapping: z.record(
          z.enum(["sku", "name", "price", "currency", "stock", "description"]),
          z.string().max(160),
        ),
        observedAt: z.union([z.literal(""), z.iso.datetime()]),
      })
      .parse(req.body);
    const source = sourceList(db, id).find(
      (s) => s.id === b.sourceId && s.mime === "text/csv",
    );
    if (!source) fail("CSV source not found.", 404);
    const headers =
      Papa.parse<string[]>(source.text, { skipEmptyLines: "greedy" }).data[0] ||
      [];
    const assigned = Object.values(b.mapping).filter(Boolean);
    if (
      !b.mapping.sku ||
      !b.mapping.name ||
      assigned.some((h) => !headers.includes(h)) ||
      new Set(assigned).size !== assigned.length
    )
      fail(
        "Map unique columns for SKU and product name; choose only columns in this file.",
      );
    if (b.observedAt && Date.parse(b.observedAt) > Date.now() + 60000)
      fail("Source date cannot be in the future.");
    putMeta(db, `source:${source.id}`, {
      ...meta(db, `source:${source.id}`),
      mapping: b.mapping,
      observedAt: b.observedAt,
    });
    i.revision++;
    save(db, i);
    res.json({
      recognizedProducts: csvCandidates({ ...source, columnMapping: b.mapping })
        .length,
      incident: viewIncident(db, id),
    });
  });
  post("/incidents/:id/answer", (req: any, res: any) => {
    const id = String(req.params.id),
      b = z
        .object({
          sku: z.string(),
          price: z.string().optional(),
          currency: z.literal("USD").optional(),
          name: z.string().trim().min(1).max(160).optional(),
          resolutionNote: z.string().max(1000),
          imageSourceId: z.string().optional(),
          confirm: z.boolean(),
          revision: z.number().int(),
        })
        .strict()
        .parse(req.body);
    tx(db, () => {
      const i = incident(db, id);
      if (!["draft", "live"].includes(i.state) || i.revision !== b.revision)
        fail("Draft changed or closed. Refresh before answering.", 409);
      const p = i.products.find((p) => p.sku === b.sku);
      if (!p) fail("Product not found.", 404);
      if (b.price !== undefined) p.price = b.price;
      if (b.name !== undefined) p.name = b.name;
      if (b.currency) p.currency = b.currency;
      p.resolutionNote = b.resolutionNote;
      p.resolved = b.confirm;
      if (b.imageSourceId !== undefined) {
        if (
          b.imageSourceId &&
          !sourceList(db, id).some(
            (s) => s.id === b.imageSourceId && s.mime.startsWith("image/"),
          )
        )
          fail("Photo does not belong to this shop.");
        p.imageSourceId = b.imageSourceId || undefined;
        const photos = meta(db, `photos:${id}`);
        putMeta(db, `photos:${id}`, { ...photos, [p.sku]: b.imageSourceId });
      }
      if (
        b.confirm &&
        productIssues(p).some((q) => !q.startsWith("Allocation"))
      )
        fail("Enter a valid name, SKU, USD price and confirm the details.");
      i.revision++;
      save(db, i);
    });
    res.json(viewIncident(db, id));
  });
  post("/incidents/:id/count", (req: any, res: any) => {
    const id = String(req.params.id),
      b = z
        .object({
          revision: z.number().int(),
          sku: z.string(),
          quantity: z.number().int().min(0).max(10000),
          allocation: z.number().int().min(0).max(10000),
        })
        .parse(req.body);
    tx(db, () => {
      const i = incident(db, id);
      if (!["draft", "live"].includes(i.state) || i.revision !== b.revision)
        fail("Draft changed or closed. Refresh before counting.", 409);
      const p = i.products.find((p) => p.sku === b.sku);
      if (!p) fail("Product not found.", 404);
      if (
        b.allocation > b.quantity ||
        available(db, id, p.sku, b.allocation) < 0
      )
        fail(
          "Reserve no more than the counted stock, and no less than units already reserved or sold.",
        );
      p.allocation = b.allocation;
      const counts = meta(db, `counts:${id}`);
      putMeta(db, `counts:${id}`, {
        ...counts,
        [p.sku]: {
          quantity: b.quantity,
          allocation: b.allocation,
          at: Date.now(),
        },
      });
      i.revision++;
      save(db, i);
    });
    res.json(viewIncident(db, id));
  });
  get("/incidents/:id/contact", (req: any, res: any) => {
    incident(db, String(req.params.id));
    res.json(
      meta(db, `contact:${req.params.id}`, {
        contact: "",
        hours: "",
        status:
          "Our original website is temporarily unavailable. You can still order here.",
      }),
    );
  });
  post("/incidents/:id/contact", (req: any, res: any) => {
    const i = incident(db, String(req.params.id));
    if (!["draft", "live"].includes(i.state))
      fail("Reopen a draft to edit shop information.", 409);
    const b = contactSchema.parse(req.body);
    putMeta(db, `contact:${i.id}`, b);
    res.json(b);
  });
  post("/incidents/:id/compare", (req: any, res: any) => {
    const storeId = req.body.original?.storeId;
    if (
      typeof storeId === "string" &&
      (meta(db, `destination:${storeId}`, null) ||
        db
          .prepare("SELECT id FROM rc_owners WHERE kind='destination' AND id=?")
          .get(storeId))
    )
      requireOwned(db, res.locals.user.id, "destination", storeId);
    const id = String(req.params.id),
      report = reconciliation(db, id, req.body.original),
      previewId = uid("compare");
    assignOwner(db, "destination", report.original.storeId, res.locals.user.id);
    putMeta(db, `preview:${previewId}`, report);
    const { next, original, ...publicReport } = report;
    res.json({ ...publicReport, previewId });
  });
  post("/incidents/:id/apply", (req: any, res: any) =>
    res.json(
      applyReconciliation(
        db,
        String(req.params.id),
        z.object({ previewId: z.string() }).parse(req.body).previewId,
      ),
    ),
  );
  get("/incidents/:id/return-state", (req: any, res: any) => {
    const id = String(req.params.id);
    incident(db, id);
    const saved = meta(db, `return:${id}`, null);
    res.json(
      saved
        ? {
            original: meta(db, `destination:${saved.storeId}`, null),
            storeId: saved.storeId,
          }
        : null,
    );
  });
  get("/incidents/:id/original-example", (req: any, res: any) =>
    res.json(originalExample(db, String(req.params.id))),
  );
  get("/destinations/:storeId", (req: any, res: any) => {
    const d = meta(db, `destination:${req.params.storeId}`, null);
    if (!d) fail("Local destination not found.", 404);
    res.attachment("original-store-updated.json").json(d);
  });
  get("/kits", (_req: any, res: any) =>
    res.json(
      (
        db
          .prepare("SELECT value FROM rc_meta WHERE key LIKE 'kit:%'")
          .all() as any[]
      )
        .map((r) => JSON.parse(r.value))
        .filter((k) => owns(db, res.locals.user.id, "kit", k.id))
        .map(
          ({
            sources,
            products,
            contact,
            pickup,
            originalUrl,
            ...summary
          }: any) => summary,
        ),
    ),
  );
  get("/incidents/:id/kits", (req: any, res: any) => {
    incident(db, String(req.params.id));
    res.json(
      (
        db
          .prepare("SELECT value FROM rc_meta WHERE key LIKE 'kit:%'")
          .all() as any[]
      )
        .map((r) => JSON.parse(r.value))
        .filter((k) => k.incidentId === req.params.id)
        .map(
          ({
            sources,
            products,
            contact,
            pickup,
            originalUrl,
            ...summary
          }: any) => summary,
        ),
    );
  });
  post("/incidents/:id/kits", (req: any, res: any) => {
    const id = String(req.params.id),
      i = incident(db, id);
    if (!i.products.length) fail("Add products before saving a rescue kit.");
    const sources = (
      db
        .prepare("SELECT * FROM rc_sources WHERE incident=? ORDER BY rowid")
        .all(id) as any[]
    ).map((s) => ({
      id: s.id,
      name: s.name,
      mime: s.mime,
      hash: s.hash,
      data: Buffer.from(s.bytes).toString("base64"),
      settings: meta(db, `source:${s.id}`),
    }));
    const data = {
      schema: "restorecart.rescue-kit.v1",
      incidentId: id,
      name: i.name,
      pickup: i.pickup,
      originalUrl: i.originalUrl,
      contact: meta(db, `contact:${id}`, {
        contact: "",
        hours: "",
        status: "",
      }),
      products: i.products,
      sources,
    };
    const digest = hash(JSON.stringify(data));
    const previous = (
      db
        .prepare("SELECT value FROM rc_meta WHERE key LIKE 'kit:%'")
        .all() as any[]
    )
      .map((r) => JSON.parse(r.value))
      .find((k) => k.incidentId === id && k.digest === digest);
    if (previous)
      return res.json({
        id: previous.id,
        version: previous.version,
        duplicate: true,
      });
    const kits = (
      db
        .prepare("SELECT value FROM rc_meta WHERE key LIKE 'kit:%'")
        .all() as any[]
    )
      .map((r) => JSON.parse(r.value))
      .filter((k) => k.incidentId === id);
    const kit = {
      ...data,
      id: uid("kit"),
      version: kits.length + 1,
      createdAt: new Date().toISOString(),
      digest,
    };
    putMeta(db, `kit:${kit.id}`, kit);
    assignOwner(db, "kit", kit.id, res.locals.user.id);
    res.json({ id: kit.id, version: kit.version, duplicate: false });
  });
  post("/kits/import", (req: any, res: any) => {
    const product = candidateSchema.extend({
      price: z.string().max(30),
      currency: z.string().max(10),
      allocation: z.number().int().min(0).max(10000),
      excluded: z.boolean(),
      resolved: z.boolean(),
      resolutionNote: z.string().max(1000),
    });
    const shape = z
      .object({
        schema: z.literal("restorecart.rescue-kit.v1"),
        incidentId: z.string(),
        name: z.string().min(1).max(80),
        pickup: z.string().max(1000),
        originalUrl: z.union([z.literal(""), z.url().startsWith("https://")]),
        contact: contactSchema,
        products: z.array(product).min(1).max(50),
        sources: z
          .array(
            z.object({
              id: z.string(),
              name: z.string().max(160),
              mime: z.string(),
              hash: z.string(),
              data: z.string().max(7000000),
              settings: z.record(z.string(), z.unknown()),
            }),
          )
          .max(10),
        id: z.string(),
        version: z.number().int().positive(),
        createdAt: z.iso.datetime(),
        digest: z.string(),
      })
      .strict();
    const kit = shape.parse(req.body.kit);
    // Compute against the exact downloaded content, not a reordered schema projection.
    const { id, version, createdAt, digest, ...data } = req.body.kit;
    if (hash(JSON.stringify(data)) !== digest)
      fail("Kit integrity check failed: its content was changed.");
    if (
      kit.sources.reduce(
        (n, s) => n + Buffer.from(s.data, "base64").length,
        0,
      ) >
      20 * 1024 * 1024
    )
      fail("Kit source limit is 20 MB.");
    if (
      new Set(kit.sources.map((s) => s.id)).size !== kit.sources.length ||
      new Set(kit.products.map((p) => p.sku)).size !== kit.products.length
    )
      fail("Kit contains duplicate source IDs or SKUs.");
    for (const source of kit.sources)
      if (hash(Buffer.from(source.data, "base64")) !== source.hash)
        fail("Kit source integrity check failed.");
    for (const p of kit.products)
      if (
        p.candidates.some(
          (e) => !kit.sources.some((s) => s.id === e.sourceId),
        ) ||
        (p.imageSourceId &&
          !kit.sources.some(
            (s) => s.id === p.imageSourceId && s.mime.startsWith("image/"),
          ))
      )
        fail("Kit contains unresolved source references.");
    const old = meta(db, `kit:${kit.id}`, null);
    if (old) requireOwned(db, res.locals.user.id, "kit", kit.id);
    if (old && old.digest !== kit.digest)
      fail("A different kit already uses this ID.", 409);
    putMeta(db, `kit:${kit.id}`, req.body.kit);
    assignOwner(db, "kit", kit.id, res.locals.user.id);
    res.json({ id: kit.id, version: kit.version, duplicate: !!old });
  });
  post("/incidents/:id/rehearse-return", (req: any, res: any) => {
    const id = String(req.params.id),
      i = incident(db, id);
    if (!meta(db, `rehearsal:${id}`, null))
      fail(
        "Run a return rehearsal only from an isolated rehearsal draft.",
        409,
      );
    const p = i.products.find(
      (p) => !p.excluded && /^\d+\.\d{2}$/.test(p.price) && Number(p.price) > 0,
    );
    if (!p)
      fail("Confirm one valid USD product price before the return rehearsal.");
    const shadow = openRC(":memory:");
    try {
      const temp = createIncident(shadow, "Isolated return simulation");
      temp.state = "closing";
      temp.products = [{ ...p, allocation: 1 }];
      save(shadow, temp);
      const oid = uid("simulated"),
        amount = Math.round(Number(p.price) * 100);
      shadow
        .prepare(
          "INSERT INTO rc_orders(id,incident,buyer,request_key,token,state,fulfillment,capture,amount,expires,body) VALUES(?,?,?,?,?,'paid','collected',?,?,?,?)",
        )
        .run(
          oid,
          temp.id,
          "simulation",
          "simulation",
          "simulation",
          `SIMULATED-${oid}`,
          amount,
          Date.now(),
          JSON.stringify({
            lines: [{ sku: p.sku, quantity: 1, unitCents: amount }],
          }),
        );
      shadow
        .prepare("INSERT INTO rc_moves VALUES(?,?,?,-1,'sale',?)")
        .run(`sale:${oid}:${p.sku}`, temp.id, p.sku, oid);
      const original = originalExample(shadow, temp.id);
      original.inventory = [{ sku: p.sku, quantity: 1 }];
      const first = reconciliation(shadow, temp.id, original),
        preview = uid("simulation");
      putMeta(shadow, `preview:${preview}`, first);
      const applied = applyReconciliation(shadow, temp.id, preview),
        repeat = reconciliation(shadow, temp.id, applied.output),
        retry = applyReconciliation(shadow, temp.id, preview);
      res.json({
        simulation: true,
        noPayPalCalls: true,
        firstChanges: first.changes.length,
        repeatChanges: repeat.changes.length,
        retryRepeated: retry.repeated,
        remaining: applied.output.inventory[0].quantity,
        passed:
          first.changes.length === 2 &&
          repeat.changes.length === 0 &&
          retry.repeated &&
          applied.output.inventory[0].quantity === 0,
        message:
          "A simulated paid order was returned through the same local adapter; a second comparison made zero changes. No payment, order or stock record in your shop was changed.",
      });
    } finally {
      shadow.close();
    }
  });
  get("/kits/:kitId", (req: any, res: any) => {
    const kit = meta(db, `kit:${req.params.kitId}`, null);
    if (!kit) fail("Rescue kit not found.", 404);
    res.attachment(`rescue-kit-v${kit.version}.json`).json(kit);
  });
  post("/kits/:kitId/restore", async (req: any, res: any) => {
    const kit = meta(db, `kit:${req.params.kitId}`, null);
    if (!kit) fail("Rescue kit not found.", 404);
    const mode = z
      .object({
        mode: z.enum(["rehearsal", "operational"]).default("rehearsal"),
      })
      .parse(req.body || {}).mode;
    const i = createIncident(
        db,
        `${kit.name.slice(0, 60)} · ${mode === "rehearsal" ? "rehearsal" : "restored"}`,
      ),
      map: Record<string, string> = {};
    assignOwner(db, "incident", i.id, res.locals.user.id);
    try {
      for (const s of kit.sources) {
        if (hash(Buffer.from(s.data, "base64")) !== s.hash)
          fail("Kit source integrity check failed.");
        const added = await addSource(db, i.id, { name: s.name, data: s.data });
        map[s.id] = String(added.id);
        putMeta(db, `source:${added.id}`, s.settings);
      }
      const restored = incident(db, i.id);
      restored.pickup = kit.pickup;
      restored.originalUrl = kit.originalUrl;
      restored.products = kit.products.map((p: any) => ({
        ...p,
        allocation: 0,
        resolved: false,
        candidates: p.candidates.map((e: any) => ({
          ...e,
          sourceId: map[e.sourceId] || e.sourceId,
        })),
        imageSourceId: p.imageSourceId ? map[p.imageSourceId] : undefined,
      }));
      restored.revision++;
      save(db, restored);
      putMeta(db, `contact:${i.id}`, kit.contact);
      if (mode === "rehearsal")
        putMeta(db, `rehearsal:${i.id}`, {
          kitId: kit.id,
          version: kit.version,
          createdAt: new Date().toISOString(),
          paymentsDisabled: true,
        });
      res.json({
        incident: viewIncident(db, i.id),
        report: {
          products: restored.products.length,
          images: kit.sources.filter((s: any) => s.mime.startsWith("image/"))
            .length,
          sourceHashesVerified: true,
          stockReset: true,
          unpublished: true,
          paymentsDisabled: mode === "rehearsal",
          message:
            mode === "rehearsal"
              ? "Rehearsal is isolated: recount stock and answer questions. It cannot publish or take payments. No source-shop orders were copied."
              : "Operational draft restored. Recount physical stock, confirm details and publish when ready. Orders and allocations were not copied.",
        },
      });
    } catch (e) {
      db.prepare("DELETE FROM rc_sources WHERE incident=?").run(i.id);
      db.prepare("DELETE FROM rc_incidents WHERE id=?").run(i.id);
      throw e;
    }
  });
}
