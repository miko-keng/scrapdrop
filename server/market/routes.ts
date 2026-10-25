import type { Express, Response } from "express";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { id, transaction, type Store } from "../store";
import {
  accountId,
  checkPassword,
  entitlement,
  hashPassword,
  initMarket,
  reserve,
} from "./store";
import { csv, renameImages, sampleImages, sha } from "./files";
import { interpretProblem, draftCapability } from "./ai";
import { snapshotSample, replaySample } from "./request-samples";
import { canCompare, sampleContracts } from "../../src/market/contracts";
import {
  providerOriginAllowed,
  providerCall,
  runProviderSample,
  validateImageResult,
} from "./provider-samples";
import { aiStatus, isLiveAI } from "../ai-mode";
import { matchTools, tools, type MarketTool } from "../../src/market/model";
const fail = (message: string, status = 400): never => {
  throw Object.assign(new Error(message), { status });
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const referenceOrigin = () =>
  process.env.PROVIDER_REFERENCE_ORIGIN || "http://127.0.0.1:4418";
const manifestSchema = z
  .object({
    title: z.string().trim().min(3).max(70),
    description: z.string().trim().min(15).max(1000),
    appUrl: z.url().max(400),
    previewUrl: z.url().max(400),
    family: z.enum(["batch-file-renaming", "booking-pages", "custom"]),
    capabilities: z.array(z.string().regex(/^[a-z-]{3,50}$/)).max(10),
    inputs: z.array(z.string().max(50)).min(1).max(6),
    outputs: z.array(z.string().max(50)).min(1).max(6),
    sampleContract: z
      .enum(["image-rename-v1", "booking-capacity-v1"])
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const c =
      manifest.sampleContract && sampleContracts[manifest.sampleContract];
    if (
      c &&
      (manifest.family !== c.family ||
        !c.inputs.every((input) => manifest.inputs.includes(input)) ||
        !c.outputs.every((output) => manifest.outputs.includes(output)))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "The sample contract must match the declared task family and formats.",
      });
  });
const bookingInput = z
  .object({
    title: z.string().trim().min(3).max(100),
    date: z.string().datetime({ offset: true }),
    capacity: z.number().int().min(1).max(500),
  })
  .strict();
