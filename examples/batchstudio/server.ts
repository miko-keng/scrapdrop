import express from "express";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { renameImages, sampleImages, sha } from "../../server/market/files";
import {
  imageBatch,
  renameOptions,
} from "../../server/market/provider-samples";

export function createBatchStudio() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "18mb" }));
  const port = Number(process.env.PORT || process.env.PROVIDER_PORT || 4419),
    origin =
      process.env.BATCHSTUDIO_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      `http://127.0.0.1:${port}`,
    platform = process.env.TASKSLICE_URL || "http://127.0.0.1:4317",
    credential = process.env.TASKSLICE_PROVIDER_KEY || "";
  const path =
    process.env.BATCHSTUDIO_DB_PATH || resolve(".data/batchstudio.sqlite");
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ":memory:") chmodSync(path, 0o600);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,token TEXT,csrf TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,session TEXT NOT NULL,request TEXT NOT NULL,fingerprint TEXT NOT NULL,body TEXT NOT NULL,zip BLOB NOT NULL,paid INTEGER NOT NULL,expires INTEGER NOT NULL,UNIQUE(session,request));",
  );
  const limits = new Map<string, { count: number; expires: number }>();
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "POST") {
      const key = req.ip || "local",
        old = limits.get(key),
        now = Date.now();
      if (!old || old.expires < now)
        limits.set(key, { count: 1, expires: now + 60000 });
      else if (++old.count > 90)
        return res
          .status(429)
          .json({
            message: "Please wait a minute before running another batch.",
          });
      if (req.headers.origin && req.headers.origin !== origin)
        return res
          .status(403)
          .json({
            message: "Use the BatchStudio website to submit this request.",
          });
    }
    next();
  });
  const manifest = {
    title: "BatchStudio Demo",
    description:
      "A separately hosted photo-delivery application: rename JPEG/PNG images, preserve folders and export an unchanged-byte ZIP. Free preview: three images. TaskSlice-operated sandbox demo.",
    appUrl: origin,
    previewUrl: origin,
    family: "batch-file-renaming",
    capabilities: [
      "filename-pattern",
      "preserve-file-bytes",
      "sequence-numbers",
      "folder-preservation",
      "csv-mapping",
    ],
    inputs: ["image/jpeg", "image/png"],
    outputs: ["application/zip", "text/csv"],
    sampleContract: "image-rename-v1",
  };
  async function access(token: string, operation: string) {
    if (!credential) return { allowed: false, repeated: false };
    try {
      const response = await fetch(platform + "/api/market/provider/verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, operation }),
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return { allowed: false, repeated: false };
      const body = (await response.json()) as any;
      return {
        allowed: body.allowed === true,
        repeated: body.repeated === true,
      };
    } catch {
      return { allowed: false, repeated: false };
    }
  }
  function cookie(res: express.Response, id: string) {
    res.setHeader(
      "Set-Cookie",
      `bs_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${new URL(origin).protocol === "https:" ? "; Secure" : ""}`,
    );
  }
  function session(req: express.Request, res: express.Response) {
    const raw = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("bs_session="))
      ?.slice(11);
    let row = raw
      ? (db
          .prepare("SELECT * FROM sessions WHERE id=? AND expires>?")
          .get(sha(raw), Date.now()) as any)
      : null;
    if (!row) {
      const id = randomBytes(24).toString("hex");
      row = {
        id: sha(id),
        token: null,
        csrf: randomBytes(24).toString("hex"),
        expires: Date.now() + 3600000,
      };
      db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
        row.id,
        row.token,
        row.csrf,
        row.expires,
      );
      cookie(res, id);
    }
    return row;
  }
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, app: "BatchStudio Demo" }),
  );
  app.get("/taskslice/manifest", (_req, res) => res.json(manifest));
  app.get("/api/session", async (req, res) => {
    const s = session(req, res),
      current = s.token
        ? await access(s.token, "batchstudio-status")
        : { allowed: false };
    res.json({
      csrf: s.csrf,
      paid: current.allowed,
      connected: !!credential,
      platform,
      origin,
      providerId: process.env.TASKSLICE_PROVIDER_ID || null,
    });
  });
  app.post("/taskslice/trial", (req, res) => {
    const input = z
      .object({
        contract: z.literal("image-rename-v1"),
        input: z.object({ files: imageBatch.max(3), options: renameOptions }),
      })
      .parse(req.body);
    const result = renameImages(
      "map-rename",
      input.input.files,
      input.input.options,
    );
    res.json({ rows: result.rows, zip: result.zip.toString("base64") });
  });
  app.post("/taskslice/contract", async (req, res) => {
    const parsed = z
      .object({
        token: z.string().max(200).default(""),
        requestKey: z.string().min(1).max(100),
        input: z.object({ files: imageBatch.max(3), options: renameOptions }),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ allowed: false });
    const body = parsed.data,
      current = await access(body.token, body.requestKey);
    if (!current.allowed) return res.status(403).json({ allowed: false });
    const result = renameImages(
      "map-rename",
      body.input.files,
      body.input.options,
    );
    res.json({
      allowed: true,
      repeated: current.repeated,
      rows: result.rows,
      zip: result.zip.toString("base64"),
    });
  });
  app.get("/taskslice/launch", async (req, res) => {
    try {
      if (typeof req.query.code !== "string" || !credential)
        return res
          .status(403)
          .send("Launch from TaskSlice with active access.");
      const response = await fetch(platform + "/api/market/provider/exchange", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: req.query.code }),
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      const body = (await response.json()) as any;
      if (
        !response.ok ||
        body.allowed !== true ||
        typeof body.token !== "string"
      )
        return res
          .status(403)
          .send("Access is missing, expired or revoked. Return to TaskSlice.");
      const id = randomBytes(24).toString("hex");
      db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
        sha(id),
        body.token,
        randomBytes(24).toString("hex"),
        Date.now() + 3600000,
      );
      cookie(res, id);
      res.redirect("/");
    } catch {
      res
        .status(503)
        .send("TaskSlice could not be reached. Please try launching again.");
    }
  });
  app.post("/api/process", async (req, res) => {
    const s = session(req, res);
    if (req.headers.origin !== origin || req.headers["x-csrf-token"] !== s.csrf)
      return res
        .status(403)
        .json({ message: "Refresh BatchStudio and try again." });
    const input = z
      .object({
        requestKey: z.uuid(),
        sample: z.boolean(),
        files: imageBatch.optional(),
        options: renameOptions,
      })
      .parse(req.body);
    const files = input.sample ? sampleImages() : input.files || [];
    if (!files.length)
      return res
        .status(400)
        .json({ message: "Choose at least one JPEG/PNG image." });
    const paid = files.length > 3;
    const permission =
      paid && s.token
        ? await access(s.token, input.requestKey)
        : { allowed: !paid };
    if (!permission.allowed)
      return res
        .status(403)
        .json({
          message:
            "Larger batches require active TaskSlice access. Open this app from My workspace after purchase.",
        });
    const fingerprint = sha(JSON.stringify({ files, options: input.options }));
    const existing = db
      .prepare("SELECT * FROM jobs WHERE session=? AND request=? AND expires>?")
      .get(s.id, input.requestKey, Date.now()) as any;
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        return res
          .status(409)
          .json({ message: "This request key belongs to a different batch." });
      return res.json({ ...JSON.parse(existing.body), repeated: true });
    }
    const result = renameImages("map-rename", files, input.options),
      id = randomBytes(24).toString("hex"),
      body = {
        id,
        rows: result.rows,
        checks: result.checks,
        download: `/api/jobs/${id}/download`,
        paid,
      };
    db.prepare("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)").run(
      id,
      s.id,
      input.requestKey,
      fingerprint,
      JSON.stringify(body),
      result.zip,
      paid ? 1 : 0,
      Date.now() + 86400000,
    );
    db.prepare("DELETE FROM jobs WHERE expires<?").run(Date.now());
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    res.json(body);
  });
  app.get("/api/jobs/:id/download", async (req, res) => {
    const s = session(req, res),
      job = db
        .prepare("SELECT * FROM jobs WHERE id=? AND session=? AND expires>?")
        .get(String(req.params.id), s.id, Date.now()) as any;
    if (!job)
      return res
        .status(404)
        .send("This output is private, expired or unavailable.");
    if (
      job.paid &&
      (!s.token || !(await access(s.token, "download:" + job.id)).allowed)
    )
      return res.status(403).send("Active access is required for this output.");
    res
      .type("application/zip")
      .setHeader(
        "Content-Disposition",
        'attachment; filename="batchstudio-delivery.zip"',
      )
      .send(Buffer.from(job.zip));
  });
  app.use(
    express.static(resolve(dirname(fileURLToPath(import.meta.url)), "public")),
  );
  app.use(
    (
      error: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) =>
      res
        .status(error instanceof z.ZodError ? 400 : error.status || 400)
        .json({
          allowed: false,
          message:
            error instanceof z.ZodError
              ? "Some image or naming details are invalid."
              : error.message || "Unable to process this batch.",
        }),
  );
  return { app, db, port };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { app, db, port } = createBatchStudio();
  const server = app.listen(port, process.env.HOST || "0.0.0.0", () =>
    console.log(`BatchStudio ready on port ${port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () =>
      server.close(() => {
        db.close();
        process.exit(0);
      }),
    );
}
