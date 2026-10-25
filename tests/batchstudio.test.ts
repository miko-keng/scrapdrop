import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { openStore, grantCapture, id } from "../server/store";
import { registerMarket } from "../server/market/routes";
import { registerProviderProtocol } from "../server/market/protocol";
import { tools } from "../src/market/model";
import { canCompare, comparisonKey } from "../src/market/contracts";
import { sampleImages, renameImages, zip } from "../server/market/files";
import {
  providerOriginAllowed,
  validateImageResult,
} from "../server/market/provider-samples";

test("comparison eligibility follows versioned operation/format declarations, never a fixed tool list or category alone", () => {
  const third = {
    ...tools[0],
    id: "any-provider-id",
    title: "A new provider",
    reference: false,
  };
  assert.ok(canCompare([tools[0], tools[1], third]));
  assert.equal(comparisonKey({ ...third, sampleReady: false }), null);
  assert.equal(comparisonKey({ ...third, inputs: ["image/png"] }), null);
  assert.equal(canCompare([third, tools[2]]), false);
  assert.equal(
    canCompare([third, { ...third, sampleContract: "booking-capacity-v1" }]),
    false,
  );
  assert.equal(canCompare([]), false);
  assert.ok(canCompare([tools[2]]));
});
test("provider output is verified using actual ZIP bytes, not provider-reported checkmarks", () => {
  const input = sampleImages(),
    result = renameImages("map-rename", input, {
      label: "Proof",
      date: "2026-10-25",
      pattern: "{label}_{seq}",
      preserveFolders: true,
      mapping: "",
    });
  const valid = { rows: result.rows, zip: result.zip.toString("base64") };
  assert.equal(validateImageResult(valid, input).checks.bytesPreserved, true);
  assert.throws(() =>
    validateImageResult({ ...valid, rows: result.rows.slice(1) }, input),
  );
  assert.throws(() =>
    validateImageResult(
      {
        ...valid,
        rows: result.rows.map((r) => ({ ...r, newName: "../evil.png" })),
      },
      input,
    ),
  );
  const forged = zip([
    {
      name: result.rows[0].newName,
      bytes: Buffer.from("not the original image"),
    },
    { name: "taskslice-mapping.csv", bytes: Buffer.from(result.mapping) },
  ]);
  assert.throws(() =>
    validateImageResult({ ...valid, zip: forged.toString("base64") }, input),
  );
  assert.throws(() =>
    validateImageResult(
      { ...valid, zip: Buffer.from("not a zip").toString("base64") },
      input,
    ),
  );
  const prior = process.env.PROVIDER_ALLOWED_ORIGINS;
  process.env.PROVIDER_ALLOWED_ORIGINS = "https://approved.example";
  assert.ok(providerOriginAllowed("https://approved.example/app", true));
  assert.equal(
    providerOriginAllowed("https://unapproved.example", true),
    false,
  );
  assert.equal(
    providerOriginAllowed("https://name:secret@approved.example", true),
    false,
  );
  assert.equal(providerOriginAllowed("http://127.0.0.1:4418", true), false);
  if (prior === undefined) delete process.env.PROVIDER_ALLOWED_ORIGINS;
  else process.env.PROVIDER_ALLOWED_ORIGINS = prior;
});

