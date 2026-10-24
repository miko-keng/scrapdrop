import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { openStore } from "../server/store";
import {
  initMarket,
  entitlement,
  hashPassword,
  checkPassword,
  reserve,
} from "../server/market/store";
import {
  renameImages,
  sampleImages,
  safePath,
  csv,
  sha,
} from "../server/market/files";
import { interpretRules, matchTools, tools } from "../src/market/model";
import { interpretProblem, draftCapability } from "../server/market/ai";
import { aiFetch, aiStatus } from "../server/ai-mode";
import { registerMarket } from "../server/market/routes";
import { registerProviderProtocol } from "../server/market/protocol";

const options = {
  label: "Studio",
  date: "2026-10-24",
  preserveFolders: true,
  mapping: "",
};
function unzip(bytes: Buffer) {
  const entries = new Map<string, Buffer>();
  let pos = 0;
  while (bytes.readUInt32LE(pos) === 0x04034b50) {
    const size = bytes.readUInt32LE(pos + 18),
      length = bytes.readUInt16LE(pos + 26),
      extra = bytes.readUInt16LE(pos + 28),
      start = pos + 30 + length + extra;
    entries.set(
      bytes.subarray(pos + 30, pos + 30 + length).toString(),
      bytes.subarray(start, start + size),
    );
    pos = start + size;
  }
  assert.equal(bytes.readUInt32LE(pos), 0x02014b50);
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  return entries;
}
test("market file output: ZIP contains all original bytes and a real mapping CSV", () => {
  const result = renameImages("map-rename", sampleImages(), options),
    entries = unzip(result.zip);
  assert.equal(entries.size, 4);
  for (const [i, row] of result.rows.entries()) {
    assert.ok(row.newName.startsWith(i < 2 ? "camera/" : "portraits/"));
    assert.equal(
      sha(entries.get(row.newName)!),
      sha(Buffer.from(sampleImages()[i].data, "base64")),
    );
  }
  assert.equal(
    entries.get("taskslice-mapping.csv")!.toString(),
    result.mapping,
  );
  assert.equal(result.checks.bytesPreserved, true);
  assert.equal(
    renameImages("pattern-rename", sampleImages(), {
      ...options,
      pattern: "{seq}_{label}",
    }).rows[0].newName,
    "001_Studio.png",
  );
  assert.throws(() =>
    renameImages("pattern-rename", sampleImages(), {
      ...options,
      pattern: "no-sequence",
    }),
  );
  assert.ok(
    !renameImages("pattern-rename", sampleImages(), {
      ...options,
      preserveFolders: false,
    }).rows[0].newName.includes("/"),
  );
});
test("market mapping: collision, traversal, invalid bytes, mismatched MIME/extension rejected; unmatched reported", () => {
  for (const name of [
    "../secret.png",
    "/etc/a.png",
    "a/../b.png",
    "a\\b.png",
    "a//b.png",
  ])
    assert.throws(() => safePath(name));
  for (const change of [
    { data: "abcd" },
    { type: "image/jpeg" },
    { name: "script.js" },
  ])
    assert.throws(() =>
      renameImages(
        "map-rename",
        [{ ...sampleImages()[0], ...change }],
        options,
      ),
    );
  assert.throws(() =>
    renameImages("map-rename", sampleImages(), {
      ...options,
      mapping:
        "oldName,newName\ncamera/IMG_1042.png,same.png\ncamera/IMG_1081.png,SAME.png",
    }),
  );
  assert.throws(() =>
    renameImages("map-rename", sampleImages(), {
      ...options,
      mapping: "oldName,newName\ncamera/IMG_1042.png,../out.png",
    }),
  );
  const result = renameImages("map-rename", sampleImages(), {
    ...options,
    mapping:
      "oldName,newName\ncamera/IMG_1042.png,hero.png\nabsent.png,unused.png",
  });
  assert.equal(result.rows[0].newName, "hero.png");
  assert.equal(result.unmatched.length, 2);
  assert.deepEqual(result.unusedMappings, ["absent.png"]);
  assert.ok(csv([['=HYPERLINK("evil")']]).startsWith("\"'="));
});
test("market matching: unsupported tasks never receive invented matches; hard requirements select capable tool", () => {
  assert.equal(
    matchTools(
      interpretRules("rename photos preserving folders using CSV mapping"),
      tools,
    )[0].id,
    "map-rename",
  );
  assert.equal(
    matchTools(interpretRules("build a medical diagnosis application"), [
      ...tools,
      { ...tools[0], id: "unrelated-custom", family: "custom" },
    ]).length,
    0,
  );
  assert.equal(
    matchTools(interpretRules("take workshop reservations"), tools)[0].id,
    "booking-board",
  );
});
test("market AI: fixtures do not call transport even with a key present", async () => {
  const original = globalThis.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "synthetic-key-do-not-use";
  globalThis.fetch = async () => {
    throw new Error("Unexpected network access");
  };
  try {
    const problem = await interpretProblem("rename photos using CSV mapping");
    assert.equal(problem.source, "fixture");
    assert.equal(
      (await draftCapability("Take workshop bookings with capacity limits"))
        .source,
      "fixture",
    );
    await assert.rejects(aiFetch("https://example.invalid", {}), /disabled/);
    assert.equal(aiStatus().liveRequests, 0);
  } finally {
    globalThis.fetch = original;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
test("market store: password hashing, entitlement expiration/revocation and account separation", () => {
  const db = openStore(":memory:");
  initMarket(db);
  const password = hashPassword("a strong local password");
  assert.notEqual(password, "a strong local password");
  assert.ok(checkPassword("a strong local password", password));
  assert.ok(!checkPassword("wrong", password));
  db.prepare("INSERT INTO grants VALUES(?,?,?,?,1)").run(
    "a",
    "market:map-rename",
    "paypal",
    "order-a",
  );
  assert.ok(entitlement(db, "a", "map-rename"));
  assert.equal(entitlement(db, "b", "map-rename"), undefined);
  db.prepare("UPDATE market_entitlements SET expires=0").run();
  assert.equal(entitlement(db, "a", "map-rename"), undefined);
  db.prepare("UPDATE market_entitlements SET expires=?").run(
    Date.now() + 99999,
  );
  db.prepare("UPDATE grants SET active=0").run();
  assert.equal(entitlement(db, "a", "map-rename"), undefined);
  db.close();
});
test("market booking: capacity is atomic and replay does not consume a second place", () => {
  const db = openStore(":memory:");
  initMarket(db);
  db.prepare("INSERT INTO market_boards VALUES(?,?,?,?,?,?)").run(
    "board",
    "a",
    "Workshop",
    new Date(Date.now() + 86400000).toISOString(),
    1,
    Date.now(),
  );
  const reservation = {
    name: "Example Guest",
    email: "guest@example.test",
    requestKey: randomUUID(),
  };
  assert.equal(reserve(db, "board", reservation).repeated, false);
  assert.equal(reserve(db, "board", reservation).repeated, true);
  assert.throws(() =>
    reserve(db, "board", { ...reservation, email: "other@example.test" }),
  );
  assert.throws(
    () => reserve(db, "board", { ...reservation, requestKey: randomUUID() }),
    /full/,
  );
  assert.equal(
    (db.prepare("SELECT count(*) n FROM market_reservations").get() as any).n,
    1,
  );
  db.close();
});

test("market HTTP: private artifacts, persistent accounts, gated booking, provider tutorial contract, launch/revocation", async () => {
  const db = openStore(":memory:");
  const app = express();
  app.use(express.json({ limit: "18mb" }));
  registerProviderProtocol(app, db, () => {});
  app.use((req, res, next) => {
    res.locals.learner = req.headers["x-test-learner"] || "guest-a";
    next();
  });
  registerMarket(app, db, {
    origin: "http://127.0.0.1",
    production: false,
    demo: true,
    limit: () => {},
    createOrder: async () => ({ blocked: true }),
  });
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status || 400).json({ message: err.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  let providerProcess: ReturnType<typeof spawn> | undefined;
  const request = async (path: string, body?: any, learner = "guest-a") => {
    const response = await fetch(base + "/api/market" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-Learner": learner,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.headers.get("content-type")?.includes("json")
      ? await response.json()
      : Buffer.from(await response.arrayBuffer());
    return { status: response.status, data };
  };
  try {
    const trial = await request("/trials", {
      toolIds: ["pattern-rename", "map-rename"],
      sample: true,
    });
    assert.equal(trial.status, 200);
    const results = trial.data.results;
    assert.equal(results.length, 2);
    const artifact = "/artifacts/" + results[0].artifacts[0].id;
    assert.equal((await request(artifact)).status, 200);
    assert.equal((await request(artifact, undefined, "guest-b")).status, 404);
    assert.equal(
      (
        await request("/trials", {
          toolIds: ["pattern-rename"],
          sample: false,
          files: [...sampleImages(), ...sampleImages()],
        })
      ).status,
      400,
    );
    const signup = await request("/auth/register", {
      name: "Builder Example",
      email: "builder@example.test",
      password: "SafeTestPassword123",
    });
    assert.equal(signup.status, 200);
    const account = signup.data.account.id;
    const learner = (
      db
        .prepare("SELECT learner FROM market_bindings WHERE account=?")
        .get(account) as any
    ).learner;
    assert.equal((await request(artifact, undefined, learner)).status, 200);
    assert.equal(
      (
        await request(
          "/boards",
          {
            title: "Workshop",
            date: new Date(Date.now() + 86400000).toISOString(),
            capacity: 1,
          },
          learner,
        )
      ).status,
      403,
    );
    await request("/tools/booking-board/demo-access", {}, learner);
    const board = await request(
      "/boards",
      {
        title: "Workshop",
        date: new Date(Date.now() + 86400000).toISOString(),
        capacity: 1,
      },
      learner,
    );
    assert.equal(board.status, 200);
    const reservation = {
      name: "A Guest",
      email: "attendee@example.test",
      requestKey: randomUUID(),
    };
    assert.equal(
      (
        await request(
          `/boards/${board.data.id}/reserve`,
          reservation,
          "guest-b",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          `/boards/${board.data.id}/reserve`,
          reservation,
          "guest-b",
        )
      ).data.repeated,
      true,
    );
    assert.equal(
      (
        await request(
          `/boards/${board.data.id}/reserve`,
          { ...reservation, requestKey: randomUUID() },
          "guest-b",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/boards/${board.data.id}/attendees`,
          undefined,
          "guest-b",
        )
      ).status,
      401,
    );
    assert.equal(
      (await request(`/boards/${board.data.id}/attendees`, undefined, learner))
        .data.length,
      1,
    );
    const manifest = {
      title: "Uppercase reference",
      description:
        "An independent hosted text conversion app for integration testing.",
      appUrl: "http://127.0.0.1:4418",
      previewUrl: "http://127.0.0.1:4418",
      family: "custom",
      capabilities: ["uppercase-text"],
      inputs: ["text/plain"],
      outputs: ["text/plain"],
    };
    const provider = await request("/providers", manifest, learner);
    assert.equal(provider.status, 200);
    const key = provider.data.credential;
    assert.ok(key.startsWith("ts_provider_"));
    const providerId = provider.data.id;
    assert.equal(
      (await request(`/providers/${providerId}/publish`, {}, "guest-b")).status,
      401,
    );
    providerProcess = spawn(
      process.execPath,
      ["examples/provider-reference.mjs"],
      {
        env: {
          ...process.env,
          TASKSLICE_URL: base,
          TASKSLICE_PROVIDER_KEY: key,
        },
        stdio: "ignore",
      },
    );
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        ready = (await fetch("http://127.0.0.1:4418")).ok;
        if (ready) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, "provider reference starts");
    const checks = await request(`/providers/${providerId}/test`, {}, learner);
    assert.equal(checks.status, 200);
    assert.equal(checks.data.passed, true, JSON.stringify(checks.data));
    assert.equal(checks.data.checks.length, 7);
    assert.equal(
      (await request(`/providers/${providerId}/publish`, {}, learner)).data
        .purchasable,
      false,
    );
    const buyer = await request(
      "/auth/register",
      {
        name: "Buyer Example",
        email: "buyer@example.test",
        password: "SyntheticBuyerPassword123",
      },
      "guest-b",
    );
    const buyerLearner = (
      db
        .prepare("SELECT learner FROM market_bindings WHERE account=?")
        .get(buyer.data.account.id) as any
    ).learner;
    const adaptation = await request(
      "/adaptations",
      {
        toolId: providerId,
        request: "Please add title-case conversion as an optional mode.",
      },
      buyerLearner,
    );
    assert.equal(adaptation.status, 200);
    assert.equal(
      (
        await request(
          `/adaptations/${adaptation.data.id}/respond`,
          { response: "I can add this as an optional text conversion mode." },
          buyerLearner,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/adaptations/${adaptation.data.id}/respond`,
          { response: "I can add this as an optional text conversion mode." },
          learner,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request("/adaptations", undefined, buyerLearner)).data[0].status,
      "responded",
    );

    assert.equal(
      (
        await request(
          `/tools/${providerId}/order`,
          { requestKey: randomUUID() },
          learner,
        )
      ).status,
      409,
    );
    const authHeaders = {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    };
    assert.equal(
      (
        await fetch(base + "/api/market/provider/verify", {
          method: "POST",
          headers: { ...authHeaders, Origin: base },
          body: JSON.stringify({ token: "none", operation: "1" }),
        })
      ).status,
      403,
    );
    db.prepare("INSERT INTO grants VALUES(?,?,?,?,1)").run(
      account,
      `market:${providerId}`,
      "paypal",
      "fixture-paid-order",
    );
    const launch = await request(`/tools/${providerId}/launch`, {}, learner);
    assert.equal(launch.status, 200);
    const code = new URL(launch.data.url).searchParams.get("code");
    const exchange = () =>
      fetch(base + "/api/market/provider/exchange", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ code }),
      });
    const exchanged = await exchange();
    assert.equal(exchanged.status, 200);
    const token = (await exchanged.json()).token;
    assert.equal((await exchange()).status, 403);
    const verify = () =>
      fetch(base + "/api/market/provider/verify", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ token, operation: "operation-1" }),
      });
    assert.equal((await verify()).status, 200);
    assert.equal((await (await verify()).json()).repeated, true);
    db.prepare(
      "UPDATE grants SET active=0 WHERE order_id='fixture-paid-order'",
    ).run();
    assert.equal((await verify()).status, 403);
    db.prepare("UPDATE market_artifacts SET expires=0").run();
    assert.equal((await request(artifact, undefined, learner)).status, 404);
    await request(
      `/providers/${providerId}/save`,
      { ...manifest, title: "Updated uppercase app" },
      learner,
    );
    assert.equal(
      (await request("/tools")).data.some((t: any) => t.id === providerId),
      false,
    );
    assert.equal(
      (
        db
          .prepare(
            "SELECT count(*) n FROM market_provider_versions WHERE provider=?",
          )
          .get(providerId) as any
      ).n,
      2,
    );
    await request("/auth/logout", {}, learner);
    const signedIn = await request(
      "/auth/login",
      { email: "builder@example.test", password: "SafeTestPassword123" },
      "new-browser",
    );
    assert.equal(signedIn.data.account.id, account);
    assert.ok(
      !JSON.stringify(
        (
          await request(
            "/builder",
            undefined,
            (
              db
                .prepare("SELECT learner FROM market_bindings WHERE account=?")
                .get(account) as any
            ).learner,
          )
        ).data,
      ).includes(key),
    );
  } finally {
    providerProcess?.kill("SIGTERM");
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  }
});