export function registerMarket(
  app: Express,
  db: Store,
  context: {
    origin: string;
    production: boolean;
    demo: boolean;
    limit: (key: string, max: number, ms: number) => void;
    createOrder: (
      account: string,
      tool: MarketTool,
      key: string,
    ) => Promise<any>;
  },
) {
  initMarket(db);
  const owner = (res: Response) =>
    accountId(db, res.locals.learner) || res.locals.learner;
  const requireAccount = (res: Response) =>
    accountId(db, res.locals.learner) ||
    fail("Sign in to save, purchase or publish.", 401);
  const profile = (account?: string) =>
    account
      ? db
          .prepare("SELECT id,name,email FROM market_accounts WHERE id=?")
          .get(account) || null
      : null;
  function rotate(res: Response, account?: string) {
    const old = res.locals.learner;
    const token = randomBytes(32).toString("hex"),
      learner = id("learner"),
      csrf = randomBytes(24).toString("hex");
    db.prepare("DELETE FROM sessions WHERE learner=?").run(old);
    db.prepare("DELETE FROM market_bindings WHERE learner=?").run(old);
    db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
      hash(token),
      learner,
      csrf,
      Date.now() + 30 * 86400000,
    );
    if (account)
      db.prepare("INSERT INTO market_bindings VALUES(?,?)").run(
        learner,
        account,
      );
    res.setHeader(
      "Set-Cookie",
      `ts_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${context.production ? "; Secure" : ""}`,
    );
    res.locals.learner = learner;
    res.locals.csrf = csrf;
    return csrf;
  }
  const referenceOwner = () => {
    const configured = process.env.TASKSLICE_REFERENCE_OWNER_ACCOUNT_ID || "";
    return configured && profile(configured) ? configured : "";
  };
  const isReferenceOwner = (account: string) =>
    !!referenceOwner() && referenceOwner() === account;
  function requestRecord(
    requestId: string,
    account: string,
    responding = false,
  ) {
    const row = db
      .prepare("SELECT * FROM market_requests WHERE id=?")
      .get(requestId) as any;
    if (!row) return fail("Request not found.", 404);
    const recipient = row.provider?.startsWith("reference:")
      ? isReferenceOwner(account)
      : !!db
          .prepare("SELECT id FROM market_providers WHERE id=? AND account=?")
          .get(row.provider || "", account);
    if (!recipient && (responding || row.buyer !== account))
      fail("Request not found.", 404);
    return row;
  }
  function attachedSample(jobId: string, account: string, toolId: string) {
    const job = db
      .prepare(
        "SELECT body FROM market_jobs WHERE id=? AND owner=? AND tool=? AND expires>?",
      )
      .get(jobId, account, toolId, Date.now()) as any;
    if (!job)
      fail(
        "Sample not found, expired or owned by another account. Run the sample again.",
        404,
      );
    return snapshotSample(JSON.parse(job.body));
  }
  function providerRecord(res: Response, providerId: string) {
    const p = db
      .prepare("SELECT * FROM market_providers WHERE id=? AND account=?")
      .get(providerId, requireAccount(res)) as any;
    if (p && JSON.parse(p.body).guidedDemo)
      fail(
        "Guided examples cannot be published or connected as real providers.",
        409,
      );
    return p || fail("Provider draft not found.", 404);
  }
  function listed() {
    const custom = (db.prepare("SELECT * FROM market_providers").all() as any[])
      .map((p) => {
        const body = JSON.parse(p.body);
        const checked =
          p.checked_hash === sha(JSON.stringify(body.manifest || body));
        const sampleReady =
          checked &&
          !!body.sampleContract &&
          providerOriginAllowed(body.appUrl, context.production);
        const operatorOwned =
          p.id === process.env.TASKSLICE_DEMO_PROVIDER_ID &&
          isReferenceOwner(p.account);
        return body.published
          ? {
              id: p.id,
              title: body.title,
              subtitle: "Independent provider preview",
              description: body.description,
              provider:
                (profile(p.account) as any)?.name || "Independent builder",
              family: body.family,
              capabilities: body.capabilities,
              inputs: body.inputs,
              outputs: body.outputs,
              price: operatorOwned ? 600 : 0,
              days: 30,
              trialLimit: body.sampleContract === "image-rename-v1" ? 3 : 1,
              paidLimit: operatorOwned ? 100 : 0,
              sampleContract: body.sampleContract || null,
              sampleReady,
              operatorOwned,
              purchasable: operatorOwned && sampleReady,
              appUrl: body.appUrl,
              previewUrl: body.previewUrl,
              reference: false,
              available: true,
              version: body.version || 1,
              state:
                operatorOwned && sampleReady
                  ? "TaskSlice-operated sandbox demo"
                  : checked
                    ? "integration checked · preview only"
                    : "preview only",
            }
          : null;
      })
      .filter(Boolean);
    return [...tools, ...custom] as MarketTool[];
  }
  function toolById(toolId: string) {
    return (
      listed().find((t) => t.id === toolId) ||
      fail("This tool was not found.", 404)
    );
  }
  function withAccess(tool: MarketTool, res: Response) {
    const acc = accountId(db, res.locals.learner),
      e = acc ? entitlement(db, acc, tool.id) : null;
    return { ...tool, owned: !!e, expires: e?.expires, source: e?.source };
  }
  function protectedTool(toolId: string, res: Response) {
    const acc = requireAccount(res);
    if (!entitlement(db, acc, toolId))
      fail("An active access package is required for this operation.", 403);
    return acc;
  }
  function cleanup() {
    db.prepare("DELETE FROM market_artifacts WHERE expires<?").run(Date.now());
    db.prepare("DELETE FROM market_jobs WHERE expires<?").run(Date.now());
    db.prepare("DELETE FROM market_contract_tokens WHERE expires<?").run(
      Date.now(),
    );
    db.prepare("DELETE FROM market_launches WHERE expires<?").run(Date.now());
    db.prepare("DELETE FROM market_provider_sessions WHERE expires<?").run(
      Date.now(),
    );
  }
  app.get("/api/market/session", (_req, res) =>
    res.json({
      account: profile(accountId(db, res.locals.learner)),
      ai: { ...aiStatus(), available: isLiveAI() },
      demo: context.demo,
      referenceOrigin: referenceOrigin(),
      referenceInboxConfigured: !!referenceOwner(),
      referenceOwner: isReferenceOwner(accountId(db, res.locals.learner) || ""),
    }),
  );
  app.post("/api/market/auth/:action", (req, res) => {
    const action = String(req.params.action);
    context.limit(`market-auth:${req.ip}`, 30, 900000);
    if (action === "logout") {
      const csrf = rotate(res);
      return res.json({ account: null, csrf });
    }
    const input = z
      .object({
        email: z.email().max(160),
        password: z.string().min(10).max(128),
        name: z.string().trim().min(2).max(60).optional(),
      })
      .parse(req.body);
    const email = input.email.toLowerCase();
    let account: any;
    if (action === "register") {
      if (!input.name) fail("Add your display name.");
      if (db.prepare("SELECT id FROM market_accounts WHERE email=?").get(email))
        fail("This email already has an account. Sign in instead.", 409);
      account = { id: id("account"), name: input.name, email };
      db.prepare("INSERT INTO market_accounts VALUES(?,?,?,?,?)").run(
        account.id,
        email,
        input.name!,
        hashPassword(input.password),
        Date.now(),
      );
    } else if (action === "login") {
      const record = db
        .prepare("SELECT * FROM market_accounts WHERE email=?")
        .get(email) as any;
      if (!record || !checkPassword(input.password, record.password))
        fail("Email or password is incorrect.", 401);
      account = { id: record.id, name: record.name, email: record.email };
    } else fail("Unknown sign-in action.", 404);
    const guest = res.locals.learner;
    if (!accountId(db, guest)) {
      db.prepare("UPDATE market_jobs SET owner=? WHERE owner=?").run(
        account.id,
        guest,
      );
      db.prepare("UPDATE market_artifacts SET owner=? WHERE owner=?").run(
        account.id,
        guest,
      );
    }
    const csrf = rotate(res, account.id);
    res.json({ account, csrf });
  });
  app.get("/api/market/tools", (_req, res) =>
    res.json(listed().map((t) => withAccess(t, res))),
  );
  app.get("/api/market/tools/:id", (req, res) =>
    res.json(withAccess(toolById(String(req.params.id)), res)),
  );
  app.post("/api/market/problems", async (req, res) => {
    context.limit(`problem:${owner(res)}`, 20, 3600000);
    const input = z
      .object({
        text: z.string().trim().min(5).max(1500),
        manualFamily: z
          .enum(["batch-file-renaming", "booking-pages", "custom"])
          .optional(),
        requirements: z
          .array(z.enum(["folder-preservation", "csv-mapping"]))
          .max(2)
          .optional(),
      })
      .parse(req.body);
    const problem = input.manualFamily
      ? {
          family: input.manualFamily,
          requirements: input.requirements || [],
          clarification: null,
          source: "manual",
        }
      : await interpretProblem(input.text);
    res.json({
      problem,
      tools: matchTools(problem as any, listed()).map((t) =>
        withAccess(t, res),
      ),
    });
  });
  app.post("/api/market/provider-description", async (req, res) => {
    requireAccount(res);
    context.limit(`provider-ai:${owner(res)}`, 10, 3600000);
    const { text } = z
      .object({ text: z.string().min(15).max(1500) })
      .parse(req.body);
    res.json(await draftCapability(text));
  });
  app.post("/api/market/trials", async (req, res) => {
    cleanup();
    context.limit(`trial:${owner(res)}`, 30, 3600000);
    const input = z
      .object({
        toolIds: z.array(z.string().min(1).max(100)).min(1).max(3),
        sample: z.boolean(),
        files: z
          .array(
            z.object({
              name: z.string().max(180),
              type: z.string().max(40),
              data: z.string().max(2800000),
            }),
          )
          .max(100)
          .optional(),
        label: z.string().max(60).default("Sunday-studio"),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .default("2026-10-24"),
        preserveFolders: z.boolean().default(true),
        mapping: z.string().max(30000).default(""),
        pattern: z.string().max(120).default("{label}_{date}_{seq}"),
      })
      .parse(req.body);
    if (new Set(input.toolIds).size !== input.toolIds.length)
      fail("Choose different tools to compare.");
    const selected = input.toolIds.map(toolById);
    if (!canCompare(selected))
      fail("Choose tools with the same verified sample operation and formats.");
    if (!input.sample && selected.some((tool) => !tool.reference))
      fail(
        "External comparison uses bundled sample files only. Upload your own files directly on the provider website.",
      );
    const files = input.sample ? sampleImages() : input.files || [];
    const results = await Promise.all(
      selected.map(async (tool) => {
        const toolId = tool.id;
        const acc = accountId(db, res.locals.learner),
          paid = acc && entitlement(db, acc, toolId);
        if (
          tool.sampleContract === "image-rename-v1" &&
          (!files.length ||
            files.length > (paid ? tool.paidLimit : tool.trialLimit))
        )
          fail(
            `Use 1–${paid ? tool.paidLimit : tool.trialLimit} images for ${tool.title}.`,
          );
        const fingerprint = sha(
          JSON.stringify({
            toolId,
            version: tool.version,
            files,
            options: { ...input, files: undefined, toolIds: undefined },
          }),
        );
        const cached = db
          .prepare(
            "SELECT body FROM market_jobs WHERE owner=? AND tool=? AND fingerprint=? AND expires>? ORDER BY created DESC,rowid DESC LIMIT 1",
          )
          .get(owner(res), toolId, fingerprint, Date.now()) as any;
        if (cached) {
          const previous = JSON.parse(cached.body);
          if (
            previous.status !== "failed" &&
            (!input.sample ||
              tool.sampleContract === "booking-capacity-v1" ||
              previous.sampleInput)
          )
            return { ...previous, cached: true };
        }
        const jobId = id("job"),
          start = performance.now(),
          expires = Date.now() + 86400000;
        let result: any,
          artifacts: any[] = [];
        let failedMessage = "";
        if (tool.sampleContract === "booking-capacity-v1" && tool.reference) {
          let seats = 0;
          const outcomes = Array.from({ length: 4 }, () =>
            seats < 3 ? (seats++, true) : false,
          );
          result = {
            kind: "booking",
            capacity: 3,
            accepted: outcomes.filter(Boolean).length,
            rejected: outcomes.filter((v) => !v).length,
            checks: { capacityEnforced: seats === 3 },
            note: "Real capacity-rule simulation. Publishing a persistent booking page requires access.",
          };
        } else {
          let renamed: any;
          try {
            renamed = tool.reference
              ? renameImages(
                  toolId,
                  files,
                  toolId === "pattern-rename"
                    ? { ...input, mapping: "", preserveFolders: false }
                    : input,
                )
              : await runProviderSample(tool, input);
          } catch (error) {
            if (tool.reference) throw error;
            failedMessage =
              "The provider could not return a valid sample. It may be unavailable or its output did not satisfy the contract.";
          }
          if (failedMessage) result = { message: failedMessage };
          else if (renamed.kind === "booking") result = renamed;
          else {
            result = {
              kind: "files",
              rows: renamed.rows,
              unmatched: renamed.unmatched,
              unusedMappings: renamed.unusedMappings,
              checks: renamed.checks,
            };
            artifacts = [
              {
                id: id("artifact"),
                name: `${toolId}.zip`,
                type: "application/zip",
                bytes: renamed.zip,
              },
              {
                id: id("artifact"),
                name: `${toolId}-mapping.csv`,
                type: "text/csv",
                bytes: Buffer.from(renamed.mapping),
              },
            ];
          }
        }
        const body = {
          id: jobId,
          toolId,
          toolTitle: tool.title,
          status: failedMessage ? "failed" : "succeeded",
          sampleContract: tool.sampleContract,
          version: tool.version,
          elapsedMs: Math.max(1, Math.round(performance.now() - start)),
          ...result,
          sampleInput:
            input.sample &&
            tool.sampleContract === "image-rename-v1" &&
            !failedMessage
              ? {
                  source: "bundled-images",
                  options: {
                    label: input.label,
                    date: input.date,
                    pattern: input.pattern,
                    preserveFolders: input.preserveFolders,
                    mapping: toolId === "pattern-rename" ? "" : input.mapping,
                  },
                }
              : null,
          artifacts: artifacts.map(({ id, name, type }) => ({
            id,
            name,
            type,
          })),
          expires,
        };
        transaction(db, () => {
          db.prepare("INSERT INTO market_jobs VALUES(?,?,?,?,?,?,?)").run(
            jobId,
            owner(res),
            toolId,
            fingerprint,
            JSON.stringify(body),
            Date.now(),
            expires,
          );
          for (const artifact of artifacts)
            db.prepare(
              "INSERT INTO market_artifacts VALUES(?,?,?,?,?,?,?)",
            ).run(
              artifact.id,
              owner(res),
              jobId,
              artifact.name,
              artifact.type,
              artifact.bytes,
              expires,
            );
        });
        return body;
      }),
    );
    res.json({ results });
  });
  app.get("/api/market/artifacts/:id", (req, res) => {
    cleanup();
    const a = db
      .prepare(
        "SELECT * FROM market_artifacts WHERE id=? AND owner=? AND expires>?",
      )
      .get(String(req.params.id), owner(res), Date.now()) as any;
    if (!a) fail("This output is private, expired or unavailable.", 404);
    res
      .type(a.type)
      .setHeader("Content-Disposition", `attachment; filename="${a.name}"`)
      .send(Buffer.from(a.bytes));
  });
  app.post("/api/market/tools/:id/order", async (req, res) => {
    const account = requireAccount(res),
      tool = toolById(String(req.params.id));
    if (!tool.reference && !tool.purchasable)
      fail(
        "This provider is preview-only until seller onboarding is available.",
        409,
      );
    if (entitlement(db, account, tool.id)) return res.json({ owned: true });
    context.limit(`market-order:${account}`, 20, 3600000);
    const { requestKey } = z.object({ requestKey: z.uuid() }).parse(req.body);
    res.json(await context.createOrder(account, tool, requestKey));
  });
  app.post("/api/market/tools/:id/demo-access", (req, res) => {
    if (!context.demo) fail("Demo grants are disabled in sandbox mode.", 403);
    const account = requireAccount(res),
      tool = toolById(String(req.params.id));
    if (!tool.reference)
      fail("Only reference applications support demo grants.");
    db.prepare(
      "INSERT OR IGNORE INTO grants(learner,lesson,source,order_id) VALUES(?,?,'demo',?)",
    ).run(account, `market:${tool.id}`, `market-demo:${account}:${tool.id}`);
    res.json(withAccess(tool, res));
  });
  app.get("/api/market/library", (_req, res) => {
    const account = requireAccount(res);
    res.json({
      tools: listed()
        .map((t) => withAccess(t, res))
        .filter((t) => t.owned),
      boards: db
        .prepare(
          "SELECT b.*,(SELECT count(*) FROM market_reservations r WHERE r.board=b.id) reserved FROM market_boards b WHERE account=? ORDER BY created DESC",
        )
        .all(account),
      jobs: (
        db
          .prepare(
            "SELECT body FROM market_jobs WHERE owner=? AND expires>? ORDER BY created DESC LIMIT 20",
          )
          .all(account, Date.now()) as any[]
      ).map((j) => JSON.parse(j.body)),
    });
  });
  app.post("/api/market/presets", (req, res) => {
    const body = z
      .object({
        tool: z.enum(["pattern-rename", "map-rename"]),
        name: z.string().trim().min(2).max(50),
        label: z.string().max(60),
        date: z.string().max(10),
        preserveFolders: z.boolean(),
        pattern: z.string().max(120).default("{label}_{date}_{seq}"),
      })
      .parse(req.body);
    const account = protectedTool(body.tool, res);
    const presetId = id("preset");
    db.prepare("INSERT INTO market_presets VALUES(?,?,?,?)").run(
      presetId,
      account,
      body.tool,
      JSON.stringify(body),
    );
    res.json({ id: presetId, ...body });
  });
  app.get("/api/market/presets/:tool", (req, res) => {
    const tool = String(req.params.tool),
      account = protectedTool(tool, res);
    res.json(
      (
        db
          .prepare(
            "SELECT id,body FROM market_presets WHERE account=? AND tool=?",
          )
          .all(account, tool) as any[]
      ).map((p) => ({ id: p.id, ...JSON.parse(p.body) })),
    );
  });
  app.post("/api/market/boards", (req, res) => {
    const account = protectedTool("booking-board", res),
      body = bookingInput.parse(req.body);
    if (Date.parse(body.date) <= Date.now())
      fail("Choose a future session date.");
    if (
      (
        db
          .prepare("SELECT count(*) n FROM market_boards WHERE account=?")
          .get(account) as any
      ).n >= 20
    )
      fail("This package supports up to 20 booking boards.");
    const boardId = id("board");
    db.prepare("INSERT INTO market_boards VALUES(?,?,?,?,?,?)").run(
      boardId,
      account,
      body.title,
      body.date,
      body.capacity,
      Date.now(),
    );
    res.json({ id: boardId, ...body, url: `/b/${boardId}` });
  });
  app.get("/api/market/boards/:id", (req, res) => {
    const b = db
      .prepare("SELECT * FROM market_boards WHERE id=?")
      .get(String(req.params.id)) as any;
    if (!b) fail("Booking page not found.", 404);
    res.json({
      id: b.id,
      title: b.title,
      date: b.date,
      capacity: b.capacity,
      reserved: (
        db
          .prepare("SELECT count(*) n FROM market_reservations WHERE board=?")
          .get(b.id) as any
      ).n,
      available:
        !!entitlement(db, b.account, "booking-board") &&
        Date.parse(b.date) > Date.now(),
    });
  });
  app.post("/api/market/boards/:id/reserve", (req, res) => {
    context.limit(`reserve:${req.ip}`, 30, 3600000);
    const board = db
      .prepare("SELECT * FROM market_boards WHERE id=?")
      .get(String(req.params.id)) as any;
    if (!board) fail("Booking page not found.", 404);
    if (
      !entitlement(db, board.account, "booking-board") ||
      Date.parse(board.date) <= Date.now()
    )
      fail("This booking page is closed.", 403);
    const input = z
      .object({
        name: z.string().trim().min(2).max(80),
        email: z.email().max(160),
        requestKey: z.uuid(),
      })
      .parse(req.body);
    res.json(reserve(db, board.id, input));
  });
  app.get("/api/market/boards/:id/attendees", (req, res) => {
    const account = protectedTool("booking-board", res),
      b = db
        .prepare("SELECT id FROM market_boards WHERE id=? AND account=?")
        .get(String(req.params.id), account);
    if (!b) fail("Booking page not found.", 404);
    res.json(
      db
        .prepare(
          "SELECT name,email,created FROM market_reservations WHERE board=? ORDER BY created",
        )
        .all(String(req.params.id)),
    );
  });
  app.get("/api/market/boards/:id/export", (req, res) => {
    const account = protectedTool("booking-board", res),
      b = db
        .prepare("SELECT id FROM market_boards WHERE id=? AND account=?")
        .get(String(req.params.id), account);
    if (!b) fail("Booking page not found.", 404);
    const rows = db
      .prepare(
        "SELECT name,email,created FROM market_reservations WHERE board=?",
      )
      .all(String(req.params.id)) as any[];
    res
      .type("text/csv")
      .setHeader("Content-Disposition", 'attachment; filename="attendees.csv"')
      .send(
        csv([
          ["Name", "Email", "Reserved"],
          ...rows.map((r) => [
            r.name,
            r.email,
            new Date(r.created).toISOString(),
          ]),
        ]),
      );
  });
  app.get("/api/market/builder", (_req, res) => {
    const account = requireAccount(res);
    res.json({
      providers: (
        db
          .prepare(
            "SELECT * FROM market_providers WHERE account=? ORDER BY updated DESC",
          )
          .all(account) as any[]
      )
        .filter((p) => !JSON.parse(p.body).guidedDemo)
        .map((p) => ({
          id: p.id,
          ...JSON.parse(p.body),
          checks: p.checks ? JSON.parse(p.checks) : null,
          checked:
            p.checked_hash === sha(JSON.stringify(JSON.parse(p.body).manifest)),
          operatorOwned:
            p.id === process.env.TASKSLICE_DEMO_PROVIDER_ID &&
            isReferenceOwner(p.account),
        })),
      requests: db
        .prepare(
          "SELECT r.* FROM market_requests r LEFT JOIN market_providers p ON r.provider=p.id WHERE p.account=? OR (?=1 AND r.provider LIKE 'reference:%') ORDER BY r.created DESC",
        )
        .all(account, isReferenceOwner(account) ? 1 : 0),
      referenceOwner: isReferenceOwner(account),
      referenceInboxConfigured: !!referenceOwner(),
    });
  });
  app.post("/api/market/providers", (req, res) => {
    const account = requireAccount(res),
      manifest = manifestSchema.parse(req.body);
    context.limit(`provider-create:${account}`, 20, 3600000);
    for (const raw of [manifest.appUrl, manifest.previewUrl]) {
      const u = new URL(raw);
      if (
        u.username ||
        u.password ||
        !(
          ["https:"].includes(u.protocol) ||
          (!context.production && providerOriginAllowed(raw, false))
        )
      )
        fail(
          "Use HTTPS, or the configured local reference origin for local integration.",
        );
    }
    const providerId = id("provider"),
      credential = "ts_provider_" + randomBytes(32).toString("hex");
    db.prepare("INSERT INTO market_providers VALUES(?,?,?,?,NULL,NULL,?)").run(
      providerId,
      account,
      JSON.stringify({ ...manifest, manifest, published: false, version: 1 }),
      hash(credential),
      Date.now(),
    );
    db.prepare("INSERT INTO market_provider_versions VALUES(?,?,?,?)").run(
      providerId,
      1,
      JSON.stringify(manifest),
      Date.now(),
    );
    res.json({ id: providerId, ...manifest, credential });
  });
  app.post("/api/market/providers/:id/save", (req, res) => {
    const p = providerRecord(res, String(req.params.id)),
      manifest = manifestSchema.parse(req.body);
    for (const raw of [manifest.appUrl, manifest.previewUrl]) {
      const u = new URL(raw);
      if (
        u.username ||
        u.password ||
        (u.protocol !== "https:" &&
          (!providerOriginAllowed(raw, false) || context.production))
      )
        fail("Use HTTPS or the configured reference origin.");
    }
    const old = JSON.parse(p.body);
    db.prepare(
      "UPDATE market_providers SET body=?,updated=?,checked_hash=NULL,checks=NULL WHERE id=?",
    ).run(
      JSON.stringify({
        ...manifest,
        manifest,
        published: false,
        version: (old.version || 1) + 1,
      }),
      Date.now(),
      p.id,
    );
    db.prepare("INSERT INTO market_provider_versions VALUES(?,?,?,?)").run(
      p.id,
      (old.version || 1) + 1,
      JSON.stringify(manifest),
      Date.now(),
    );
    res.json({ id: p.id, ...manifest, checked: false });
  });
  app.post("/api/market/providers/:id/test", async (req, res) => {
    const p = providerRecord(res, String(req.params.id)),
      body = JSON.parse(p.body);
    context.limit(`integration:${p.id}`, 10, 3600000);
    if (!providerOriginAllowed(body.appUrl, context.production))
      fail(
        "This provider origin is not approved for server-side tests. The site operator must add its exact HTTPS origin to PROVIDER_ALLOWED_ORIGINS.",
      );
    const checks: any[] = [];
    const sharedRequest = id("contract-operation");
    for (const scenario of [
      "missing",
      "valid",
      "wrong-tool",
      "expired",
      "revoked",
      "replay",
      "malformed",
    ]) {
      const token = randomBytes(24).toString("hex");
      if (scenario !== "missing")
        db.prepare("INSERT INTO market_contract_tokens VALUES(?,?,?,?)").run(
          hash(token),
          p.id,
          scenario === "replay" ? "valid" : scenario,
          scenario === "expired" ? Date.now() - 1 : Date.now() + 60000,
        );
      const requestKey = scenario === "replay" ? sharedRequest : id("test-op");
      try {
        const contractInput =
          body.sampleContract === "image-rename-v1"
            ? {
                files: sampleImages(),
                options: {
                  label: "Wedding",
                  date: "2026-10-25",
                  pattern: "{label}_{date}_{seq}",
                  preserveFolders: true,
                  mapping: "",
                },
              }
            : body.sampleContract === "booking-capacity-v1"
              ? { capacity: 3, attempts: 4 }
              : "hello";
        if (scenario === "replay")
          await providerCall(body.appUrl, "/taskslice/contract", {
            token,
            requestKey,
            input: contractInput,
          });
        const { response, payload: actual } = await providerCall(
          body.appUrl,
          "/taskslice/contract",
          {
            token: scenario === "missing" ? "" : token,
            requestKey,
            input: scenario === "malformed" ? null : contractInput,
          },
        );
        const expected = scenario === "valid" || scenario === "replay";
        let validOutput = actual.output === "HELLO";
        if (expected && body.sampleContract === "image-rename-v1") {
          try {
            validateImageResult(actual, sampleImages());
            validOutput = true;
          } catch {
            validOutput = false;
          }
        }
        if (expected && body.sampleContract === "booking-capacity-v1")
          validOutput =
            JSON.stringify(actual.outcomes) === "[true,true,true,false]";
        const passed = expected
          ? response.ok &&
            actual.allowed === true &&
            validOutput &&
            (scenario !== "replay" || actual.repeated === true)
          : !response.ok && actual.allowed === false;
        checks.push({
          name: scenario,
          passed,
          status: response.status,
          expected: expected ? "allow" : "reject",
          actual: actual.allowed ? "allowed" : "rejected",
        });
      } catch {
        checks.push({
          name: scenario,
          passed: false,
          status: 0,
          expected: "provider reachable",
          actual: "unavailable or invalid response",
        });
      }
    }
    const passed = checks.every((c) => c.passed),
      record = {
        passed,
        checks,
        testedAt: Date.now(),
        manifestVersion: body.version,
      };
    db.prepare(
      "UPDATE market_providers SET checks=?,checked_hash=?,updated=? WHERE id=?",
    ).run(
      JSON.stringify(record),
      passed ? sha(JSON.stringify(body.manifest)) : null,
      Date.now(),
      p.id,
    );
    res.json(record);
  });
  app.post("/api/market/providers/:id/publish", (req, res) => {
    const p = providerRecord(res, String(req.params.id));
    const body = JSON.parse(p.body);
    body.published = true;
    db.prepare(
      "UPDATE market_providers SET body=?,updated=? WHERE id=?",
    ).run(JSON.stringify(body), Date.now(), p.id);
    res.json({
      id: p.id,
      state:
        p.checked_hash === sha(JSON.stringify(body.manifest))
          ? "integration checked"
          : "preview only",
      purchasable: !!listed().find((t) => t.id === p.id)?.purchasable,
      message: listed().find((t) => t.id === p.id)?.purchasable
        ? "Published as a TaskSlice-operated sandbox demo using the configured reference seller."
        : "Published as preview-only. Independent seller onboarding is not enabled; payments cannot route to the reference seller.",
    });
  });
  app.post("/api/market/tools/:id/launch", (req, res) => {
    const account = requireAccount(res),
      tool = toolById(String(req.params.id));
    if (!entitlement(db, account, tool.id))
      fail("Active access is required.", 403);
    if (tool.reference) return res.json({ url: tool.appUrl });
    const code = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO market_launches VALUES(?,?,?,?,0)").run(
      hash(code),
      account,
      tool.id,
      Date.now() + 60000,
    );
    const url = new URL("/taskslice/launch", tool.appUrl);
    url.searchParams.set("code", code);
    res.json({ url: url.toString() });
  });
  app.post("/api/market/adaptations", (req, res) => {
    const account = requireAccount(res);
    context.limit(`adaptation:${account}`, 20, 3600000);
    const body = z
      .object({
        toolId: z.string(),
        request: z.string().trim().min(15).max(1500),
        budget: z.string().max(40).optional(),
        sampleJobId: z.string().max(100).optional(),
      })
      .parse(req.body);
    const tool = toolById(body.toolId);
    const sample = body.sampleJobId
      ? attachedSample(body.sampleJobId, account, tool.id)
      : null;
    const requestId = id("request");
    db.prepare(
      "INSERT INTO market_requests VALUES(?,?,?,?,?,NULL,'open',?)",
    ).run(
      requestId,
      account,
      tool.id,
      tool.reference ? `reference:${tool.id}` : tool.id,
      JSON.stringify({
        sample,
        request: body.request,
        budget: body.budget || "",
        toolTitle: tool.title,
      }),
      Date.now(),
    );
    res.json({
      id: requestId,
      status: "open",
      delivery:
        tool.reference && !referenceOwner()
          ? "awaiting-owner-setup"
          : "builder-inbox",
    });
  });
  app.get("/api/market/adaptations", (_req, res) =>
    res.json(
      db
        .prepare(
          "SELECT * FROM market_requests WHERE buyer=? ORDER BY created DESC",
        )
        .all(requireAccount(res)),
    ),
  );
  app.post("/api/market/adaptations/:id/respond", (req, res) => {
    const account = requireAccount(res),
      row = requestRecord(String(req.params.id), account, true);
    const { response } = z
      .object({ response: z.string().trim().min(10).max(2000) })
      .parse(req.body);
    db.prepare(
      "UPDATE market_requests SET response=?,status='responded' WHERE id=?",
    ).run(response, row.id);
    res.json({ ok: true });
  });
  app.post("/api/market/adaptations/:id/sample", async (req, res) => {
    const account = requireAccount(res),
      row = requestRecord(String(req.params.id), account);
    context.limit(`request-replay:${account}`, 30, 3600000);
    const input = z
      .object({ alternative: z.literal("map-rename").optional() })
      .strict()
      .parse(req.body);
    const body = JSON.parse(row.body);
    if (!body.sample) fail("No reproducible sample is attached.");
    if (
      input.alternative ||
      tools.some((tool) => tool.id === body.sample.toolId)
    )
      return res.json(replaySample(body.sample, input.alternative));
    const tool = toolById(body.sample.toolId);
    if (!tool.sampleReady || tool.version !== body.sample.version)
      fail(
        "The original provider version is not currently available for replay.",
        409,
      );
    const output: any = await runProviderSample(tool, body.sample.options);
    res.json({
      ...output,
      zip: undefined,
      mapping: undefined,
      replay: true,
      toolId: tool.id,
      toolTitle: tool.title,
      version: tool.version,
      artifacts: [],
      elapsedMs: 1,
    });
  });
  app.get("/api/market/example", (_req, res) => {
    const account = accountId(db, res.locals.learner);
    res.json({
      request: account
        ? db
            .prepare("SELECT * FROM market_requests WHERE id=? AND buyer=?")
            .get(`guided-request:${account}`, account) || null
        : null,
    });
  });
  app.post("/api/market/example", (req, res) => {
    const account = requireAccount(res);
    context.limit(`guided-example:${account}`, 15, 3600000);
    const { sampleJobId } = z
      .object({ sampleJobId: z.string().max(100) })
      .strict()
      .parse(req.body);
    const sample = attachedSample(sampleJobId, account, "pattern-rename");
    const providerId = `guided-provider:${account}`,
      requestId = `guided-request:${account}`;
    transaction(db, () => {
      db.prepare(
        "INSERT OR IGNORE INTO market_providers VALUES(?,?,?,?,NULL,NULL,?)",
      ).run(
        providerId,
        account,
        JSON.stringify({
          title: "Pattern Rename practice example",
          guidedDemo: true,
          published: false,
        }),
        hash(randomBytes(32).toString("hex")),
        Date.now(),
      );
      db.prepare(
        "INSERT OR IGNORE INTO market_requests VALUES(?,?,?,?,?,NULL,'open',?)",
      ).run(
        requestId,
        account,
        "pattern-rename",
        providerId,
        JSON.stringify({
          guidedDemo: true,
          toolTitle: "Pattern Rename · guided example",
          request:
            "Could this keep my camera/ and portraits/ folders in the output ZIP?",
          sample,
        }),
        Date.now(),
      );
    });
    res.json({
      request: db
        .prepare("SELECT * FROM market_requests WHERE id=? AND buyer=?")
        .get(requestId, account),
    });
  });
}
