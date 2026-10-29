import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { hash, uid, fail } from "./domain";
import { incident, available, tx, type DB } from "./store";

export const BOOTSTRAP = "configured-seller";
export function accountTables(db: DB) {
  db.exec(`CREATE TABLE IF NOT EXISTS rc_accounts(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS rc_session_accounts(session_id TEXT PRIMARY KEY,account_id TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS rc_owners(kind TEXT NOT NULL,id TEXT NOT NULL,account_id TEXT NOT NULL,PRIMARY KEY(kind,id));
  CREATE TABLE IF NOT EXISTS rc_carts(owner TEXT NOT NULL,slug TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(owner,slug));`);
}
export function passwordDigest(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 32).toString("hex");
}
function matches(password: string, digest: string) {
  const [salt, encoded] = digest.split(":");
  const actual = scryptSync(password, salt, 32),
    expected = Buffer.from(encoded, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export function seedConfiguredAccount(db: DB, email: string, password: string) {
  if (!password) return;
  const old = db
    .prepare("SELECT * FROM rc_accounts WHERE id=?")
    .get(BOOTSTRAP) as any;
  if (
    old &&
    old.email === email.toLowerCase() &&
    matches(password, old.password_hash)
  )
    return;
  db.prepare(
    `INSERT INTO rc_accounts VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash`,
  ).run(
    BOOTSTRAP,
    email.toLowerCase(),
    "workspace-owner",
    passwordDigest(password),
    "seller",
  );
}
export function userFor(db: DB, session: any) {
  const row = db
    .prepare(
      "SELECT a.id,a.email,a.username,a.role FROM rc_accounts a JOIN rc_session_accounts s ON a.id=s.account_id WHERE s.session_id=?",
    )
    .get(session.id) as any;
  return (
    row ||
    (session.seller
      ? db
          .prepare("SELECT id,email,username,role FROM rc_accounts WHERE id=?")
          .get(BOOTSTRAP)
      : null)
  );
}
export function buyerIdentity(db: DB, session: any) {
  return userFor(db, session)?.id || session.id;
}
export function assignOwner(db: DB, kind: string, id: string, account: string) {
  db.prepare(
    "INSERT INTO rc_owners VALUES(?,?,?) ON CONFLICT(kind,id) DO NOTHING",
  ).run(kind, id, account);
}
export function owns(
  db: DB,
  account: string,
  kind: string,
  id: string,
): boolean {
  const row = db
    .prepare("SELECT account_id FROM rc_owners WHERE kind=? AND id=?")
    .get(kind, id) as any;
  if (row) return row.account_id === account;
  if (kind === "kit") {
    const r = db
      .prepare("SELECT value FROM rc_meta WHERE key=?")
      .get(`kit:${id}`) as any;
    if (r) return owns(db, account, "incident", JSON.parse(r.value).incidentId);
  }
  return account === BOOTSTRAP;
}
export function requireOwned(
  db: DB,
  account: string,
  kind: string,
  id: string,
) {
  if (!owns(db, account, kind, id))
    fail("This workspace belongs to another seller.", 403);
}
export function authorizeSeller(db: DB, req: any, res: any) {
  const user = userFor(db, res.locals.session);
  if (!user || user.role !== "seller")
    fail("Sign in as a seller to continue.", 403);
  res.locals.user = user;
  let id = String(req.params.id || "");
  if (req.path.startsWith("/incidents/") && id)
    requireOwned(db, user.id, "incident", id);
  if (req.path === "/orders" && req.query.incident)
    requireOwned(db, user.id, "incident", String(req.query.incident));
  if (req.path.startsWith("/orders/") && id) {
    const row = db
      .prepare("SELECT incident FROM rc_orders WHERE id=?")
      .get(id) as any;
    if (row) requireOwned(db, user.id, "incident", row.incident);
  }
  if (req.path.startsWith("/sources/") && id) {
    const row = db
      .prepare("SELECT incident FROM rc_sources WHERE id=?")
      .get(id) as any;
    if (row) requireOwned(db, user.id, "incident", row.incident);
  }
  if (req.path.startsWith("/exports/") && id) {
    const row = db
      .prepare("SELECT incident FROM rc_exports WHERE id=?")
      .get(id) as any;
    if (row) requireOwned(db, user.id, "incident", row.incident);
  }
  if (req.params.kitId)
    requireOwned(db, user.id, "kit", String(req.params.kitId));
  if (req.params.storeId)
    requireOwned(db, user.id, "destination", String(req.params.storeId));
  if (req.path === "/health" && user.id !== BOOTSTRAP)
    fail("Operator diagnostics are private.", 403);
}
const registration = z
  .object({
    email: z.email().max(200),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9_-]{2,39}$/),
    password: z.string().min(10).max(200),
    role: z.enum(["buyer", "seller"]),
  })
  .strict();
