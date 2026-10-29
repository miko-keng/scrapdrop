import { z } from "zod";
import { id, transaction, type Store } from "../../store";
import { fail, inventory, ownedMaterials } from "../store";
import {
  jobSchema,
  planJob,
  type Plan,
  type Job,
} from "../../../src/scrapdrop/manufacturing/engine";
export function initManufacturing(db: Store) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS sd_mfg_jobs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,body TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,progress TEXT NOT NULL,results TEXT,order_id TEXT UNIQUE,created INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS sd_mfg_schedule(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,body TEXT NOT NULL);`,
  );
}
export function checkedManufacturing(db: Store, owner: string, raw: unknown) {
  const input = jobSchema.parse(raw),
    saved = ownedMaterials(db, owner);
  if (
    input.ownedRevision !== saved.revision ||
    JSON.stringify(input.owned) !== JSON.stringify(saved.materials)
  )
    fail("Your saved materials changed. Save and recalculate this job.", 409);
  const plan = planJob(input, inventory(db));
  if (!plan.ready) fail(plan.violations.join(" "), 409);
  return plan;
}
export function getJob(db: Store, owner: string, jid: string) {
  const row = db
    .prepare("SELECT * FROM sd_mfg_jobs WHERE id=? AND owner=?")
    .get(jid, owner) as any;
  if (!row) fail("Manufacturing job not found.", 404);
  return row;
}
export function jobDTO(row: any) {
  return {
    id: row.id,
    plan: JSON.parse(row.body) as Plan,
    revision: row.revision,
    progress: JSON.parse(row.progress),
    results: row.results ? JSON.parse(row.results) : null,
    orderId: row.order_id,
    created: row.created,
  };
}
export function saveJob(db: Store, owner: string, raw: unknown) {
  const plan = checkedManufacturing(db, owner, raw),
    jid = id("production");
  db.prepare(
    "INSERT INTO sd_mfg_jobs(id,owner,body,progress,created) VALUES(?,?,?,?,?)",
  ).run(
    jid,
    owner,
    JSON.stringify(plan),
    JSON.stringify({ product: 0, step: 0 }),
    Date.now(),
  );
  return jobDTO(getJob(db, owner, jid));
}
export function saveProgress(
  db: Store,
  owner: string,
  jid: string,
  raw: unknown,
) {
  const body = z
    .object({
      revision: z.number().int().min(0),
      product: z.number().int().min(0),
      step: z.number().int().min(0),
    })
    .strict()
    .parse(raw);
  return transaction(db, () => {
    const row = getJob(db, owner, jid),
      plan: Plan = JSON.parse(row.body);
    if (row.revision !== body.revision)
      fail("Progress changed in another window. Reload this saved job.", 409);
    if (
      body.product >= plan.recipes.length ||
      body.step >= plan.recipes[body.product].steps.length
    )
      fail("Unknown making step.");
    db.prepare(
      "UPDATE sd_mfg_jobs SET revision=revision+1,progress=? WHERE id=?",
    ).run(JSON.stringify({ product: body.product, step: body.step }), jid);
    return jobDTO(getJob(db, owner, jid));
  });
}
export const resultSchema = z
  .object({
    revision: z.number().int().min(0),
    products: z
      .array(
        z
          .object({
            id: z.string(),
            good: z.number().int().min(0).max(300),
            spoiled: z.number().int().min(0).max(300),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    minutes: z.number().min(0).max(100000),
    sellingPrice: z.number().int().min(0).max(10000000),
    laborRate: z.number().int().min(0).max(100000),
    ownedCost: z.number().int().min(0).max(10000000),
    consumables: z.number().int().min(0).max(10000000),
    fees: z.number().int().min(0).max(10000000),
    offcuts: z
      .array(
        z
          .object({
            sheetId: z.string(),
            width: z.number().int().min(10).max(3000),
            length: z.number().int().min(10).max(3000),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export function finishJob(db: Store, owner: string, jid: string, raw: unknown) {
  const body = resultSchema.parse(raw);
  return transaction(db, () => {
    const row = getJob(db, owner, jid),
      plan: Plan = JSON.parse(row.body);
    if (row.results) {
      const old = JSON.parse(row.results);
      if (JSON.stringify(old.input) !== JSON.stringify(body))
        fail("Results are already finalized.", 409);
      return jobDTO(row);
    }
    if (row.revision !== body.revision)
      fail("This job changed. Reload before recording results.", 409);
    if (plan.total > 0) {
      const o = db
        .prepare(
          "SELECT payment,fulfillment FROM sd_orders WHERE id=? AND owner=?",
        )
        .get(row.order_id || "", owner) as any;
      if (o?.payment !== "paid" || o.fulfillment !== "collected")
        fail("Collect the paid materials before recording production.", 409);
    }
    if (
      new Set(body.products.map((p) => p.id)).size !== plan.recipes.length ||
      body.products.length !== plan.recipes.length
    )
      fail("Record each product exactly once.");
    for (const r of plan.recipes) {
      const p = body.products.find((p) => p.id === r.product.id);
      if (!p || p.good + p.spoiled !== r.product.quantity)
        fail(
          "Good plus spoiled units must match each planned product quantity.",
        );
    }
    const saved = ownedMaterials(db, owner),
      used = new Map<string, number>();
    for (const s of plan.sheets.filter((s) => s.source === "owned"))
      used.set(s.lotId, (used.get(s.lotId) || 0) + 1);
    const next = structuredClone(saved.materials);
    for (const [lotId, n] of used) {
      const m = next.find((m) => m.id === lotId),
        original = plan.input.owned.find((m) => m.id === lotId);
      if (
        !m ||
        !original ||
        m.quantity < n ||
        ["width", "length", "thickness", "color", "type"].some(
          (k) => (m as any)[k] !== (original as any)[k],
        )
      )
        fail(
          "Owned material has changed or was already used. Reconcile your stock before finalizing.",
          409,
        );
      m!.quantity -= n;
    }
    const regions = new Map(plan.sheets.map((s) => [s.id, [...s.remaining]]));
    for (const [i, o] of body.offcuts.entries()) {
      const s = plan.sheets.find((s) => s.id === o.sheetId);
      if (!s) fail("Unknown source sheet for offcut.");
      const free = regions.get(o.sheetId)!;
      const idx = free.findIndex(
        (f) => o.width <= f.width && o.length <= f.length,
      );
      if (idx < 0)
        fail(
          "Measured offcut does not fit an unused rectangle in the cutting plan.",
        );
      free.splice(idx, 1);
      next.push({
        id: `${jid}-offcut-${i}`,
        name: `Measured offcut · ${s!.name}`,
        type: "card",
        width: o.width,
        length: o.length,
        thickness: s!.thickness,
        quantity: 1,
        color: s!.color,
      });
    }
    if (next.length > 20)
      fail(
        "Your material shelf would exceed 20 lots. Consolidate it before finalizing.",
      );
    const good = body.products.reduce((n, p) => n + p.good, 0),
      revenue = good * body.sellingPrice,
      labor = Math.round((body.minutes * body.laborRate) / 60),
      cost = plan.total + body.ownedCost + body.consumables + body.fees + labor,
      result = {
        input: body,
        good,
        revenue,
        labor,
        cost,
        contribution: revenue - cost,
        cashAvoided: plan.cashAvoided,
        created: Date.now(),
        demonstration: process.env.APP_MODE === "demo",
      };
    db.prepare(
      "UPDATE sd_mfg_jobs SET results=?,revision=revision+1 WHERE id=?",
    ).run(JSON.stringify(result), jid);
    db.prepare(
      "INSERT INTO sd_owned VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision,body=excluded.body",
    ).run(owner, saved.revision + 1, JSON.stringify(next));
    return jobDTO(getJob(db, owner, jid));
  });
}
export function analytics(db: Store, owner: string, operator: boolean) {
  const rows = operator
    ? db
        .prepare("SELECT * FROM sd_mfg_jobs ORDER BY created DESC LIMIT 100")
        .all()
    : db
        .prepare(
          "SELECT * FROM sd_mfg_jobs WHERE owner=? ORDER BY created DESC LIMIT 100",
        )
        .all(owner);
  return (rows as any[]).map((row) => {
    const p: Plan = JSON.parse(row.body),
      r = row.results ? JSON.parse(row.results) : null;
    return {
      job: row.id,
      title: p.input.title,
      status: r
        ? r.demonstration
          ? "Demo result"
          : "Actual recorded"
        : "Estimate only",
      products: p.recipes.reduce((n, r) => n + r.product.quantity, 0),
      ownedSheets: p.usedOwned,
      purchasedSheets: p.usedShop,
      purchaseUSD: p.total / 100,
      cashAvoidedUSD: p.cashAvoided === null ? null : p.cashAvoided / 100,
      utilizationPct: Math.round(p.utilization * 100),
      estimatedMinutes: p.minutes,
      actualMinutes: r?.input.minutes ?? null,
      good: r?.good ?? null,
      spoiled: r
        ? r.input.products.reduce((n: number, p: any) => n + p.spoiled, 0)
        : null,
      contributionUSD: r ? r.contribution / 100 : null,
    };
  });
}
