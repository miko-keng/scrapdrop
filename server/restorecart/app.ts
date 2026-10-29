import {
  accountTables,
  seedConfiguredAccount,
  mountAccounts,
  userFor,
  buyerIdentity,
  authorizeSeller,
  owns,
  assignOwner,
} from "./accounts";
import { mountContinuity, readiness, meta } from "./continuity";
import {
  productCategories,
  shopDescription,
} from "../../src/restorecart/directory";
import express from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { paypalReady } from "../paypal";
import {
  fail,
  hash,
  uid,
  candidateSchema,
  type Product,
  salesReportCSV,
} from "./domain";
import {
  openRC,
  incident,
  save,
  createIncident,
  viewIncident,
  publish,
  available,
  reserve,
  order,
  cancel,
  expire,
  closeIncident,
  recovery,
  tx,
  type DB,
} from "./store";
import { addSource, addSample } from "./sources";
import { reconstruct, status, config } from "./reconstruction";
import { payments } from "./payments";

export function createApp(
  options: {
    db?: DB;
    base?: string;
    paymentTransport?: Parameters<typeof payments>[2];
    testPassword?: string;
  } = {},
) {
  if (process.env.PAYPAL_ENV && process.env.PAYPAL_ENV !== "sandbox")
    throw Error("RestoreCart supports sandbox only.");
  config();
  const app = express(),
    db = options.db || openRC(),
    base =
      options.base ||
      `http://127.0.0.1:${process.env.RESTORECART_PORT || 4370}`,
    production = process.env.NODE_ENV === "production";
  const email =
      process.env.RESTORECART_SELLER_EMAIL || "seller@restorecart.test",
    password =
      options.testPassword ||
      process.env.RESTORECART_SELLER_PASSWORD ||
      (!production ? "RestoreCart2026!" : "");
  accountTables(db);
  seedConfiguredAccount(db, email, password);
  const pay = payments(db, base, options.paymentTransport);
  let working = false;
  app.disable("x-powered-by");
  app.use(express.json({ limit: "28mb" }));
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  const router = express.Router();
  app.use("/api/restorecart", router);
  // Durable verified inbox; no browser CSRF requirement for PayPal's authenticated callback.
  app.post("/api/paypal/webhook", async (req, res, next) => {
    try {
      await pay.receive(req.headers, req.body);
      res.sendStatus(202);
    } catch (e) {
      next(e);
    }
  });
  router.use((req, res, next) => {
    const cookie = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("rc_session="))
      ?.slice(11);
    let session = cookie
      ? (db
          .prepare("SELECT * FROM rc_sessions WHERE id=? AND expires>?")
          .get(hash(cookie), Date.now()) as any)
      : null;
    if (!session) {
      const raw = randomBytes(32).toString("hex");
      session = {
        id: hash(raw),
        csrf: randomBytes(24).toString("hex"),
        seller: 0,
        expires: Date.now() + 86400000,
      };
      db.prepare("INSERT INTO rc_sessions VALUES(?,?,?,?)").run(
        session.id,
        session.csrf,
        session.seller,
        session.expires,
      );
      res.cookie("rc_session", raw, {
        httpOnly: true,
        sameSite: "lax",
        secure: production,
        maxAge: 86400000,
        path: "/",
      });
    }
    res.locals.session = session;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers["x-csrf-token"] !== session.csrf)
        return next(
          Object.assign(Error("Refresh the page before trying again."), {
            status: 403,
          }),
        );
      if (
        (req.headers.origin && req.headers.origin !== base) ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        return next(
          Object.assign(Error("Cross-site requests are not accepted."), {
            status: 403,
          }),
        );
    }
    next();
  });
  const seller: express.RequestHandler = (req, res, next) => {
    try {
      authorizeSeller(db, req, res);
      next();
    } catch (e) {
      next(e);
    }
  };
  const asyncRoute =
    (
      fn: (req: express.Request, res: express.Response) => any,
    ): express.RequestHandler =>
    (req, res, next) => {
      Promise.resolve()
        .then(() => fn(req, res))
        .catch(next);
    };
  mountAccounts(router, db, asyncRoute, production);
  mountContinuity(router, db, seller, asyncRoute);
  const parseId = (req: express.Request, key = "id") => String(req.params[key]);
  function readable(req: express.Request, res: express.Response) {
    const o = order(db, parseId(req));
    if (
      !(
        res.locals.session.seller &&
        owns(db, userFor(db, res.locals.session)?.id, "incident", o.incident)
      ) &&
      o.buyer !== buyerIdentity(db, res.locals.session) &&
      req.query.access !== o.token
    )
      fail("This receipt is private.", 403);
    return o;
  }
  function publicOrder(o: any) {
    return {
      id: o.id,
      incident: o.incident,
      state: o.state,
      fulfillment: o.fulfillment,
      amount: o.amount,
      refunded: o.refunded,
      provider: o.provider,
      capture: o.capture,
      expires: o.expires,
      snapshot: o.snapshot,
      receiptUrl: `/restorecart/receipt/${o.id}?access=${o.token}`,
      shopUrl: `/s/${incident(db, o.incident).slug}`,
      refund:
        db
          .prepare("SELECT state,restocked FROM rc_refunds WHERE order_id=?")
          .get(o.id) || null,
    };
  }
  router.get("/session", (_req, res) =>
    res.json({
      csrf: res.locals.session.csrf,
      seller: !!res.locals.session.seller,
      user: userFor(db, res.locals.session),
      paypalReady: !!options.paymentTransport || paypalReady(),
      environment: "sandbox",
    }),
  );
  router.get("/seller-session", (_req, res) =>
    res.json({
      csrf: res.locals.session.csrf,
      seller: !!res.locals.session.seller,
      user: userFor(db, res.locals.session),
      ai: status(),
      paypalReady: !!options.paymentTransport || paypalReady(),
      environment: "sandbox",
      sellerConfigured: !!password,
      ...(!production
        ? {
            practiceAccount: {
              email,
              password: process.env.RESTORECART_SELLER_PASSWORD
                ? undefined
                : "RestoreCart2026!",
            },
          }
        : {}),
    }),
  );
  router.post("/logout", (req, res) => {
    db.prepare("DELETE FROM rc_sessions WHERE id=?").run(res.locals.session.id);
    db.prepare("DELETE FROM rc_session_accounts WHERE session_id=?").run(
      res.locals.session.id,
    );
    res.clearCookie("rc_session", { path: "/" });
    res.json({ ok: true });
  });
  router.get("/incidents", seller, (_req, res) =>
    res.json(
      (
        db
          .prepare("SELECT body FROM rc_incidents ORDER BY rowid DESC")
          .all() as any[]
      )
        .map((r) => JSON.parse(r.body))
        .filter((i) => owns(db, res.locals.user.id, "incident", i.id)),
    ),
  );
  router.post(
    "/incidents",
    seller,
    asyncRoute((req, res) => {
      const shop = createIncident(
        db,
        z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body)
          .name,
      );
      assignOwner(db, "incident", shop.id, res.locals.user.id);
      res.status(201).json(shop);
    }),
  );
  router.get(
    "/incidents/:id",
    seller,
    asyncRoute((req, res) => {
      expire(db);
      res.json(viewIncident(db, parseId(req)));
    }),
  );
  router.post(
    "/incidents/:id/example",
    seller,
    asyncRoute(async (req, res) => {
      await addSample(db, parseId(req));
      res.json(viewIncident(db, parseId(req)));
    }),
  );
  router.post(
    "/incidents/:id/sources",
    seller,
    asyncRoute(async (req, res) => {
      const b = z
        .object({ name: z.string(), data: z.string() })
        .parse(req.body);
      res.status(201).json(await addSource(db, parseId(req), b));
    }),
  );
  router.get(
    "/sources/:id",
    seller,
    asyncRoute((req, res) => {
      const s = db
        .prepare("SELECT * FROM rc_sources WHERE id=?")
        .get(parseId(req)) as any;
      if (!s) fail("Source not found.", 404);
      res
        .type(s.mime)
        .set(
          "Content-Disposition",
          s.mime === "text/csv"
            ? 'attachment; filename="source.csv"'
            : "inline",
        )
        .send(Buffer.from(s.bytes));
    }),
  );
  const runs = new Set<string>();
  router.post(
    "/incidents/:id/reconstruct",
    seller,
    asyncRoute(async (req, res) => {
      const id = parseId(req);
      if (runs.has(id)) fail("Reconstruction is already running.", 409);
      runs.add(id);
      try {
        await reconstruct(db, id);
        res.json(viewIncident(db, id));
      } finally {
        runs.delete(id);
      }
    }),
  );
  const productEdit = candidateSchema.extend({
    price: z.string().max(30),
    currency: z.string().max(10),
    allocation: z.number().int().min(0).max(10000),
    excluded: z.boolean(),
    resolved: z.boolean(),
    resolutionNote: z.string().max(1000),
  });
  router.patch(
    "/incidents/:id",
    seller,
    asyncRoute((req, res) => {
      const b = z
        .object({
          revision: z.number().int(),
          name: z.string().trim().min(1).max(80),
          pickup: z.string().max(1000),
          originalUrl: z.union([z.literal(""), z.url().startsWith("https://")]),
          products: z.array(productEdit).max(50),
        })
        .parse(req.body);
      const id = parseId(req);
      tx(db, () => {
        const i = incident(db, id);
        if (i.revision !== b.revision)
          fail("Draft changed. Refresh before saving.", 409);
        if (!["draft", "live"].includes(i.state))
          fail("This incident is closing or closed.", 409);
        if (new Set(b.products.map((p) => p.sku)).size !== b.products.length)
          fail("SKUs must be unique.");
        const previous = i.products;
        for (const old of previous) {
          const next = b.products.find((p) => p.sku === old.sku);
          if (
            !next &&
            available(db, id, old.sku, old.allocation) !== old.allocation
          )
            fail("A product with holds or sales cannot be removed.", 409);
        }
        for (const p of b.products) {
          if (available(db, id, p.sku, p.allocation) < 0)
            fail(
              "Allocation cannot be lower than reserved or sold units.",
              409,
            );
          if (p.imageSourceId) {
            const src = db
              .prepare("SELECT mime FROM rc_sources WHERE id=? AND incident=?")
              .get(p.imageSourceId, id) as any;
            if (!src?.mime.startsWith("image/"))
              fail("Choose an image belonging to this rescue shop.");
          }
        }
        i.name = b.name;
        i.pickup = b.pickup;
        i.originalUrl = b.originalUrl;
        i.products = b.products as Product[];
        i.revision++;
        save(db, i);
      });
      res.json(viewIncident(db, id));
    }),
  );
  router.post(
    "/incidents/:id/publish",
    seller,
    asyncRoute((req, res) => {
      if (meta(db, `rehearsal:${parseId(req)}`, null))
        fail(
          "This isolated rehearsal cannot publish or accept payments. Restore a new operational draft from a kit when needed.",
          409,
        );
      const checks = readiness(db, parseId(req));
      if (checks.needsInformation)
        fail(
          "Answer the recovery questions and confirm physical stock for every included product before publishing.",
          409,
        );
      publish(
        db,
        parseId(req),
        z.object({ revision: z.number().int() }).parse(req.body).revision,
      );
      db.prepare("INSERT OR REPLACE INTO rc_meta VALUES(?,?)").run(
        `public-contact:${parseId(req)}`,
        JSON.stringify(
          meta(db, `contact:${parseId(req)}`, {
            contact: "",
            hours: "",
            status: "",
          }),
        ),
      );
      res.json(viewIncident(db, parseId(req)));
    }),
  );
  router.get(
    "/shops",
    asyncRoute((_req, res) => {
      expire(db);
      const shops = (
        db
          .prepare("SELECT body FROM rc_incidents ORDER BY rowid DESC")
          .all() as any[]
      )
        .map((row) => JSON.parse(row.body))
        .filter((i) => i.state === "live" && i.published)
        .map((i) => {
          const products = i.published.products.map((p: any) => ({
            sku: p.sku,
            name: p.name,
            description: p.description,
            price: p.price,
            currency: p.currency,
            imageSourceId: p.imageSourceId,
            categories: productCategories(p),
            available: available(
              db,
              i.id,
              p.sku,
              i.products.find((v: any) => v.sku === p.sku)?.allocation || 0,
            ),
          }));
          const stocked = products.filter(
            (p: any) =>
              available(
                db,
                i.id,
                p.sku,
                i.products.find((v: any) => v.sku === p.sku)?.allocation || 0,
              ) > 0,
          );
          const preview = stocked[0] || products[0];
          return {
            slug: i.slug,
            name: i.published.name,
            description: shopDescription(products),
            categories: [
              ...new Set(products.flatMap((p: any) => p.categories)),
            ],
            products,
            productCount: products.length,
            availableProductCount: stocked.length,
            preview: preview
              ? {
                  sku: preview.sku,
                  name: preview.name,
                  imageSourceId: preview.imageSourceId,
                }
              : null,
          };
        });
      res.json(shops);
    }),
  );
  router.get(
    "/shops/:slug",
    asyncRoute((req, res) => {
      expire(db);
      const row = db
        .prepare("SELECT id FROM rc_incidents WHERE slug=?")
        .get(parseId(req, "slug")) as any;
      if (!row) fail("Shop not found.", 404);
      const i = incident(db, row.id);
      if (!i.published) fail("This shop is not published yet.", 404);
      res.json({
        id: i.id,
        slug: i.slug,
        state: i.state,
        originalUrl: i.state === "closed" ? i.originalUrl : undefined,
        ...i.published,
        contact: meta(db, `public-contact:${i.id}`, {
          contact: "",
          hours: "",
          status: "",
        }),
        products: i.published.products.map((p) => ({
          sku: p.sku,
          name: p.name,
          description: p.description,
          price: p.price,
          currency: p.currency,
          imageSourceId: p.imageSourceId,
          available: available(
            db,
            i.id,
            p.sku,
            i.products.find((v) => v.sku === p.sku)?.allocation || 0,
          ),
        })),
      });
    }),
  );
  router.get(
    "/shops/:slug/images/:source",
    asyncRoute((req, res) => {
      const row = db
        .prepare("SELECT id FROM rc_incidents WHERE slug=?")
        .get(parseId(req, "slug")) as any;
      if (!row) fail("Shop not found.", 404);
      const i = incident(db, row.id),
        sid = String(req.params.source);
      if (!i.published?.products.some((p) => p.imageSourceId === sid))
        fail("Image not published.", 404);
      const s = db
        .prepare("SELECT mime,bytes FROM rc_sources WHERE id=? AND incident=?")
        .get(sid, i.id) as any;
      if (!s || !/^image\/(png|jpeg)$/.test(s.mime))
        fail("Image not found.", 404);
      res.type(s.mime).send(Buffer.from(s.bytes));
    }),
  );
  router.post(
    "/shops/:slug/orders",
    asyncRoute(async (req, res) => {
      if (!options.paymentTransport && !paypalReady())
        fail("PayPal sandbox is not configured. Checkout is unavailable.", 503);
      const b = z
        .object({
          requestKey: z.string().min(10).max(100),
          revision: z.number().int(),
          lines: z
            .array(
              z.object({
                sku: z.string().max(80),
                quantity: z.number().int().min(1).max(100),
              }),
            )
            .max(50),
        })
        .parse(req.body);
      const row = db
        .prepare("SELECT id FROM rc_incidents WHERE slug=?")
        .get(parseId(req, "slug")) as any;
      if (!row) fail("Shop not found.", 404);
      expire(db);
      const count = (
        db
          .prepare(
            "SELECT count(*) n FROM rc_orders WHERE buyer=? AND state IN('creating','awaiting_buyer')",
          )
          .get(buyerIdentity(db, res.locals.session)) as any
      ).n;
      if (
        count >= 5 &&
        !db
          .prepare("SELECT id FROM rc_orders WHERE buyer=? AND request_key=?")
          .get(buyerIdentity(db, res.locals.session), b.requestKey)
      )
        fail("Finish or cancel an existing checkout first.", 429);
      let o = reserve(
        db,
        row.id,
        buyerIdentity(db, res.locals.session),
        b.requestKey,
        randomBytes(32).toString("hex"),
        b.revision,
        b.lines,
      );
      try {
        o = await pay.ensure(o.id);
      } catch {
        res.status(202);
      }
      res.json(publicOrder(o));
    }),
  );
  router.get("/orders", seller, (req, res) => {
    const id = String(req.query.incident || "");
    res.json(
      (
        db
          .prepare(
            "SELECT id FROM rc_orders WHERE incident=? ORDER BY rowid DESC",
          )
          .all(id) as any[]
      ).map((r) => publicOrder(order(db, r.id))),
    );
  });
  router.get(
    "/orders/:id",
    asyncRoute((req, res) => res.json(publicOrder(readable(req, res)))),
  );
  router.post(
    "/orders/:id/check",
    asyncRoute(async (req, res) => {
      const o = readable(req, res);
      await pay.reconcile(o.id, true);
      res.json(publicOrder(order(db, o.id)));
    }),
  );
  router.post(
    "/orders/:id/cancel",
    asyncRoute((req, res) => {
      const o = readable(req, res);
      cancel(db, o.id);
      res.json(publicOrder(order(db, o.id)));
    }),
  );
  router.post(
    "/orders/:id/refund",
    seller,
    asyncRoute(async (req, res) =>
      res.json(publicOrder(await pay.refund(parseId(req)))),
    ),
  );
  router.post(
    "/orders/:id/restock",
    seller,
    asyncRoute((req, res) => res.json(publicOrder(pay.restock(parseId(req))))),
  );
  router.post(
    "/orders/:id/fulfillment",
    seller,
    asyncRoute((req, res) => {
      const o = order(db, parseId(req)),
        state = z
          .object({ state: z.enum(["ready", "collected"]) })
          .parse(req.body).state;
      const refundChecking = db
        .prepare(
          "SELECT state FROM rc_refunds WHERE order_id=? AND state='checking'",
        )
        .get(o.id);
      if (refundChecking)
        fail(
          "A refund is being checked. Wait before handing over these items.",
          409,
        );
      if (o.state !== "paid" || o.refunded)
        fail(
          "Only paid orders without a financial adjustment can be fulfilled.",
          409,
        );
      if (
        state === "collected" &&
        !["ready", "collected"].includes(o.fulfillment)
      )
        fail("Mark this order ready before collection.", 409);
      if (o.fulfillment === "collected" && state === "ready")
        fail("Collected orders cannot return to ready.", 409);
      db.prepare("UPDATE rc_orders SET fulfillment=? WHERE id=?").run(
        state,
        o.id,
      );
      res.json(publicOrder(order(db, o.id)));
    }),
  );
  router.post(
    "/incidents/:id/close",
    seller,
    asyncRoute((req, res) => res.json(closeIncident(db, parseId(req)))),
  );
  router.post(
    "/incidents/:id/exports",
    seller,
    asyncRoute((req, res) => res.json(recovery(db, parseId(req)))),
  );
  router.get("/incidents/:id/exports", seller, (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT id,hash,created FROM rc_exports WHERE incident=? ORDER BY created DESC",
        )
        .all(parseId(req)),
    ),
  );
  router.get(
    "/exports/:id",
    seller,
    asyncRoute((req, res) => {
      const row = db
        .prepare("SELECT body FROM rc_exports WHERE id=?")
        .get(parseId(req)) as any;
      if (!row) fail("Export not found.", 404);
      const body = JSON.parse(row.body);
      if (req.query.file === "report") {
        res
          .type("text/csv")
          .attachment("restorecart-sales-report.csv")
          .send(salesReportCSV(body));
      } else if (req.query.file) {
        const file = String(req.query.file);
        if (!Object.hasOwn(body.csv, file)) fail("Export file not found.", 404);
        res.type("text/csv").attachment(`${file}.csv`).send(body.csv[file]);
      } else
        res
          .type("application/json")
          .attachment("restorecart-recovery.json")
          .send(JSON.stringify(body, null, 2));
    }),
  );
  router.get("/health", seller, (_req, res) =>
    res.json({
      ai: status(),
      payments: "sandbox",
      webhookConfigured: !!process.env.PAYPAL_WEBHOOK_ID,
      events: db
        .prepare("SELECT state,count(*) n FROM rc_events GROUP BY state")
        .all(),
    }),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: { message: "API route not found." } }),
  );
  const errors: express.ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error.status || (error instanceof z.ZodError ? 400 : 500);
    res.status(status).json({
      error: {
        message:
          error instanceof z.ZodError
            ? error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .slice(0, 3)
                .join("; ")
            : status < 500
              ? error.message
              : (error as Error).message.includes("Gemini") ||
                  (error as Error).message.includes("PayPal")
                ? (error as Error).message
                : "The request could not finish. Your saved work is still available.",
      },
    });
  };
  app.use(errors);
  return {
    app,
    db,
    pay,
    async tick() {
      if (working) return;
      working = true;
      try {
        expire(db);
        await pay.worker();
      } finally {
        working = false;
      }
    },
  };
}
