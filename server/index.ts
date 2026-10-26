import { registerScrap } from "./scrapdrop/routes";
import { registerMarket } from "./market/routes";
import { registerProviderProtocol } from "./market/protocol";
import { accountId } from "./market/store";
import { isLiveAI } from "./ai-mode";
import { registerExpert } from "./expert";
import express from "express";
import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { openStore, id, hasAccess, grantCapture, transaction } from "./store";
import { catalog, getLesson, emptySettings } from "../src/shared/catalog";
import { parseCSV, sampleDatasets } from "../src/shared/data";
import { compute, settingsMatch, exportCSV } from "../src/shared/engine";
import { analyse, contextualHint } from "./ai";
import {
  paypal,
  paypalReady,
  captureObservation,
  verifyWebhook,
} from "./paypal";
import type {
  Task,
  Exercise,
  Dataset,
  LessonKey,
  Settings,
} from "../src/shared/types";
if (process.env.PAYPAL_ENV && process.env.PAYPAL_ENV !== "sandbox")
  throw new Error("This release supports PayPal sandbox only.");
const db = openStore();
const app = express();
let scrapRuntime: ReturnType<typeof registerScrap>;
const port = Number(process.env.PORT || 4317);
const origin = process.env.APP_BASE_URL || `http://127.0.0.1:${port}`;
const production = process.env.NODE_ENV === "production";
const demo =
  process.env.APP_MODE === "demo" || (!production && !process.env.APP_MODE);
if (production && demo && !process.env.ALLOW_HOSTED_DEMO)
  throw new Error("Hosted demo requires explicit ALLOW_HOSTED_DEMO=true.");