export function registerAccount(db: DB, input: unknown) {
  const b = registration.parse(input),
    email = b.email.toLowerCase();
  if (
    db
      .prepare("SELECT id FROM rc_accounts WHERE email=? OR username=?")
      .get(email, b.username)
  )
    fail("That email or username is already registered.", 409);
  const user = {
    id: uid("account"),
    email,
    username: b.username,
    role: b.role,
  };
  db.prepare("INSERT INTO rc_accounts VALUES(?,?,?,?,?)").run(
    user.id,
    email,
    user.username,
    passwordDigest(b.password),
    user.role,
  );
  return user;
}
export function mountAccounts(
  router: any,
  db: DB,
  wrap: any,
  production: boolean,
) {
  const attempts = new Map<string, { n: number; until: number }>();
  function throttle(req: any) {
    const key = req.ip || "local",
      old = attempts.get(key),
      now = Date.now();
    const a = old && old.until > now ? old : { n: 0, until: now + 300000 };
    if (a.n >= 12) fail("Too many attempts. Try again in a few minutes.", 429);
    a.n++;
    attempts.set(key, a);
  }
  function authenticate(req: any, res: any, user: any) {
    const previous = res.locals.session.id,
      raw = randomBytes(32).toString("hex"),
      id = hash(raw),
      csrf = randomBytes(24).toString("hex");
    // Attach only this visitor's anonymous records; an existing account's records never move.
    if (!userFor(db, res.locals.session)) {
      db.prepare("UPDATE rc_orders SET buyer=? WHERE buyer=?").run(
        user.id,
        previous,
      );
      db.prepare(
        "INSERT OR IGNORE INTO rc_carts SELECT ?,slug,body FROM rc_carts WHERE owner=?",
      ).run(user.id, previous);
      db.prepare("DELETE FROM rc_carts WHERE owner=?").run(previous);
    }
    db.prepare("DELETE FROM rc_sessions WHERE id=?").run(previous);
    db.prepare("DELETE FROM rc_session_accounts WHERE session_id=?").run(
      previous,
    );
    db.prepare("INSERT INTO rc_sessions VALUES(?,?,?,?)").run(
      id,
      csrf,
      user.role === "seller" ? 1 : 0,
      Date.now() + 86400000,
    );
    db.prepare("INSERT INTO rc_session_accounts VALUES(?,?)").run(id, user.id);
    res.cookie("rc_session", raw, {
      httpOnly: true,
      sameSite: "lax",
      secure: production,
      maxAge: 86400000,
      path: "/",
    });
    res.json({ csrf, seller: user.role === "seller", user });
  }
  router.post(
    "/register",
    wrap((req: any, res: any) => {
      throttle(req);
      const user = registerAccount(db, req.body);
      authenticate(req, res, user);
    }),
  );
  router.post(
    "/login",
    wrap((req: any, res: any) => {
      throttle(req);
      const b = z
        .object({ email: z.string().max(200), password: z.string().max(200) })
        .parse(req.body);
      const identifier = b.email.trim().toLowerCase();
      const row = db
        .prepare("SELECT * FROM rc_accounts WHERE email=? OR username=?")
        .get(identifier, identifier) as any;
      // Equal-cost work for unknown identifiers.
      const valid = matches(
        b.password,
        row?.password_hash ||
          "00000000000000000000000000000000:" + "00".repeat(32),
      );
      if (!row || !valid)
        fail("Email, username or password is incorrect.", 401);
      const { password_hash, ...user } = row;
      authenticate(req, res, user);
    }),
  );
  router.get(
    "/basket",
    wrap((_req: any, res: any) => {
      const rows = db
        .prepare("SELECT slug,body FROM rc_carts WHERE owner=?")
        .all(buyerIdentity(db, res.locals.session)) as any[];
      const shops = rows.flatMap((row) => {
        const shopRow = db
          .prepare("SELECT body FROM rc_incidents WHERE slug=?")
          .get(row.slug) as any;
        if (!shopRow) return [];
        const shop = JSON.parse(shopRow.body),
          saved = JSON.parse(row.body);
        if (!shop.published) return [];
        const lines = shop.published.products
          .filter((p: any) => !p.excluded && saved.quantities[p.sku] > 0)
          .map((p: any) => ({
            sku: p.sku,
            name: p.name,
            quantity: saved.quantities[p.sku],
            unitCents: Math.round(Number(p.price) * 100),
            available: available(
              db,
              shop.id,
              p.sku,
              shop.products.find((v: any) => v.sku === p.sku)?.allocation || 0,
            ),
            imageSourceId: p.imageSourceId,
          }));
        if (!lines.length) return [];
        return [
          {
            slug: row.slug,
            name: shop.published.name,
            pickup: shop.published.pickup,
            state: shop.state,
            revision: shop.published.revision,
            requestKey: saved.requestKey,
            lines,
            total: lines.reduce(
              (n: number, l: any) => n + l.quantity * l.unitCents,
              0,
            ),
          },
        ];
      });
      res.json({
        shops,
        units: shops.reduce(
          (n: number, s: any) =>
            n + s.lines.reduce((sum: number, l: any) => sum + l.quantity, 0),
          0,
        ),
        total: shops.reduce((n: number, s: any) => n + s.total, 0),
      });
    }),
  );
  router.post(
    "/shops/:slug/basket-items",
    wrap((req: any, res: any) => {
      const { slug, shop, owner } = cart(req, res);
      if (shop.state !== "live")
        fail("This shop is closed to new orders.", 409);
      const line = z
        .object({
          sku: z.string().max(80),
          quantity: z.number().int().min(1).max(100),
        })
        .strict();
      const b = z
        .union([
          line,
          z.object({ lines: z.array(line).min(1).max(50) }).strict(),
        ])
        .parse(req.body);
      const lines = "lines" in b ? b.lines : [b];
      if (new Set(lines.map((l) => l.sku)).size !== lines.length)
        fail("Choose distinct basket items.");
      const result = tx(db, () => {
        const row = db
          .prepare("SELECT body FROM rc_carts WHERE owner=? AND slug=?")
          .get(owner, slug) as any;
        const previous = row ? JSON.parse(row.body) : { quantities: {} };
        const quantities = { ...previous.quantities };
        for (const l of lines) {
          if (
            !shop.published!.products.some(
              (p: any) => !p.excluded && p.sku === l.sku,
            )
          )
            fail("This product is no longer available.", 404);
          const count = available(
              db,
              shop.id,
              l.sku,
              shop.products.find((p: any) => p.sku === l.sku)?.allocation || 0,
            ),
            quantity = (quantities[l.sku] || 0) + l.quantity;
          if (quantity > Math.min(100, count))
            fail(
              "Your basket already contains the available quantity. Review your basket.",
              409,
            );
          quantities[l.sku] = quantity;
        }
        const result = { quantities, requestKey: uid("cart") };
        db.prepare(
          "INSERT INTO rc_carts VALUES(?,?,?) ON CONFLICT(owner,slug) DO UPDATE SET body=excluded.body",
        ).run(owner, slug, JSON.stringify(result));
        return result;
      });
      res.json(result);
    }),
  );
  router.get(
    "/my-carts",
    wrap((_req: any, res: any) => {
      const user = userFor(db, res.locals.session);
      if (!user) fail("Sign in to see your carts.", 401);
      const rows = db
        .prepare("SELECT slug,body FROM rc_carts WHERE owner=?")
        .all(user.id) as any[];
      res.json(
        rows.flatMap((row) => {
          const saved = JSON.parse(row.body),
            shopRow = db
              .prepare("SELECT body FROM rc_incidents WHERE slug=?")
              .get(row.slug) as any;
          if (!shopRow) return [];
          const shop = JSON.parse(shopRow.body);
          if (!shop.published) return [];
          const quantities = clean(shop, saved.quantities),
            units = Object.values(quantities).reduce((a, b) => a + b, 0);
          if (!units) return [];
          const total = shop.published.products.reduce(
            (n: number, p: any) =>
              n + Math.round(Number(p.price) * 100) * (quantities[p.sku] || 0),
            0,
          );
          return [
            {
              slug: row.slug,
              name: shop.published.name,
              units,
              total,
              state: shop.state,
            },
          ];
        }),
      );
    }),
  );
  router.get(
    "/my-orders",
    wrap((_req: any, res: any) => {
      const user = userFor(db, res.locals.session);
      if (!user) fail("Sign in to see your purchases.", 401);
      const rows = db
        .prepare(
          "SELECT id,incident,state,fulfillment,amount,refunded,token,body FROM rc_orders WHERE buyer=? ORDER BY rowid DESC",
        )
        .all(user.id) as any[];
      res.json(
        rows.map(({ token, body, ...o }) => ({
          ...o,
          shopName: incident(db, o.incident).name,
          receiptUrl: `/restorecart/receipt/${o.id}?access=${token}`,
        })),
      );
    }),
  );
  function cart(req: any, res: any) {
    const slug = String(req.params.slug),
      row = db
        .prepare("SELECT id FROM rc_incidents WHERE slug=?")
        .get(slug) as any;
    if (!row) fail("Shop not found.", 404);
    const shop = incident(db, row.id);
    if (!shop.published || !["live", "closing", "closed"].includes(shop.state))
      fail("Shop not found.", 404);
    return { slug, shop, owner: buyerIdentity(db, res.locals.session) };
  }
  function clean(shop: any, lines: Record<string, number>) {
    const quantities: Record<string, number> = {};
    for (const p of shop.published.products) {
      if (p.excluded) continue;
      const count = available(
        db,
        shop.id,
        p.sku,
        shop.products.find((v: any) => v.sku === p.sku)?.allocation || 0,
      );
      const q = Math.max(0, Math.min(100, count, Number(lines[p.sku]) || 0));
      if (q > 0) quantities[p.sku] = q;
    }
    return quantities;
  }
  router.get(
    "/shops/:slug/cart",
    wrap((req: any, res: any) => {
      const { slug, shop, owner } = cart(req, res),
        row = db
          .prepare("SELECT body FROM rc_carts WHERE owner=? AND slug=?")
          .get(owner, slug) as any;
      const saved = row
        ? JSON.parse(row.body)
        : { quantities: {}, requestKey: uid("cart") };
      const quantities = clean(shop, saved.quantities);
      res.json({
        ...saved,
        quantities,
        adjusted:
          JSON.stringify(saved.quantities) !== JSON.stringify(quantities),
      });
    }),
  );
  router.put(
    "/shops/:slug/cart",
    wrap((req: any, res: any) => {
      const { slug, shop, owner } = cart(req, res);
      const b = z
        .object({
          quantities: z
            .record(z.string().max(80), z.number().int().min(0).max(100))
            .refine((v) => Object.keys(v).length <= 50),
          requestKey: z.string().min(10).max(100),
        })
        .strict()
        .parse(req.body);
      const quantities = clean(shop, b.quantities);
      db.prepare(
        "INSERT INTO rc_carts VALUES(?,?,?) ON CONFLICT(owner,slug) DO UPDATE SET body=excluded.body",
      ).run(owner, slug, JSON.stringify({ ...b, quantities }));
      res.json({ ...b, quantities });
    }),
  );
}