test("BatchStudio end to end: register, real contract checks, automatic comparison, guarded sandbox price, launch, paid use, expiry and revocation", async () => {
  const db = openStore(":memory:"),
    app = express();
  app.use(express.json({ limit: "18mb" }));
  registerProviderProtocol(app, db, () => {});
  app.use((req, res, next) => {
    res.locals.learner = req.headers["x-test-learner"] || "anonymous";
    next();
  });
  registerMarket(app, db, {
    origin: "http://127.0.0.1",
    production: false,
    demo: false,
    limit: () => {},
    createOrder: async (account, tool, key) => {
      const old = db
        .prepare("SELECT * FROM orders WHERE learner=? AND request_key=?")
        .get(account, key) as any;
      if (old) return { id: old.id, amount: old.amount };
      const orderId = id("order");
      db.prepare(
        "INSERT INTO orders VALUES(?,?,?,?,'awaiting_buyer',NULL,?,?,?,?)",
      ).run(
        orderId,
        account,
        `market:${tool.id}`,
        tool.id,
        key,
        tool.price,
        JSON.stringify({
          title: tool.title,
          merchantId: "fixture-seller",
          version: tool.version,
        }),
        new Date().toISOString(),
      );
      return { id: orderId, amount: tool.price };
    },
  });
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status || 400).json({ error: err.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const dir = await mkdtemp(tmpdir() + "/batchstudio-test-");
  const origin = "http://127.0.0.1:4451";
  let child: ReturnType<typeof spawn> | undefined;
  const keys = [
    "PROVIDER_ALLOWED_ORIGINS",
    "TASKSLICE_REFERENCE_OWNER_ACCOUNT_ID",
    "TASKSLICE_DEMO_PROVIDER_ID",
    "PROVIDER_REFERENCE_ORIGIN",
  ];
  const prior = keys.map((key) => process.env[key]);
  async function call(learner: string, path: string, body?: any) {
    const r = await fetch(base + "/api/market" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-learner": learner,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, data: await r.json() };
  }
  let cookie = "",
    csrf = "";
  async function provider(path: string, body?: any) {
    const r = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie")!.split(";")[0];
    const data = r.headers.get("content-type")?.includes("json")
      ? await r.json()
      : Buffer.from(await r.arrayBuffer());
    if (data.csrf) csrf = data.csrf;
    return { status: r.status, data };
  }
  try {
    const signed = await call("owner-guest", "/auth/register", {
      name: "Demo Owner",
      email: "demo.owner@example.test",
      password: "SyntheticOwnerPassword123",
    });
    assert.equal(signed.status, 200);
    const account = signed.data.account.id,
      learner = (
        db
          .prepare("SELECT learner FROM market_bindings WHERE account=?")
          .get(account) as any
      ).learner;
    const declaration = {
      title: "BatchStudio Demo",
      description:
        "A separately hosted demo for renaming and delivering JPEG and PNG files.",
      appUrl: origin,
      previewUrl: origin,
      family: "batch-file-renaming",
      capabilities: [
        "filename-pattern",
        "folder-preservation",
        "csv-mapping",
        "preserve-file-bytes",
      ],
      inputs: ["image/jpeg", "image/png"],
      outputs: ["application/zip", "text/csv"],
      sampleContract: "image-rename-v1",
    };
    // Local development approves a loopback provider explicitly; production requires HTTPS.
    process.env.PROVIDER_REFERENCE_ORIGIN = origin;
    const created = await call(learner, "/providers", declaration);
    assert.equal(created.status, 200);
    const providerId = created.data.id,
      key = created.data.credential;
    child = spawn(
      process.execPath,
      ["--import", "tsx", "examples/batchstudio/server.ts"],
      {
        env: {
          ...process.env,
          PORT: "4451",
          HOST: "127.0.0.1",
          BATCHSTUDIO_URL: origin,
          BATCHSTUDIO_DB_PATH: dir + "/provider.sqlite",
          TASKSLICE_URL: base,
          TASKSLICE_PROVIDER_ID: providerId,
          TASKSLICE_PROVIDER_KEY: key,
        },
        stdio: "ignore",
      },
    );
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        ready = (await fetch(origin + "/api/health")).ok;
        if (ready) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, "separate provider process starts");
    await call(learner, `/providers/${providerId}/publish`, {});
    assert.equal(
      (await call(learner, "/tools")).data.find((t: any) => t.id === providerId)
        .sampleReady,
      false,
    );
    assert.equal(
      (
        await call(learner, "/trials", {
          toolIds: ["pattern-rename", providerId],
          sample: true,
        })
      ).status,
      400,
    );
    const checks = await call(learner, `/providers/${providerId}/test`, {});
    assert.equal(checks.status, 200);
    assert.equal(checks.data.passed, true, JSON.stringify(checks.data));
    assert.equal(checks.data.checks.length, 7);
    const savedAgain = await call(
      learner,
      `/providers/${providerId}/save`,
      declaration,
    );
    assert.equal(savedAgain.status, 200);
    const afterSave = db
      .prepare("SELECT checked_hash,checks FROM market_providers WHERE id=?")
      .get(providerId) as any;
    assert.equal(afterSave.checked_hash, null);
    assert.equal(afterSave.checks, null);
    const checkedAgain = await call(
      learner,
      `/providers/${providerId}/test`,
      {},
    );
    assert.equal(checkedAgain.data.passed, true);
    await call(learner, `/providers/${providerId}/publish`, {});
    let listing = (await call(learner, "/tools")).data.find(
      (t: any) => t.id === providerId,
    );
    assert.equal(listing.sampleReady, true);
    assert.equal(listing.purchasable, false);
    const buyerSigned = await call("buyer-guest", "/auth/register", {
      name: "Demo Buyer",
      email: "demo.buyer@example.test",
      password: "SyntheticBuyerPassword123",
    });
    const buyerAccount = buyerSigned.data.account.id,
      buyer = (
        db
          .prepare("SELECT learner FROM market_bindings WHERE account=?")
          .get(buyerAccount) as any
      ).learner;
    const compared = await call(buyer, "/trials", {
      toolIds: ["pattern-rename", "map-rename", providerId],
      sample: true,
      label: "Shared",
      date: "2026-10-25",
    });
    assert.equal(compared.status, 200);
    assert.equal(compared.data.results.length, 3);
    const remote = compared.data.results.find(
      (r: any) => r.toolId === providerId,
    );
    assert.equal(remote.status, "succeeded");
    assert.ok(remote.rows[0].newName.startsWith("camera/"));
    assert.equal(remote.checks.bytesPreserved, true);
    const adaptation = await call(buyer, "/adaptations", {
      toolId: providerId,
      request:
        "Please support a custom sequence start number for the attached batch.",
      sampleJobId: remote.id,
    });
    assert.equal(adaptation.status, 200);
    assert.equal(
      (await call(learner, "/builder")).data.requests[0].id,
      adaptation.data.id,
    );
    assert.equal(
      (
        await call(buyer, `/adaptations/${adaptation.data.id}/respond`, {
          response: "Buyer cannot answer as provider.",
        })
      ).status,
      404,
    );
    assert.equal(
      (await call(learner, `/adaptations/${adaptation.data.id}/sample`, {}))
        .data.rows[0].newName,
      remote.rows[0].newName,
    );
    assert.equal(
      (
        await call(learner, `/adaptations/${adaptation.data.id}/respond`, {
          response:
            "I can discuss that change. The current sample has been reproduced.",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(buyer, `/tools/${providerId}/order`, {
          requestKey: randomUUID(),
          amount: 1,
        })
      ).status,
      409,
    );
    process.env.TASKSLICE_REFERENCE_OWNER_ACCOUNT_ID = account;
    process.env.TASKSLICE_DEMO_PROVIDER_ID = providerId;
    listing = (await call(buyer, "/tools")).data.find(
      (t: any) => t.id === providerId,
    );
    assert.equal(listing.operatorOwned, true);
    assert.equal(listing.purchasable, true);
    assert.equal(listing.price, 600);
    await provider("/api/session");
    const four = [
      ...sampleImages(),
      { ...sampleImages()[0], name: "extra.png" },
    ];
    const processInput = {
      requestKey: randomUUID(),
      sample: false,
      files: four,
      options: {
        label: "Paid",
        date: "2026-10-25",
        pattern: "{label}_{seq}",
        preserveFolders: true,
        mapping: "",
      },
    };
    assert.equal((await provider("/api/process", processInput)).status, 403);
    assert.equal(
      (await call(buyer, `/tools/${providerId}/launch`, {})).status,
      403,
    );
    const requestKey = randomUUID(),
      order = await call(buyer, `/tools/${providerId}/order`, {
        requestKey,
        amount: 1,
      });
    assert.equal(order.status, 200);
    assert.equal(order.data.amount, 600);
    assert.equal(
      (await call(buyer, `/tools/${providerId}/order`, { requestKey })).data.id,
      order.data.id,
    );
    const stored = db
      .prepare("SELECT * FROM orders WHERE id=?")
      .get(order.data.id) as any;
    const observation = {
      id: "FIXTURE_CAPTURE",
      status: "COMPLETED",
      amount: "6.00",
      currency: "USD",
      merchant: "fixture-seller",
    };
    assert.throws(() =>
      grantCapture(
        db,
        stored,
        { ...observation, amount: "0.01" },
        "fixture-seller",
      ),
    );
    assert.throws(() =>
      grantCapture(
        db,
        stored,
        { ...observation, currency: "EUR" },
        "fixture-seller",
      ),
    );
    assert.throws(() =>
      grantCapture(
        db,
        stored,
        { ...observation, merchant: "other-seller" },
        "fixture-seller",
      ),
    );
    assert.throws(() =>
      grantCapture(
        db,
        stored,
        { ...observation, status: "PENDING" },
        "fixture-seller",
      ),
    );
    grantCapture(db, stored, observation, "fixture-seller");
    grantCapture(db, stored, observation, "fixture-seller");
    assert.equal(
      (
        db
          .prepare("SELECT count(*) n FROM grants WHERE order_id=?")
          .get(stored.id) as any
      ).n,
      1,
    );
    const launch = await call(buyer, `/tools/${providerId}/launch`, {});
    assert.equal(launch.status, 200);
    assert.equal(new URL(launch.data.url).origin, origin);
    const other = await call(learner, "/providers", {
      ...declaration,
      title: "Other scoped provider",
    });
    const code = new URL(launch.data.url).searchParams.get("code");
    assert.equal(
      (
        await fetch(base + "/api/market/provider/exchange", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + other.data.credential,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code }),
        })
      ).status,
      403,
    );
    const opened = await fetch(launch.data.url, { redirect: "manual" });
    assert.equal(opened.status, 302);
    assert.equal(opened.headers.get("location"), "/");
    cookie = opened.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await fetch(launch.data.url, { redirect: "manual" })).status,
      403,
    );
    assert.equal((await provider("/api/session")).data.paid, true);
    const paid = await provider("/api/process", processInput);
    assert.equal(paid.status, 200);
    assert.equal(paid.data.rows.length, 4);
    assert.equal(
      (await provider("/api/process", processInput)).data.repeated,
      true,
    );
    assert.equal(
      (
        await provider("/api/process", {
          ...processInput,
          options: { ...processInput.options, label: "Changed" },
        })
      ).status,
      409,
    );
    assert.equal((await provider(paid.data.download)).status, 200);
    assert.equal((await fetch(origin + paid.data.download)).status, 404);
    assert.equal(
      (
        await fetch(origin + "/api/process", {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: origin,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(processInput),
        })
      ).status,
      403,
    );
    assert.equal(
      JSON.stringify((await provider("/taskslice/manifest")).data).includes(
        key,
      ),
      false,
    );
    db.prepare("UPDATE market_provider_sessions SET expires=0").run();
    assert.equal(
      (
        await provider("/api/process", {
          ...processInput,
          requestKey: randomUUID(),
        })
      ).status,
      403,
    );
    db.prepare("UPDATE market_provider_sessions SET expires=?").run(
      Date.now() + 60000,
    );
    db.prepare(
      "UPDATE market_entitlements SET expires=0 WHERE account=? AND tool=?",
    ).run(buyerAccount, providerId);
    assert.equal(
      (await call(buyer, `/tools/${providerId}/launch`, {})).status,
      403,
    );
    assert.equal((await provider(paid.data.download)).status, 403);
    db.prepare(
      "UPDATE market_entitlements SET expires=? WHERE account=? AND tool=?",
    ).run(Date.now() + 60000, buyerAccount, providerId);
    db.prepare("UPDATE grants SET active=0 WHERE order_id=?").run(stored.id);
    assert.equal(
      (
        await provider("/api/process", {
          ...processInput,
          requestKey: randomUUID(),
        })
      ).status,
      403,
    );
    assert.equal((await provider(paid.data.download)).status, 403);
    assert.equal((await provider("/api/session")).data.paid, false);
    assert.equal(
      (
        await provider("/api/process", {
          sample: true,
          requestKey: randomUUID(),
          options: processInput.options,
        })
      ).status,
      200,
    );
    child.kill("SIGTERM");
    await new Promise<void>((r) =>
      child!.exitCode !== null ? r() : child!.once("exit", () => r()),
    );
    child = undefined;
    const unavailable = await call(buyer, "/trials", {
      toolIds: ["pattern-rename", providerId],
      sample: true,
      label: "Unavailable provider",
    });
    assert.equal(unavailable.status, 200);
    assert.equal(unavailable.data.results[0].status, "succeeded");
    assert.equal(unavailable.data.results[1].status, "failed");
    assert.equal(unavailable.data.results[1].artifacts.length, 0);
  } finally {
    child?.kill("SIGTERM");
    if (child)
      await new Promise<void>((r) =>
        child!.exitCode !== null ? r() : child!.once("exit", () => r()),
      );
    keys.forEach((key, i) => {
      if (prior[i] === undefined) delete process.env[key];
      else process.env[key] = prior[i];
    });
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