app.disable("x-powered-by");
app.use(express.json({ limit: "18mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});
app.get("/api/health", (_req, res) => res.json({ ok: true }));
function merchantFor(order: any) {
  return (
    JSON.parse(order.body).merchantId || process.env.PAYPAL_MERCHANT_ID || ""
  );
}
async function ensureProviderOrder(order: any) {
  const snapshot = JSON.parse(order.body);
  const expectedMerchant = merchantFor(order);
  if (order.provider_id && expectedMerchant) return order.provider_id;
  const provider = order.provider_id
    ? await paypal(`/v2/checkout/orders/${order.provider_id}`)
    : await paypal(
        "/v2/checkout/orders",
        "POST",
        {
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: order.id,
              custom_id: order.id,
              description: `TaskSlice: ${snapshot.title}`,
              ...(expectedMerchant
                ? { payee: { merchant_id: expectedMerchant } }
                : {}),
              amount: {
                currency_code: "USD",
                value: (order.amount / 100).toFixed(2),
              },
            },
          ],
        },
        `create-${order.id}`,
      );
  // Persist the ID before further requests so a timeout cannot orphan the order.
  db.prepare(
    "UPDATE orders SET provider_id=?,status='needs_reconciliation' WHERE id=?",
  ).run(provider.id, order.id);
  let merchant = provider.purchase_units?.[0]?.payee?.merchant_id;
  if (!merchant) {
    const details = await paypal(`/v2/checkout/orders/${provider.id}`);
    merchant = details.purchase_units?.[0]?.payee?.merchant_id;
  }
  if (
    typeof merchant !== "string" ||
    !merchant ||
    (expectedMerchant && merchant !== expectedMerchant)
  ) {
    throw new Error(
      "The sandbox seller could not be verified. Please check your app’s seller association.",
    );
  }
  snapshot.merchantId = merchant;
  order.body = JSON.stringify(snapshot);
  order.provider_id = provider.id;
  db.prepare("UPDATE orders SET body=?,status='awaiting_buyer' WHERE id=?").run(
    JSON.stringify(snapshot),
    order.id,
  );
  return provider.id;
}
async function reconcile(order: any) {
  if (!order.provider_id) {
    if (order.status === "creating" || order.status === "needs_reconciliation")
      await ensureProviderOrder(order);
    return;
  }
  if (!merchantFor(order)) await ensureProviderOrder(order);
  let body = await paypal(`/v2/checkout/orders/${order.provider_id}`);
  if (
    body.status === "APPROVED" &&
    ["capture_requested", "needs_reconciliation"].includes(order.status)
  ) {
    await paypal(
      `/v2/checkout/orders/${order.provider_id}/capture`,
      "POST",
      {},
      `capture-${order.id}`,
    );
    body = await paypal(`/v2/checkout/orders/${order.provider_id}`);
  }
  if (body.status === "COMPLETED") {
    const observation = captureObservation(body);
    if (["REFUNDED", "REVERSED", "DECLINED"].includes(observation.status)) {
      transaction(db, () => {
        db.prepare("UPDATE orders SET status=? WHERE id=?").run(
          observation.status === "REFUNDED" ? "refunded" : "reversed",
          order.id,
        );
        db.prepare("UPDATE grants SET active=0 WHERE order_id=?").run(order.id);
      });
      return;
    }
    grantCapture(db, order, observation, merchantFor(order));
  }
}
async function processEvent(event: any) {
  if (scrapRuntime && (await scrapRuntime.event(event))) {
    db.prepare("UPDATE events SET status='processed' WHERE id=?").run(event.id);
    return;
  }
  const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
  let order = orderId
    ? (db
        .prepare("SELECT * FROM orders WHERE provider_id=?")
        .get(orderId) as any)
    : null;
  if (!order && event.resource?.id) {
    const c = db
      .prepare("SELECT order_id FROM captures WHERE id=?")
      .get(event.resource.id) as any;
    if (c)
      order = db.prepare("SELECT * FROM orders WHERE id=?").get(c.order_id);
  }
  if (order && event.event_type === "PAYMENT.CAPTURE.COMPLETED")
    await reconcile(order);
  if (
    event.event_type === "PAYMENT.CAPTURE.REFUNDED" ||
    event.event_type === "PAYMENT.CAPTURE.REVERSED"
  ) {
    // Only a verified event may enter this function. Resolve a refund's capture using canonical API details when necessary.
    let captureId = event.resource?.supplementary_data?.related_ids?.capture_id;
    if (event.event_type === "PAYMENT.CAPTURE.REVERSED")
      captureId = event.resource?.id;
    if (
      !captureId &&
      event.event_type === "PAYMENT.CAPTURE.REFUNDED" &&
      event.resource?.id
    ) {
      const refund = await paypal(`/v2/payments/refunds/${event.resource.id}`);
      const up = refund.links?.find((x: any) => x.rel === "up")?.href;
      if (up) {
        const match = /\/v2\/payments\/captures\/([A-Z0-9]+)$/.exec(up);
        if (match) captureId = match[1];
      }
    }
    if (captureId) {
      const cap = await paypal(`/v2/payments/captures/${captureId}`);
      const local = db
        .prepare("SELECT order_id FROM captures WHERE id=?")
        .get(captureId) as any;
      if (local && ["REFUNDED", "REVERSED", "DECLINED"].includes(cap.status)) {
        transaction(db, () => {
          db.prepare("UPDATE orders SET status=? WHERE id=?").run(
            cap.status === "REFUNDED" ? "refunded" : "reversed",
            local.order_id,
          );
          db.prepare("UPDATE grants SET active=0 WHERE order_id=?").run(
            local.order_id,
          );
        });
      }
    }
  }
  db.prepare("UPDATE events SET status='processed' WHERE id=?").run(event.id);
}
app.post("/api/paypal/webhook", async (req, res) => {
  try {
    if (!paypalReady() || !(await verifyWebhook(req.headers, req.body)))
      return res
        .status(400)
        .json({ error: { message: "Unverified payment notification." } });
    const event = req.body;
    if (typeof event.id !== "string" || typeof event.event_type !== "string")
      return res.sendStatus(400);
    db.prepare("INSERT OR IGNORE INTO events VALUES(?,?,'received',?)").run(
      event.id,
      JSON.stringify(event),
      new Date().toISOString(),
    );
    res.sendStatus(200);
    void processEvent(event).catch(() => {});
  } catch {
    res.sendStatus(503);
  }
});
registerProviderProtocol(app, db, limit);
app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const incoming = req.headers.origin;
    if (incoming && incoming !== origin)
      return res
        .status(403)
        .json({ error: { message: "This request came from another site." } });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return res
        .status(403)
        .json({ error: { message: "Cross-site requests are not accepted." } });
  }
  const raw = req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("ts_session="))
    ?.slice(11);
  let session = raw
    ? (db
        .prepare("SELECT * FROM sessions WHERE token=? AND expires>?")
        .get(createHash("sha256").update(raw).digest("hex"), Date.now()) as any)
    : null;
  if (!session) {
    const tok = randomBytes(32).toString("hex");
    session = { learner: id("learner"), csrf: randomBytes(24).toString("hex") };
    db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
      createHash("sha256").update(tok).digest("hex"),
      session.learner,
      session.csrf,
      Date.now() + 30 * 86400000,
    );
    res.setHeader(
      "Set-Cookie",
      `ts_session=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${production ? "; Secure" : ""}`,
    );
  }
  res.locals.learner = session.learner;
  res.locals.csrf = session.csrf;
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
    req.headers["x-csrf-token"] !== session.csrf
  )
    return res
      .status(403)
      .json({ error: { message: "Refresh the page and try again." } });
  next();
});
function limit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  let row = db.prepare("SELECT * FROM rate_limits WHERE key=?").get(key) as any;
  if (!row || row.reset < now) {
    db.prepare("INSERT OR REPLACE INTO rate_limits VALUES(?,1,?)").run(
      key,
      now + windowMs,
    );
    return;
  }
  if (row.count >= max)
    throw Object.assign(
      new Error("A little breather. Please wait a moment before trying again."),
      { status: 429 },
    );
  db.prepare("UPDATE rate_limits SET count=count+1 WHERE key=?").run(key);
}
const settingsSchema = z.object({
  group: z.string(),
  measure: z.string(),
  month: z.boolean(),
  leftKey: z.string(),
  rightKey: z.string(),
  returnColumn: z.string(),
  column: z.string(),
  comparator: z.enum(["lt", "lte", "eq", "gte", "gt"]),
  threshold: z.string().max(30),
});
const keySchema = z.enum([
  "summarise-sales",
  "match-records",
  "flag-exceptions",
]);
function ownTask(learner: string, taskId: string): Task {
  const row = db
    .prepare("SELECT body FROM tasks WHERE id=? AND learner=?")
    .get(taskId, learner) as any;
  if (!row)
    throw Object.assign(new Error("This task was not found."), { status: 404 });
  return JSON.parse(row.body);
}
function ownExercise(learner: string, exerciseId: string): Exercise {
  const row = db
    .prepare("SELECT body FROM exercises WHERE id=? AND learner=?")
    .get(exerciseId, learner) as any;
  if (!row)
    throw Object.assign(new Error("This lesson was not found."), {
      status: 404,
    });
  const ex = JSON.parse(row.body) as Exercise;
  if (!hasAccess(db, learner, ex.lessonKey))
    throw Object.assign(new Error("This lesson needs an active purchase."), {
      status: 403,
    });
  return ex;
}
function saveExercise(learner: string, ex: Exercise) {
  ex.updatedAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO exercises VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated=excluded.updated",
  ).run(ex.id, learner, ex.lessonKey, JSON.stringify(ex), ex.updatedAt);
}
app.get("/api/config", (_req, res) =>
  res.json({
    mode: demo ? "demo" : "sandbox",
    paypalReady: paypalReady(),
    paypalClientId: paypalReady() ? process.env.PAYPAL_CLIENT_ID : null,
    aiReady: isLiveAI(),
    csrf: res.locals.csrf,
  }),
);
registerMarket(app, db, {
  origin,
  production,
  demo,
  limit,
  async createOrder(account, tool, requestKey) {
    if (!paypalReady())
      throw Object.assign(
        new Error("Configure PayPal sandbox app credentials before checkout."),
        { status: 503 },
      );
    const product = `market:${tool.id}`;
    let order = db
      .prepare("SELECT * FROM orders WHERE learner=? AND request_key=?")
      .get(account, requestKey) as any;
    if (order && order.lesson !== product)
      throw Object.assign(
        new Error("That checkout belongs to another product."),
        { status: 409 },
      );
    if (!order)
      order = db
        .prepare(
          "SELECT * FROM orders WHERE learner=? AND lesson=? AND status IN ('creating','awaiting_buyer','pending','capture_requested','needs_reconciliation') ORDER BY created DESC LIMIT 1",
        )
        .get(account, product);
    if (!order) {
      const orderId = id("order");
      db.prepare(
        "INSERT INTO orders VALUES(?,?,?,?,'creating',NULL,?,?,?,?)",
      ).run(
        orderId,
        account,
        product,
        tool.id,
        requestKey,
        tool.price,
        JSON.stringify({
          title: tool.title,
          provider: tool.provider,
          productId: tool.id,
          operatorOwned: !!tool.operatorOwned,
          currency: "USD",
          version: tool.version,
          days: tool.days,
          package: "30 days from first activation",
          merchantId: process.env.PAYPAL_MERCHANT_ID,
        }),
        new Date().toISOString(),
      );
      order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
    }
    try {
      return {
        id: order.id,
        providerId: await ensureProviderOrder(order),
        amount: order.amount,
        status: order.status,
      };
    } catch (error) {
      db.prepare(
        "UPDATE orders SET status='needs_reconciliation' WHERE id=? AND status!='paid'",
      ).run(order.id);
      throw error;
    }
  },
});
scrapRuntime = registerScrap(app, db, { demo, limit });
registerExpert(app, db, {
  demo,
  limit,
  async createOrder(learner, tool, requestKey) {
    if (!paypalReady())
      throw Object.assign(
        new Error(
          "Configure your PayPal sandbox app credentials before checkout.",
        ),
        { status: 503 },
      );
    const product = `tool:${tool.id}`;
    let order = db
      .prepare("SELECT * FROM orders WHERE learner=? AND request_key=?")
      .get(learner, requestKey) as any;
    if (order && order.lesson !== product)
      throw Object.assign(new Error("That checkout belongs to another tool."), {
        status: 409,
      });
    if (!order)
      order = db
        .prepare(
          "SELECT * FROM orders WHERE learner=? AND lesson=? AND status IN ('creating','awaiting_buyer','capture_requested','pending','needs_reconciliation') ORDER BY created DESC LIMIT 1",
        )
        .get(learner, product) as any;
    if (!order) {
      const orderId = id("order");
      db.prepare(
        "INSERT INTO orders VALUES(?,?,?,?,'creating',NULL,?,?,?,?)",
      ).run(
        orderId,
        learner,
        product,
        tool.id,
        requestKey,
        tool.price,
        JSON.stringify({
          title: tool.definition.title,
          version: tool.version,
          merchantId: process.env.PAYPAL_MERCHANT_ID,
        }),
        new Date().toISOString(),
      );
      order = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
    }
    try {
      const providerId = await ensureProviderOrder(order);
      return {
        id: order.id,
        providerId,
        amount: order.amount,
        status: order.status,
      };
    } catch (error) {
      db.prepare(
        "UPDATE orders SET status='needs_reconciliation' WHERE id=? AND status!='paid'",
      ).run(order.id);
      throw error;
    }
  },
});
app.get("/api/catalog", (_req, res) =>
  res.json(catalog.map(({ steps, hints, ...l }) => l)),
);
app.get("/api/library", (_req, res) => {
  const learner = res.locals.learner;
  res.json({
    exercises: db
      .prepare(
        "SELECT body FROM exercises WHERE learner=? ORDER BY updated DESC",
      )
      .all(learner)
      .map((x: any) => JSON.parse(x.body)),
    owned: db
      .prepare(
        "SELECT DISTINCT lesson,source FROM grants WHERE learner=? AND active=1",
      )
      .all(learner),
    orders: db
      .prepare(
        "SELECT id,lesson,status,amount FROM orders WHERE learner=? ORDER BY created DESC LIMIT 10",
      )
      .all(learner),
  });
});
app.post("/api/tasks", async (req, res) => {
  limit(`tasks:${res.locals.learner}`, 20, 3600000);
  const input = z
    .object({
      goal: z.string().trim().min(5).max(2000),
      sampleKey: keySchema.optional(),
      files: z
        .array(
          z.object({
            name: z.string().max(100),
            text: z.string().max(2 * 1024 * 1024),
          }),
        )
        .max(2)
        .optional(),
      shareSamples: z.boolean().optional(),
    })
    .parse(req.body);
  const datasets: Dataset[] = input.files?.length
    ? input.files.map((f, i) => parseCSV(f.text, f.name, id(`data${i}`)))
    : sampleDatasets(
        input.sampleKey ||
          (/stock|flag|below/i.test(input.goal)
            ? "flag-exceptions"
            : /match|connect|lookup/i.test(input.goal)
              ? "match-records"
              : "summarise-sales"),
      );
  const envelope =
    input.shareSamples === false
      ? datasets.map((d) => ({ ...d, rows: [] }))
      : datasets;
  const plan = await analyse(input.goal, envelope, input.sampleKey);
  const task: Task = {
    ...plan,
    id: id("task"),
    goal: input.goal,
    datasets,
    createdAt: new Date().toISOString(),
  };
  // Validate semantics before any purchase, including duplicate lookup keys and numeric thresholds.
  if (!task.unsupported && !task.clarification)
    compute(datasets, task.lessonKey, task.expected);
  db.prepare("INSERT INTO tasks VALUES(?,?,?,?)").run(
    task.id,
    res.locals.learner,
    JSON.stringify(task),
    task.createdAt,
  );
  res.json({
    ...task,
    owned: !!hasAccess(db, res.locals.learner, task.lessonKey),
  });
});
app.get("/api/tasks/:id", (req, res) => {
  const task = ownTask(res.locals.learner, String(req.params.id));
  res.json({
    ...task,
    owned: !!hasAccess(db, res.locals.learner, task.lessonKey),
  });
});
app.post("/api/demo-access", (req, res) => {
  if (!demo)
    return res
      .status(403)
      .json({ error: { message: "Demo access is disabled." } });
  limit(`demo:${res.locals.learner}`, 30, 3600000);
  const { taskId } = z.object({ taskId: z.string() }).parse(req.body);
  const task = ownTask(res.locals.learner, taskId);
  if (task.unsupported || task.clarification)
    throw new Error("Finish defining the task before opening a lesson.");
  db.prepare(
    "INSERT OR IGNORE INTO grants(learner,lesson,source,order_id) VALUES(?,?,'demo',?)",
  ).run(res.locals.learner, task.lessonKey, `demo-${task.lessonKey}`);
  res.json({ ok: true, source: "demo" });
});
app.post("/api/orders", async (req, res) => {
  if (!paypalReady())
    return res.status(503).json({
      error: {
        message:
          "Add your PayPal sandbox app Client ID and Secret to .env, then restart TaskSlice.",
      },
    });
  limit(`order:${res.locals.learner}`, 20, 3600000);
  const input = z
    .object({ taskId: z.string(), idempotencyKey: z.string().uuid() })
    .parse(req.body);
  const task = ownTask(res.locals.learner, input.taskId);
  if (task.unsupported || task.clarification)
    throw new Error("Finish defining your task before purchasing.");
  const learner = res.locals.learner;
  const existing = db
    .prepare("SELECT * FROM orders WHERE learner=? AND request_key=?")
    .get(learner, input.idempotencyKey) as any;
  if (existing) {
    if (existing.task !== task.id)
      throw Object.assign(
        new Error("That checkout belongs to a different task."),
        { status: 409 },
      );
    const providerId =
      existing.provider_id && merchantFor(existing)
        ? existing.provider_id
        : await ensureProviderOrder(existing);
    return res.json({
      id: existing.id,
      status: existing.status,
      providerId,
      amount: existing.amount,
    });
  }
  if (hasAccess(db, learner, task.lessonKey)) return res.json({ owned: true });
  const active = db
    .prepare(
      "SELECT * FROM orders WHERE learner=? AND lesson=? AND status IN ('creating','awaiting_buyer','capture_requested','pending','needs_reconciliation') ORDER BY created DESC LIMIT 1",
    )
    .get(learner, task.lessonKey) as any;
  if (active && active.provider_id && merchantFor(active))
    return res.json({
      id: active.id,
      status: active.status,
      providerId: active.provider_id,
      amount: active.amount,
    });
  if (active) {
    const providerId = await ensureProviderOrder(active);
    return res.json({
      id: active.id,
      status: "awaiting_buyer",
      providerId,
      amount: active.amount,
    });
  }
  const lesson = getLesson(task.lessonKey)!;
  const order = {
    id: id("order"),
    learner,
    lesson: task.lessonKey,
    task: task.id,
    amount: lesson.price,
  };
  db.prepare("INSERT INTO orders VALUES(?,?,?,?,'creating',NULL,?,?,?,?)").run(
    order.id,
    learner,
    order.lesson,
    order.task,
    input.idempotencyKey,
    order.amount,
    JSON.stringify({
      title: lesson.title,
      version: 1,
      merchantId: process.env.PAYPAL_MERCHANT_ID,
    }),
    new Date().toISOString(),
  );
  try {
    const saved = db
      .prepare("SELECT * FROM orders WHERE id=?")
      .get(order.id) as any;
    const providerId = await ensureProviderOrder(saved);
    res.json({
      id: order.id,
      providerId,
      status: "awaiting_buyer",
      amount: order.amount,
    });
  } catch (e) {
    db.prepare(
      "UPDATE orders SET status='needs_reconciliation' WHERE id=?",
    ).run(order.id);
    throw e;
  }
});
app.post("/api/orders/:id/capture", async (req, res) => {
  const order = db
    .prepare("SELECT * FROM orders WHERE id=? AND learner IN (?,?)")
    .get(
      String(req.params.id),
      res.locals.learner,
      accountId(db, res.locals.learner) || res.locals.learner,
    ) as any;
  if (!order)
    throw Object.assign(new Error("Checkout not found."), { status: 404 });
  if (order.status === "paid") return res.json({ status: "paid" });
  if (!order.provider_id) throw new Error("This checkout is not ready.");
  const lease = db
    .prepare(
      "UPDATE orders SET status='capture_requested' WHERE id=? AND status IN ('awaiting_buyer','pending','needs_reconciliation')",
    )
    .run(order.id);
  if (!lease.changes) return res.json({ status: order.status });
  try {
    const body = await paypal(
      `/v2/checkout/orders/${order.provider_id}/capture`,
      "POST",
      {},
      `capture-${order.id}`,
    );
    if (body.status !== "COMPLETED") {
      db.prepare("UPDATE orders SET status='pending' WHERE id=?").run(order.id);
      return res.json({ status: "pending" });
    }
    const full = await paypal(`/v2/checkout/orders/${order.provider_id}`);
    grantCapture(db, order, captureObservation(full), merchantFor(order));
    res.json({ status: "paid" });
  } catch (e) {
    db.prepare(
      "UPDATE orders SET status='needs_reconciliation' WHERE id=? AND status!='paid'",
    ).run(order.id);
    try {
      await reconcile(order);
      const latest = db
        .prepare("SELECT status FROM orders WHERE id=?")
        .get(order.id) as any;
      if (latest.status === "paid") return res.json({ status: "paid" });
    } catch {}
    throw e;
  }
});
app.get("/api/orders/:id", async (req, res) => {
  const order = db
    .prepare("SELECT * FROM orders WHERE id=? AND learner IN (?,?)")
    .get(
      String(req.params.id),
      res.locals.learner,
      accountId(db, res.locals.learner) || res.locals.learner,
    ) as any;
  if (!order)
    throw Object.assign(new Error("Checkout not found."), { status: 404 });
  if (!["refunded", "reversed"].includes(order.status)) {
    limit(`status:${order.id}`, 20, 60000);
    try {
      await reconcile(order);
    } catch {}
  }
  const latest = db
    .prepare("SELECT status FROM orders WHERE id=?")
    .get(order.id) as any;
  res.json({
    id: order.id,
    status: latest.status,
    amount: order.amount,
    providerId: order.provider_id,
  });
});
app.post("/api/exercises", async (req, res) => {
  const { taskId } = z.object({ taskId: z.string() }).parse(req.body);
  const task = ownTask(res.locals.learner, taskId);
  const access = hasAccess(db, res.locals.learner, task.lessonKey);
  if (!access)
    throw Object.assign(
      new Error(
        "Open the lesson through demo access or PayPal checkout first.",
      ),
      { status: 403 },
    );
  const existing = db
    .prepare("SELECT body FROM exercises WHERE learner=?")
    .all(res.locals.learner)
    .map((x: any) => JSON.parse(x.body) as Exercise)
    .find((e) => e.task.id === taskId);
  if (existing) return res.json(existing);
  const ex: Exercise = {
    id: id("exercise"),
    task,
    lessonKey: task.lessonKey,
    settings: { ...emptySettings },
    step: 0,
    revision: 0,
    completed: false,
    answer: null,
    updatedAt: new Date().toISOString(),
    access: access.source,
  };
  saveExercise(res.locals.learner, ex);
  res.json(ex);
});
app.get("/api/exercises/:id", (req, res) =>
  res.json(ownExercise(res.locals.learner, String(req.params.id))),
);
app.patch("/api/exercises/:id", (req, res) => {
  const ex = ownExercise(res.locals.learner, String(req.params.id));
  const input = z
    .object({
      revision: z.number().int(),
      settings: settingsSchema,
      step: z.number().int().min(0).max(2),
      answer: z.number().int().min(0).max(2).nullable(),
    })
    .parse(req.body);
  if (ex.revision !== input.revision)
    throw Object.assign(
      new Error("This lesson changed in another tab. Reopen it to continue."),
      { status: 409 },
    );
  ex.settings = input.settings;
  ex.step = input.step;
  ex.answer = input.answer;
  ex.revision++;
  ex.completed = false;
  saveExercise(res.locals.learner, ex);
  res.json(ex);
});
app.post("/api/exercises/:id/check", (req, res) => {
  const ex = ownExercise(res.locals.learner, String(req.params.id));
  const body = z
    .object({
      settings: settingsSchema,
      answer: z.number().int().min(0).max(2).nullable(),
      revision: z.number().int(),
    })
    .parse(req.body);
  if (body.revision !== ex.revision)
    throw Object.assign(
      new Error("Reopen this lesson to load the latest progress."),
      { status: 409 },
    );
  const result = compute(ex.task.datasets, ex.lessonKey, body.settings);
  const correct = settingsMatch(ex.lessonKey, body.settings, ex.task.expected);
  const answerCorrect = body.answer === getLesson(ex.lessonKey)!.correctAnswer;
  ex.settings = body.settings;
  ex.answer = body.answer;
  ex.completed = correct && answerCorrect;
  ex.step = 2;
  ex.revision++;
  saveExercise(res.locals.learner, ex);
  res.json({
    exercise: ex,
    result,
    correct,
    answerCorrect,
    message: !correct
      ? "Your controls produce a result, but not the task you asked for. Check the selected columns and rule."
      : !answerCorrect
        ? "Your table is right. Take another look at the quick question to finish."
        : "You did it. That’s one more useful skill in your toolkit.",
  });
});
app.post("/api/exercises/:id/hints", async (req, res) => {
  const ex = ownExercise(res.locals.learner, String(req.params.id));
  limit(`hints:${res.locals.learner}`, 30, 3600000);
  const input = z
    .object({
      level: z.number().int().min(0).max(2),
      question: z.string().max(500).optional(),
    })
    .parse(req.body);
  const hint = getLesson(ex.lessonKey)!.hints[input.level];
  if (input.question?.trim())
    return res.json(
      await contextualHint(
        input.question,
        {
          goal: ex.task.goal,
          columns: ex.task.datasets.map((d) => d.columns.map((c) => c.name)),
          settings: ex.settings,
        },
        hint,
      ),
    );
  res.json({ hint, source: "authored" });
});
app.get("/api/exercises/:id/export", (req, res) => {
  const ex = ownExercise(res.locals.learner, String(req.params.id));
  if (!ex.completed)
    throw Object.assign(
      new Error("Check and finish this lesson before downloading your result."),
      { status: 403 },
    );
  const result = compute(ex.task.datasets, ex.lessonKey, ex.settings);
  res
    .type("text/csv")
    .setHeader(
      "Content-Disposition",
      `attachment; filename="taskslice-${ex.lessonKey}.csv"`,
    );
  res.send(exportCSV(result));
});
app.delete("/api/data", (_req, res) => {
  const learner = res.locals.learner;
  transaction(db, () => {
    db.prepare("DELETE FROM exercises WHERE learner=?").run(learner);
    db.prepare("DELETE FROM tasks WHERE learner=?").run(learner);
  });
  res.json({ ok: true });
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: { message: "This action was not found." } }),
);
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status = err instanceof z.ZodError ? 400 : err.status || 400;
    res.status(status).json({
      error: {
        message:
          err instanceof z.ZodError
            ? "Some details are missing or invalid. Please check your input."
            : err.message || "Something went wrong. Please try again.",
      },
    });
  },
);
if (production) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: { port: Number(process.env.HMR_PORT || port + 100) },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(port, process.env.HOST || "127.0.0.1");
server.on("listening", () =>
  console.log(`ScrapDrop ready at http://127.0.0.1:${port}`),
);
server.on("error", (error) => {
  console.error("ScrapDrop could not start: " + error.message);
  process.exit(1);
});
let busy = false;
const worker = setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    await scrapRuntime.worker();
    for (const ev of db
      .prepare("SELECT body FROM events WHERE status='received' LIMIT 5")
      .all() as any[])
      try {
        await processEvent(JSON.parse(ev.body));
      } catch {}
    if (paypalReady())
      for (const order of db
        .prepare(
          "SELECT * FROM orders WHERE status IN ('creating','needs_reconciliation','pending','capture_requested') LIMIT 5",
        )
        .all() as any[])
        try {
          await reconcile(order);
        } catch {}
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    db.prepare("DELETE FROM exercises WHERE updated<?").run(cutoff);
    db.prepare("DELETE FROM tasks WHERE created<?").run(cutoff);
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    db.prepare("DELETE FROM rate_limits WHERE reset<?").run(Date.now());
  } finally {
    busy = false;
  }
}, 30000);
worker.unref();
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    clearInterval(worker);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
