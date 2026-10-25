import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { openStore } from "../server/store";
import { registerMarket } from "../server/market/routes";
import { initMarket } from "../server/market/store";
import { sampleImages } from "../server/market/files";

test("request bridge: attached samples are owner-scoped, reproducible, retained and routed to the configured reference owner", async () => {
  const db = openStore(":memory:"),
    app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.learner = req.headers["x-test-learner"] || "guest";
    next();
  });
  registerMarket(app, db, {
    origin: "http://127.0.0.1",
    production: false,
    demo: false,
    limit: () => {},
    createOrder: async () => {
      throw new Error("No checkout in this test");
    },
  });
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status || 400).json({ error: err.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/market`;
  const priorOwner = process.env.TASKSLICE_REFERENCE_OWNER_ACCOUNT_ID;
  async function call(learner: string, path: string, body?: any) {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-learner": learner,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  }
  async function register(name: string) {
    const signed = await call(name, "/auth/register", {
      name,
      email: name.toLowerCase().replaceAll(" ", ".") + "@example.test",
      password: "SyntheticFlowPassword123",
    });
    assert.equal(signed.status, 200);
    const account = signed.data.account.id;
    return {
      account,
      learner: (
        db
          .prepare("SELECT learner FROM market_bindings WHERE account=?")
          .get(account) as any
      ).learner,
    };
  }
  try {
    const buyer = await register("Buyer Example"),
      builder = await register("Builder Example"),
      stranger = await register("Other Account");
    process.env.TASKSLICE_REFERENCE_OWNER_ACCOUNT_ID = builder.account;
    const run = await call(buyer.learner, "/trials", {
      toolIds: ["pattern-rename"],
      sample: true,
      label: "Wedding",
      date: "2026-10-25",
      pattern: "{label}_{date}_{seq}",
      preserveFolders: true,
    });
    assert.equal(run.status, 200);
    let job = run.data.results[0];
    // Cached jobs created before sample metadata existed must be recomputed once.
    const legacyJob = { ...job };
    delete legacyJob.sampleInput;
    db.prepare("UPDATE market_jobs SET body=? WHERE id=?").run(
      JSON.stringify(legacyJob),
      job.id,
    );
    const refreshed = await call(buyer.learner, "/trials", {
      toolIds: ["pattern-rename"],
      sample: true,
      label: "Wedding",
      date: "2026-10-25",
      pattern: "{label}_{date}_{seq}",
      preserveFolders: true,
    });
    assert.notEqual(refreshed.data.results[0].id, job.id);
    assert.equal(
      refreshed.data.results[0].sampleInput.source,
      "bundled-images",
    );
    job = refreshed.data.results[0];
    const input = {
      toolId: "pattern-rename",
      request:
        "Please keep camera/ and portraits/ folders in the delivered ZIP.",
      sampleJobId: job.id,
    };
    assert.equal(
      (await call(stranger.learner, "/adaptations", input)).status,
      404,
    );
    assert.equal(
      (
        await call(buyer.learner, "/adaptations", {
          ...input,
          toolId: "map-rename",
        })
      ).status,
      404,
    );
    const saved = await call(buyer.learner, "/adaptations", input);
    assert.equal(saved.status, 200);
    assert.equal(saved.data.delivery, "builder-inbox");
    const requestId = saved.data.id;
    const inbox = await call(builder.learner, "/builder");
    assert.equal(inbox.data.requests[0].id, requestId);
    assert.equal(
      (await call(stranger.learner, "/builder")).data.requests.length,
      0,
    );
    const snapshot = JSON.parse(inbox.data.requests[0].body).sample;
    assert.equal(snapshot.source, "bundled-images");
    assert.deepEqual(snapshot.rows, job.rows);
    assert.equal(snapshot.options.pattern, "{label}_{date}_{seq}");
    assert.equal(snapshot.artifacts, undefined);
    assert.equal(snapshot.files, undefined);
    const replay = await call(
      builder.learner,
      `/adaptations/${requestId}/sample`,
      {},
    );
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.data.rows, job.rows);
    assert.equal(
      (await call(stranger.learner, `/adaptations/${requestId}/sample`, {}))
        .status,
      404,
    );
    const alternative = await call(
      buyer.learner,
      `/adaptations/${requestId}/sample`,
      { alternative: "map-rename" },
    );
    assert.equal(alternative.status, 200);
    assert.ok(alternative.data.rows[0].newName.startsWith("camera/"));
    assert.ok(!replay.data.rows[0].newName.includes("/"));
    assert.equal(
      (
        await call(buyer.learner, `/adaptations/${requestId}/respond`, {
          response: "I should not be allowed to respond to myself.",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await call(builder.learner, `/adaptations/${requestId}/respond`, {
          response:
            "Map Rename already supports this. Please try the same sample there.",
        })
      ).status,
      200,
    );
    assert.equal(
      (await call(buyer.learner, "/adaptations")).data[0].status,
      "responded",
    );
    const uploads = await call(buyer.learner, "/trials", {
      toolIds: ["pattern-rename"],
      sample: false,
      files: sampleImages(),
    });
    assert.equal(uploads.status, 200);
    assert.equal(
      (
        await call(buyer.learner, "/adaptations", {
          ...input,
          sampleJobId: uploads.data.results[0].id,
        })
      ).status,
      400,
    );
    db.prepare("UPDATE market_jobs SET expires=0 WHERE id=?").run(job.id);
    assert.equal(
      (await call(buyer.learner, "/adaptations", input)).status,
      404,
    );
    assert.equal(
      (await call(builder.learner, `/adaptations/${requestId}/sample`, {}))
        .status,
      200,
    );
    delete process.env.TASKSLICE_REFERENCE_OWNER_ACCOUNT_ID;
    assert.equal(
      (await call(builder.learner, "/builder")).data.requests.length,
      0,
    );
    assert.equal(
      (
        await call(builder.learner, `/adaptations/${requestId}/respond`, {
          response: "Ownership must not stick after configuration changes.",
        })
      ).status,
      404,
    );
    const pending = await call(buyer.learner, "/adaptations", {
      toolId: "pattern-rename",
      request: "Another reference request awaiting the site owner.",
    });
    assert.equal(pending.data.delivery, "awaiting-owner-setup");
  } finally {
    if (priorOwner === undefined)
      delete process.env.TASKSLICE_REFERENCE_OWNER_ACCOUNT_ID;
    else process.env.TASKSLICE_REFERENCE_OWNER_ACCOUNT_ID = priorOwner;
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  }
});

test("guided example: real private request/reply, idempotent start, no paid access or publishable pretend provider", async () => {
  const db = openStore(":memory:"),
    app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.learner = req.headers["x-test-learner"] || "guest";
    next();
  });
  registerMarket(app, db, {
    origin: "http://127.0.0.1",
    production: false,
    demo: false,
    limit: () => {},
    createOrder: async () => {
      throw new Error("Unexpected payment");
    },
  });
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status || 400).json({ error: err.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/market`;
  async function call(learner: string, path: string, body?: any) {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-learner": learner,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  }
  try {
    const signed = await call("guest", "/auth/register", {
      name: "Example User",
      email: "guided@example.test",
      password: "SyntheticGuidedPassword123",
    });
    const account = signed.data.account.id,
      learner = (
        db
          .prepare("SELECT learner FROM market_bindings WHERE account=?")
          .get(account) as any
      ).learner;
    const run = await call(learner, "/trials", {
      toolIds: ["pattern-rename"],
      sample: true,
    });
    const input = { sampleJobId: run.data.results[0].id };
    assert.equal((await call("other", "/example", input)).status, 401);
    const created = await call(learner, "/example", input);
    assert.equal(created.status, 200);
    const record = created.data.request;
    assert.equal(JSON.parse(record.body).guidedDemo, true);
    assert.equal(
      (await call(learner, "/example", input)).data.request.id,
      record.id,
    );
    assert.equal((await call("other", "/example")).data.request, null);
    assert.equal(
      (await call(learner, "/tools")).data.some(
        (t: any) => t.id === record.provider,
      ),
      false,
    );
    assert.equal((await call(learner, "/builder")).data.providers.length, 0);
    assert.equal(
      (await call(learner, `/providers/${record.provider}/publish`, {})).status,
      409,
    );
    assert.equal(
      (db.prepare("SELECT count(*) n FROM grants").get() as any).n,
      0,
    );
    assert.equal(
      (await call("other", `/adaptations/${record.id}/sample`, {})).status,
      401,
    );
    assert.equal(
      (
        await call(learner, `/adaptations/${record.id}/respond`, {
          response:
            "Try Map Rename for folder preservation. No feature was automatically built.",
        })
      ).status,
      200,
    );
    assert.equal(
      (await call(learner, "/example")).data.request.status,
      "responded",
    );
    assert.equal(
      (
        await call(learner, `/adaptations/${record.id}/sample`, {
          alternative: "map-rename",
        })
      ).data.toolId,
      "map-rename",
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  }
});

test("request migration: earlier unassigned reference requests acquire an inbox route without changing buyer", () => {
  const db = openStore(":memory:");
  initMarket(db);
  db.prepare(
    "INSERT INTO market_requests VALUES('old','buyer','pattern-rename',NULL,'{}',NULL,'open',0)",
  ).run();
  initMarket(db);
  const row = db
    .prepare("SELECT * FROM market_requests WHERE id='old'")
    .get() as any;
  assert.equal(row.provider, "reference:pattern-rename");
  assert.equal(row.buyer, "buyer");
  initMarket(db);
  assert.equal(
    (db.prepare("SELECT count(*) n FROM market_requests").get() as any).n,
    1,
  );
  db.close();
});