test("market full server: CSRF and origin checks, cookie rotation, persistent login and sandbox gating", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(tmpdir() + "/taskslice-market-");
  const base = "http://127.0.0.1:4339";
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts"],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        APP_MODE: "sandbox",
        PORT: "4339",
        APP_BASE_URL: base,
        DB_PATH: dir + "/test.sqlite",
        AI_MODE: "fixture",
        GEMINI_API_KEY: "",
        PAYPAL_CLIENT_ID: "",
        PAYPAL_CLIENT_SECRET: "",
      },
      stdio: "ignore",
    },
  );
  let cookie = "",
    csrf = "";
  const call = async (
    path: string,
    body?: unknown,
    extra: Record<string, string> = {},
  ) => {
    const response = await fetch(base + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: cookie,
        Origin: base,
        "X-CSRF-Token": csrf,
        "Content-Type": "application/json",
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie")!.split(";")[0];
    const data = await response.json();
    return { status: response.status, data };
  };
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        ready = (await fetch(base + "/api/health")).ok;
        if (ready) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, "full server starts");
    const config = await call("/config");
    csrf = config.data.csrf;
    const originalCookie = cookie;
    assert.equal(
      (
        await call(
          "/market/trials",
          { toolIds: ["map-rename"], sample: true },
          { "X-CSRF-Token": "" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          "/market/trials",
          { toolIds: ["map-rename"], sample: true },
          { Origin: "https://other.example" },
        )
      ).status,
      403,
    );
    const account = await call("/market/auth/register", {
      name: "Smoke User",
      email: "smoke@example.test",
      password: "SyntheticTestPassword123",
    });
    assert.equal(account.status, 200);
    assert.notEqual(cookie, originalCookie);
    assert.equal(
      (await call("/market/tools/map-rename/demo-access", {})).status,
      403,
    ); // stale CSRF denied after rotation
    csrf = account.data.csrf;
    assert.equal(
      (await call("/market/tools/map-rename/demo-access", {})).status,
      403,
    );
    assert.equal(
      (
        await call("/market/tools/map-rename/order", {
          requestKey: randomUUID(),
        })
      ).status,
      503,
    );
    assert.equal((await call("/market/session")).data.ai.liveRequests, 0);
    const logout = await call("/market/auth/logout", {});
    csrf = logout.data.csrf;
    assert.equal((await call("/market/library")).status, 401);
    const login = await call("/market/auth/login", {
      email: "smoke@example.test",
      password: "SyntheticTestPassword123",
    });
    assert.equal(login.data.account.id, account.data.account.id);
    csrf = login.data.csrf;
    assert.equal((await call("/market/library")).status, 200);
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((r) => {
      if (child.exitCode !== null) r();
      else child.once("exit", () => r());
    });
    await rm(dir, { recursive: true, force: true });
  }
});

test("market AI guard: routine tests and invalid budgets block live requests before transport", async () => {
  const keys = [
    "AI_MODE",
    "GEMINI_API_KEY",
    "ALLOW_LIVE_AI_TESTS",
    "AI_TEST_REQUEST_BUDGET",
  ];
  const before = keys.map((key) => process.env[key]);
  try {
    process.env.AI_MODE = "live";
    process.env.GEMINI_API_KEY = "synthetic-key";
    process.env.ALLOW_LIVE_AI_TESTS = "false";
    await assert.rejects(
      aiFetch("https://example.invalid", {}),
      /blocked in routine tests/,
    );
    process.env.ALLOW_LIVE_AI_TESTS = "true";
    process.env.AI_TEST_REQUEST_BUDGET = "not-a-number";
    assert.equal(aiStatus().budget, 0);
    await assert.rejects(aiFetch("https://example.invalid", {}), /exhausted/);
    assert.equal(aiStatus().liveRequests, 0);
  } finally {
    keys.forEach((key, i) => {
      if (before[i] === undefined) delete process.env[key];
      else process.env[key] = before[i];
    });
  }
});
