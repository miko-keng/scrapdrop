/** Full application HTTP journeys. Real cookies/CSRF/SQLite; no provider traffic. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { openStore } from "../server/store";
import { initMarket, hashPassword } from "../server/market/store";
import { initScrap } from "../server/scrapdrop/store";
import { exampleJob } from "../src/scrapdrop/manufacturing/engine";

test("production full-server E2E campaign", { timeout: 90000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "scrapdrop-production-http-"));
  const path = join(dir, "test.sqlite");
  const db = openStore(path);
  initMarket(db);
  initScrap(db);
  for (const who of ["maker", "operator", "other"])
    db.prepare("INSERT INTO market_accounts VALUES(?,?,?,?,?)").run(
      who,
      `${who}@scrapdrop.test`,
      who,
      hashPassword("MakeSomething123!"),
      Date.now(),
    );
  db.close();
  const socket = createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = (socket.address() as any).port;
  await new Promise<void>((r) => socket.close(() => r()));
  const base = `http://127.0.0.1:${port}`;
  let child: ChildProcess;
  let output = "";
  async function start() {
    child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        APP_MODE: "demo",
        ALLOW_HOSTED_DEMO: "true",
        PORT: String(port),
        HOST: "127.0.0.1",
        APP_BASE_URL: base,
        DB_PATH: path,
        AI_MODE: "fixture",
        GEMINI_API_KEY: "",
        PAYPAL_CLIENT_ID: "",
        PAYPAL_CLIENT_SECRET: "",
        SCRAPDROP_OPERATOR_ACCOUNT_ID: "operator",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (b) => (output += b));
    child.stderr?.on("data", (b) => (output += b));
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + "/api/config")).ok) return;
      } catch {}
      if (child.exitCode !== null) throw Error(output);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("Server did not start: " + output);
  }
  async function stop() {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  }
  class Client {
    cookie = "";
    csrf = "";
    async request(
      path: string,
      body?: unknown,
      method = body === undefined ? "GET" : "POST",
      overrides: Record<string, string> = {},
    ) {
      const res = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: base,
          Cookie: this.cookie,
          "X-CSRF-Token": this.csrf,
          ...overrides,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const cookie = res.headers.get("set-cookie");
      if (cookie) this.cookie = cookie.split(";")[0];
      const data = await res.json();
      if (data.csrf) this.csrf = data.csrf;
      return { status: res.status, data };
    }
    async ok(path: string, body?: unknown, method?: string) {
      const r = await this.request(path, body, method);
      assert.equal(r.status, 200, JSON.stringify(r.data));
      return r.data;
    }
    async login(who: string) {
      await this.ok("/api/config");
      await this.ok("/api/market/auth/login", {
        email: `${who}@scrapdrop.test`,
        password: "MakeSomething123!",
      });
    }
  }
  const maker = new Client(),
    operator = new Client(),
    other = new Client(),
    guest = new Client();
  const m = "/api/scrapdrop/manufacturing";
  let job: any, order: any, finalBody: any;
  const complete = (j: any) => ({
    revision: j.revision,
    products: j.plan.input.products.map((p: any) => ({
      id: p.id,
      good: p.quantity,
      spoiled: 0,
    })),
    minutes: j.plan.minutes + 5,
    sellingPrice: 300,
    laborRate: 1200,
    ownedCost: 500,
    consumables: 50,
    fees: 0,
    offcuts: [],
  });
  async function save(input: any) {
    const shelf = await maker.ok("/api/scrapdrop/owned");
    const updated = await maker.ok(
      "/api/scrapdrop/owned",
      { revision: shelf.revision, materials: input.owned },
      "PUT",
    );
    return maker.ok(m + "/jobs", {
      ...input,
      owned: updated.materials,
      ownedRevision: updated.revision,
    });
  }
  try {
    await start();
    await t.test("session, CSRF, origin and anonymous boundaries", async () => {
      await guest.ok("/api/config");
      assert.equal(
        (
          await guest.request(m + "/plan", exampleJob(), "POST", {
            "X-CSRF-Token": "",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await guest.request(m + "/plan", exampleJob(), "POST", {
            Origin: "https://foreign.example",
          })
        ).status,
        403,
      );
      assert.equal((await guest.ok(m + "/plan", exampleJob())).ready, true);
      assert.equal(
        (await guest.request(m + "/jobs", exampleJob())).status,
        401,
      );
      await Promise.all([
        maker.login("maker"),
        operator.login("operator"),
        other.login("other"),
      ]);
      assert.equal((await maker.request(m + "/schedule")).status, 403);
    });
    await t.test(
      "construction and constraint matrix through the HTTP validator",
      async () => {
        const input = exampleJob(),
          p = await maker.ok(m + "/plan", input);
        assert.equal(p.usedOwned, 4);
        assert.equal(p.usedShop, 1);
        assert.equal(p.total, 170);
        assert.equal(p.sheets.flatMap((s: any) => s.placements).length, 48);
        for (const family of ["flat", "folded", "sleeve"])
          for (const quantity of [1, 7, 40])
            for (const width of [20, 95, 400]) {
              const x = await maker.ok(m + "/plan", {
                ...input,
                products: [{ ...input.products[0], family, quantity, width }],
              });
              assert.equal(
                x.sheets.flatMap((s: any) => s.placements).length +
                  x.unplaced.length,
                quantity,
              );
              assert.equal(x.ready, x.violations.length === 0);
              assert.equal(
                x.total,
                x.lines.reduce((n: number, l: any) => n + l.total, 0),
              );
            }
        // Material compatibility must never silently treat fabric or a thinner card as stock.
        for (const owned of [
          [],
          [{ ...input.owned[0], type: "fabric" }],
          [{ ...input.owned[0], thickness: 0.5 }],
        ]) {
          const x = await maker.ok(m + "/plan", { ...input, owned });
          assert.equal(x.usedOwned, 0);
          assert.ok(x.usedShop > 0);
        }
        const mixed = await maker.ok(m + "/plan", {
          ...input,
          owned: [
            {
              ...input.owned[0],
              id: "a",
              width: 160,
              length: 240,
              quantity: 2,
            },
            {
              ...input.owned[0],
              id: "b",
              width: 300,
              length: 420,
              quantity: 2,
              color: "#ded3b6",
            },
          ],
        });
        assert.equal(
          mixed.sheets.flatMap((s: any) => s.placements).length +
            mixed.unplaced.length,
          48,
        );
        for (const family of ["flat", "folded", "sleeve"]) {
          const x = await maker.ok(m + "/plan", {
            ...input,
            products: [
              {
                ...input.products[0],
                family,
                width: 65,
                length: 75,
                depth: 25,
                quantity: 3,
              },
            ],
          });
          assert.equal(x.recipes[0].product.length, 75);
          assert.equal(x.recipes[0].product.depth, 25);
          assert.equal(
            x.sheets.flatMap((s: any) => s.placements).length +
              x.unplaced.length,
            3,
          );
        }
        for (const patch of [
          { budget: 0 },
          { availableMinutes: 1 },
          { tools: ["scissors", "ruler"] },
          { thickness: 1.5 },
          { mixColors: false, color: "#000000" },
        ])
          assert.equal(
            (await maker.ok(m + "/plan", { ...input, ...patch })).ready,
            false,
          );
        for (const patch of [
          { products: [{ ...input.products[0], quantity: 0 }] },
          { products: [{ ...input.products[0], width: -10 }] },
          { budget: -1 },
          { products: [{ ...input.products[0], family: "chair" }] },
        ])
          assert.equal(
            (await maker.request(m + "/plan", { ...input, ...patch })).status,
            400,
          );
        const fit = {
          ...input,
          owned: [{ ...input.owned[0], width: 64, length: 44, quantity: 1 }],
          products: [
            { ...input.products[1], width: 40, length: 60, quantity: 1 },
          ],
          mixColors: false,
          rotate: true,
        };
        assert.equal((await maker.ok(m + "/plan", fit)).usedOwned, 1);
        assert.equal(
          (await maker.ok(m + "/plan", { ...fit, rotate: false })).usedOwned,
          0,
        );
      },
    );
    await t.test(
      "frozen saves, stale progress and cross-account isolation",
      async () => {
        job = await save(exampleJob());
        assert.equal((await other.request(m + "/jobs/" + job.id)).status, 404);
        assert.deepEqual(await other.ok(m + "/jobs"), []);
        const next = await maker.ok(
          m + `/jobs/${job.id}/progress`,
          { revision: 0, product: 2, step: 3 },
          "PUT",
        );
        assert.deepEqual(next.plan, job.plan);
        job = next;
        assert.equal(
          (
            await maker.request(
              m + `/jobs/${job.id}/progress`,
              { revision: 0, product: 0, step: 0 },
              "PUT",
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await maker.request(
              m + `/jobs/${job.id}/progress`,
              { revision: 1, product: 100, step: 0 },
              "PUT",
            )
          ).status,
          400,
        );
        assert.equal(
          (await maker.request(m + "/jobs", { ...job.plan.input, budget: 0 }))
            .status,
          409,
        );
      },
    );
    await t.test(
      "fixture planning and step help use scoped caches",
      async () => {
        const payload = {
          job: job.plan.input,
          text: "Make a phone stand without glue",
        };
        const a = await maker.ok(m + "/agent", payload),
          b = await maker.ok(m + "/agent", payload);
        assert.equal(a.source, "fixture");
        assert.equal(b.cached, true);
        assert.ok(a.trace.length);
        const q = {
          product: 2,
          step: 3,
          question: "Explain this fold and its measurements",
        };
        const help = await maker.ok(m + `/jobs/${job.id}/explain`, q);
        assert.equal(help.source, "fixture");
        assert.equal(
          (await maker.ok(m + `/jobs/${job.id}/explain`, q)).cached,
          true,
        );
        assert.equal(
          (await other.request(m + `/jobs/${job.id}/explain`, q)).status,
          404,
        );
      },
    );
    await t.test(
      "exact shortfall, acknowledgement, idempotent payment and collection gates",
      async () => {
        const shop = await maker.ok("/api/scrapdrop/shop");
        const quote = await maker.ok(m + `/jobs/${job.id}/quote`, {
          pickupSlotId: shop.pickupSlots[0].id,
        });
        assert.equal(quote.kit.total, 170);
        assert.equal(
          (
            await maker.request("/api/scrapdrop/demo-order", {
              quoteId: quote.id,
              requestKey: "production-payment-1",
              toolsConfirmed: false,
            })
          ).status,
          400,
        );
        const pay = {
          quoteId: quote.id,
          requestKey: "production-payment-1",
          toolsConfirmed: true,
        };
        order = await maker.ok("/api/scrapdrop/demo-order", pay);
        assert.equal(order.payment, "paid");
        assert.equal(order.source, "demo");
        assert.equal(
          (await maker.ok("/api/scrapdrop/demo-order", pay)).id,
          order.id,
        );
        assert.equal(
          (await other.request("/api/scrapdrop/orders/" + order.id)).status,
          404,
        );
        assert.equal(
          (
            await maker.request(m + `/jobs/${job.id}/quote`, {
              pickupSlotId: shop.pickupSlots[0].id,
            })
          ).status,
          409,
        );
        const instructions = await maker.ok(
          `/api/scrapdrop/orders/${order.id}/instructions`,
        );
        assert.ok(instructions.steps.length > 3);
        assert.equal(
          (await maker.request(m + `/jobs/${job.id}/results`, complete(job)))
            .status,
          409,
        );
        assert.equal(
          (
            await maker.request(
              `/api/scrapdrop/operator/orders/${order.id}/ready`,
              {},
            )
          ).status,
          403,
        );
        await operator.ok(
          `/api/scrapdrop/operator/orders/${order.id}/ready`,
          {},
        );
        order = await maker.ok("/api/scrapdrop/orders/" + order.id);
        assert.ok(order.pickupCode);
        await operator.ok("/api/scrapdrop/operator/pickups/redeem", {
          code: order.pickupCode,
        });
        assert.equal(
          (
            await operator.request("/api/scrapdrop/operator/pickups/redeem", {
              code: order.pickupCode,
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "atomic results, invalid offcuts, economics and exactly-once consumption",
      async () => {
        const before = await maker.ok("/api/scrapdrop/owned");
        finalBody = complete(job);
        assert.equal(
          (
            await maker.request(m + `/jobs/${job.id}/results`, {
              ...finalBody,
              products: finalBody.products.map((p: any) => ({ ...p, good: 0 })),
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await maker.request(m + `/jobs/${job.id}/results`, {
              ...finalBody,
              offcuts: [
                { sheetId: job.plan.sheets[0].id, width: 3000, length: 3000 },
              ],
            })
          ).status,
          400,
        );
        assert.deepEqual(await maker.ok("/api/scrapdrop/owned"), before);
        const done = await maker.ok(m + `/jobs/${job.id}/results`, finalBody);
        assert.equal(done.results.good, 48);
        assert.equal(
          done.results.contribution,
          48 * 300 -
            (170 + 500 + 50 + Math.round((finalBody.minutes * 1200) / 60)),
        );
        const shelf = await maker.ok("/api/scrapdrop/owned");
        assert.equal(shelf.materials[0].quantity, 0);
        await maker.ok(m + `/jobs/${job.id}/results`, finalBody);
        assert.deepEqual(await maker.ok("/api/scrapdrop/owned"), shelf);
        assert.equal(
          (
            await maker.request(m + `/jobs/${job.id}/results`, {
              ...finalBody,
              minutes: 1,
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "owned-only, zero-good production and reusable offcut",
      async () => {
        const input = exampleJob();
        input.title = "Owned-only tag";
        input.products = [{ ...input.products[1], quantity: 1 }];
        input.owned[0].quantity = 1;
        const j = await save(input);
        assert.equal(j.plan.total, 0);
        const b = complete(j);
        b.products = [{ id: input.products[0].id, good: 0, spoiled: 1 }];
        const free = j.plan.sheets[0].remaining.find(
          (r: any) => r.width >= 10 && r.length >= 10,
        );
        b.offcuts = [
          {
            sheetId: j.plan.sheets[0].id,
            width: Math.floor(free.width),
            length: Math.floor(free.length),
          },
        ] as any;
        const r = await maker.ok(m + `/jobs/${j.id}/results`, b);
        assert.equal(r.results.revenue, 0);
        assert.ok(r.results.contribution < 0);
        assert.equal(
          (await maker.ok("/api/scrapdrop/owned")).materials.length,
          2,
        );
        const rows = await maker.ok(m + "/analytics");
        assert.ok(rows.every((r: any) => r.status === "Demo result"));
        const help = await maker.ok(m + "/analytics/explain", {
          question: "Which production jobs overran their time?",
        });
        assert.equal(help.source, "fixture");
      },
    );
    await t.test("operator schedule persistence and validation", async () => {
      const intervals = job.plan.schedule.map((s: any) => ({
        id: s.id,
        start: s.start,
        end: s.end,
      }));
      const body = {
        revision: 0,
        date: "2026-10-27",
        jobs: [{ id: job.id, intervals }],
      };
      const saved = await operator.ok(m + "/schedule", body, "PUT");
      assert.equal(saved.revision, 1);
      assert.equal(
        (await operator.request(m + "/schedule", body, "PUT")).status,
        409,
      );
      assert.equal(
        (
          await operator.request(
            m + "/schedule",
            { ...body, revision: 1, date: "2026-02-30" },
            "PUT",
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await operator.request(
            m + "/schedule",
            {
              ...body,
              revision: 1,
              jobs: [
                {
                  id: job.id,
                  intervals: intervals.map((s: any) => ({
                    ...s,
                    start: 0,
                    end: s.end - s.start,
                  })),
                },
              ],
            },
            "PUT",
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await operator.request(
            m + "/schedule",
            {
              ...body,
              revision: 1,
              jobs: [
                {
                  id: job.id,
                  intervals: intervals.map((s: any) => ({
                    ...s,
                    id: "unknown",
                  })),
                },
              ],
            },
            "PUT",
          )
        ).status,
        400,
      );
      await operator.ok(
        m + "/schedule",
        { revision: 1, date: "2026-10-27", jobs: [] },
        "PUT",
      );
    });
    await t.test(
      "server restart preserves sessions, recipes, progress, orders and results",
      async () => {
        await stop();
        await start();
        const restored = await maker.ok(m + "/jobs/" + job.id);
        assert.deepEqual(restored.plan, job.plan);
        assert.deepEqual(restored.progress, job.progress);
        assert.equal(restored.results.good, 48);
        assert.equal(
          (await maker.ok("/api/scrapdrop/orders/" + order.id)).fulfillment,
          "collected",
        );
        const schedule = await operator.ok(m + "/schedule");
        assert.equal(schedule.revision, 2);
        assert.deepEqual(schedule.slots, []);
      },
    );
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
