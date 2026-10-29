import { groundedHelp } from "./help";
import type { Express, Response } from "express";
import { z } from "zod";
import type { Store } from "../../store";
import { transaction } from "../../store";
import { accountId } from "../../market/store";
import { inventory, fail, quoteSnapshot } from "../store";
import {
  jobSchema,
  planJob,
  manufacturingKit,
  validateSchedule,
  type Slot,
} from "../../../src/scrapdrop/manufacturing/engine";
import {
  initManufacturing,
  saveJob,
  getJob,
  jobDTO,
  saveProgress,
  finishJob,
  analytics,
  checkedManufacturing,
} from "./store";
import { planWithAgent } from "./agent";
const workshopDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const intervalSchema = z
  .object({
    id: z.string(),
    start: z.number().min(0).max(100000),
    end: z.number().min(0).max(100000),
  })
  .strict();
export function registerManufacturing(
  app: Express,
  db: Store,
  limit: (key: string, n: number, ms: number) => void,
) {
  initManufacturing(db);
  const owner = (res: Response) =>
    accountId(db, res.locals.learner) ||
    fail("Sign in to save production jobs.", 401);
  const operator = (res: Response) => {
    const aid = owner(res);
    if (
      !process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID ||
      aid !== process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID
    )
      fail("Only the shop operator can schedule shared equipment.", 403);
    return aid;
  };
  app.post("/api/scrapdrop/manufacturing/plan", (req, res) => {
    limit(`mfg-plan:${res.locals.learner}`, 80, 3600000);
    res.json(planJob(req.body, inventory(db)));
  });
  app.post("/api/scrapdrop/manufacturing/agent", async (req, res) => {
    const aid = owner(res);
    limit(`mfg-agent:${aid}`, 10, 3600000);
    const { job, text } = z
      .object({ job: jobSchema, text: z.string().trim().min(5).max(1500) })
      .strict()
      .parse(req.body);
    res.json(await planWithAgent(db, aid, job, text));
  });
  app.get("/api/scrapdrop/manufacturing/jobs", (_req, res) =>
    res.json(
      (
        db
          .prepare(
            "SELECT * FROM sd_mfg_jobs WHERE owner=? ORDER BY created DESC LIMIT 40",
          )
          .all(owner(res)) as any[]
      ).map(jobDTO),
    ),
  );
  app.get("/api/scrapdrop/manufacturing/jobs/:id", (req, res) =>
    res.json(jobDTO(getJob(db, owner(res), String(req.params.id)))),
  );
  app.post("/api/scrapdrop/manufacturing/jobs", (req, res) => {
    limit(`mfg-save:${owner(res)}`, 40, 3600000);
    res.json(saveJob(db, owner(res), req.body));
  });
  app.put("/api/scrapdrop/manufacturing/jobs/:id/progress", (req, res) =>
    res.json(saveProgress(db, owner(res), String(req.params.id), req.body)),
  );
  app.post("/api/scrapdrop/manufacturing/jobs/:id/results", (req, res) =>
    res.json(finishJob(db, owner(res), String(req.params.id), req.body)),
  );
  app.post("/api/scrapdrop/manufacturing/jobs/:id/quote", (req, res) => {
    const aid = owner(res),
      j = getJob(db, aid, String(req.params.id));
    if (j.order_id)
      fail("This job already has a checkout. Open its existing order.", 409);
    const { pickupSlotId } = z
      .object({ pickupSlotId: z.string().max(100) })
      .strict()
      .parse(req.body);
    const plan = checkedManufacturing(db, aid, JSON.parse(j.body).input);
    if (!plan.total) fail("No purchase is needed for this plan.");
    if (JSON.stringify(plan) !== j.body)
      fail("Stock changed. Recalculate and save a new job.", 409);
    const kit = manufacturingKit(plan, inventory(db));
    kit.manufacturingJobId = j.id;
    res.json(quoteSnapshot(db, aid, kit, pickupSlotId));
  });
  app.post(
    "/api/scrapdrop/manufacturing/analytics/explain",
    async (req, res) => {
      const aid = owner(res);
      limit(`mfg-insights:${aid}`, 10, 3600000);
      const { question } = z
        .object({ question: z.string().trim().min(5).max(600) })
        .strict()
        .parse(req.body);
      const records = analytics(
        db,
        aid,
        aid === process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID,
      );
      const actual = records.filter((r) => r.status === "Actual recorded");
      const context = {
        sampleCount: actual.length,
        records,
        overruns: actual
          .filter((r) => r.actualMinutes! > r.estimatedMinutes)
          .map((r) => ({
            job: r.job,
            estimatedMinutes: r.estimatedMinutes,
            actualMinutes: r.actualMinutes,
            extraMinutes: r.actualMinutes! - r.estimatedMinutes,
          })),
        scope: "Authorized production records only; estimates are not actuals.",
      };
      res.json({
        ...(await groundedHelp(db, aid, question, context)),
        evidence: context,
      });
    },
  );
  app.post(
    "/api/scrapdrop/manufacturing/jobs/:id/explain",
    async (req, res) => {
      const aid = owner(res);
      limit(`mfg-step:${aid}`, 10, 3600000);
      const { question, product, step } = z
        .object({
          question: z.string().trim().min(5).max(600),
          product: z.number().int().min(0),
          step: z.number().int().min(0),
        })
        .strict()
        .parse(req.body);
      const j = jobDTO(getJob(db, aid, String(req.params.id))),
        recipe = j.plan.recipes[product];
      if (!recipe || !recipe.steps[step]) fail("Unknown tutorial step.");
      res.json(
        await groundedHelp(db, aid, question, {
          recipe,
          step: recipe.steps[step],
          tools: j.plan.input.tools,
          thickness: j.plan.input.thickness,
          sheets: j.plan.sheets.filter((s) =>
            s.placements.some((p) => p.productId === recipe.product.id),
          ),
        }),
      );
    },
  );
  app.get("/api/scrapdrop/manufacturing/analytics", (_req, res) => {
    const aid = owner(res);
    res.json(
      analytics(db, aid, aid === process.env.SCRAPDROP_OPERATOR_ACCOUNT_ID),
    );
  });
  app.get("/api/scrapdrop/manufacturing/schedule", (_req, res) => {
    operator(res);
    const row = db
      .prepare("SELECT * FROM sd_mfg_schedule WHERE id='shop'")
      .get() as any;
    res.json(
      row
        ? {
            revision: row.revision,
            ...(Array.isArray(JSON.parse(row.body))
              ? { date: workshopDate(), slots: JSON.parse(row.body) }
              : JSON.parse(row.body)),
          }
        : { revision: 0, date: workshopDate(), slots: [] },
    );
  });
  app.put("/api/scrapdrop/manufacturing/schedule", (req, res) => {
    operator(res);
    const body = z
      .object({
        revision: z.number().int().min(0),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        jobs: z
          .array(
            z
              .object({
                id: z.string().max(100),
                intervals: z.array(intervalSchema).max(30),
              })
              .strict(),
          )
          .max(30),
      })
      .strict()
      .parse(req.body);
    res.json(
      transaction(db, () => {
        const row = db
          .prepare("SELECT * FROM sd_mfg_schedule WHERE id='shop'")
          .get() as any;
        if ((row?.revision || 0) !== body.revision)
          fail("Schedule changed in another window. Reload.", 409);
        const date = body.date || workshopDate();
        const parsedDate = new Date(date + "T00:00:00Z");
        if (
          !Number.isFinite(parsedDate.getTime()) ||
          parsedDate.toISOString().slice(0, 10) !== date
        )
          fail("Choose a real workshop calendar date.");
        const slots: Slot[] = [];
        if (new Set(body.jobs.map((j) => j.id)).size !== body.jobs.length)
          fail("Duplicate scheduled job.");
        for (const j of body.jobs) {
          const r = db
            .prepare("SELECT * FROM sd_mfg_jobs WHERE id=?")
            .get(j.id) as any;
          if (!r) fail("Unknown scheduled job.");
          const plan = JSON.parse(r.body);
          if (
            j.intervals.length !== plan.operations.length ||
            new Set(j.intervals.map((i) => i.id)).size !==
              plan.operations.length
          )
            fail("Schedule must include every operation once.");
          for (const o of plan.operations) {
            const x = j.intervals.find((i) => i.id === o.id);
            if (!x) fail("Missing operation.");
            slots.push({
              ...o,
              id: j.id + ":" + o.id,
              predecessors: o.predecessors.map((p: string) => j.id + ":" + p),
              start: x!.start,
              end: x!.end,
            });
          }
        }
        const violations = validateSchedule(slots);
        if (violations.length) fail(violations.join(" "), 409);
        db.prepare(
          "INSERT INTO sd_mfg_schedule VALUES('shop',?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body",
        ).run(body.revision + 1, JSON.stringify({ date, slots }));
        return { revision: body.revision + 1, date, slots };
      }),
    );
  });
  app.get("/api/scrapdrop/manufacturing/operator-jobs", (_req, res) => {
    operator(res);
    res.json(
      (
        db
          .prepare("SELECT * FROM sd_mfg_jobs ORDER BY created DESC LIMIT 40")
          .all() as any[]
      ).map(jobDTO),
    );
  });
}
