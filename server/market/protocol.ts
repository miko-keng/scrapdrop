import type { Express } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Store } from "../store";
import { entitlement, initMarket } from "./store";
import { sha } from "./files";
export function registerProviderProtocol(
  app: Express,
  db: Store,
  limit: (key: string, max: number, ms: number) => void,
) {
  initMarket(db);
  app.post("/api/market/provider/:action", (req, res) => {
    limit(`provider-protocol:${req.ip}`, 120, 60000);
    if (req.headers.origin)
      return res
        .status(403)
        .json({
          allowed: false,
          message: "Provider credentials are server-only.",
        });
    const credential = req.headers.authorization?.match(
      /^Bearer (ts_provider_[a-f0-9]{64})$/,
    )?.[1];
    const provider = credential
      ? (db
          .prepare("SELECT * FROM market_providers WHERE credential=?")
          .get(sha(credential)) as any)
      : null;
    if (!provider)
      return res
        .status(401)
        .json({ allowed: false, message: "Provider authentication failed." });
    if (req.params.action === "exchange") {
      const { code } = z
        .object({ code: z.string().min(20).max(200) })
        .parse(req.body);
      const row = db
        .prepare(
          "SELECT * FROM market_launches WHERE hash=? AND provider=? AND expires>? AND used=0",
        )
        .get(sha(code), provider.id, Date.now()) as any;
      if (!row || !entitlement(db, row.account, provider.id))
        return res.status(403).json({ allowed: false });
      const changed = db
        .prepare("UPDATE market_launches SET used=1 WHERE hash=? AND used=0")
        .run(sha(code));
      if (!changed.changes) return res.status(403).json({ allowed: false });
      const token = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO market_provider_sessions VALUES(?,?,?,?)").run(
        sha(token),
        row.account,
        provider.id,
        Date.now() + 3600000,
      );
      return res.json({ allowed: true, token });
    }
    if (req.params.action !== "verify")
      return res.status(404).json({ allowed: false });
    const parsed = z
      .object({
        token: z.string().max(200),
        operation: z.string().min(1).max(100),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ allowed: false });
    const { token, operation } = parsed.data;
    const fixture = db
      .prepare(
        "SELECT * FROM market_contract_tokens WHERE hash=? AND provider=?",
      )
      .get(sha(token), provider.id) as any;
    if (fixture) {
      const allowed =
        fixture.expires > Date.now() && fixture.scenario === "valid";
      if (!allowed) return res.status(403).json({ allowed: false });
      const old = db
        .prepare(
          "SELECT 1 FROM market_usage WHERE provider=? AND operation=? AND account=?",
        )
        .get(provider.id, operation, sha(token));
      db.prepare("INSERT OR IGNORE INTO market_usage VALUES(?,?,?)").run(
        provider.id,
        operation,
        sha(token),
      );
      return res.json({ allowed: true, repeated: !!old, test: true });
    }
    const session = db
      .prepare(
        "SELECT * FROM market_provider_sessions WHERE hash=? AND provider=? AND expires>?",
      )
      .get(sha(token), provider.id, Date.now()) as any;
    if (!session || !entitlement(db, session.account, provider.id))
      return res.status(403).json({ allowed: false });
    const used = db
      .prepare(
        "SELECT 1 FROM market_usage WHERE provider=? AND operation=? AND account=?",
      )
      .get(provider.id, operation, session.account);
    db.prepare("INSERT OR IGNORE INTO market_usage VALUES(?,?,?)").run(
      provider.id,
      operation,
      session.account,
    );
    res.json({ allowed: true, repeated: !!used });
  });
}
