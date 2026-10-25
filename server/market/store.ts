import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { id, transaction, type Store } from "../store";
export function initMarket(db: Store) {
  db.exec(`
CREATE TABLE IF NOT EXISTS market_accounts(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS market_bindings(learner TEXT PRIMARY KEY,account TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS market_providers(id TEXT PRIMARY KEY,account TEXT NOT NULL,body TEXT NOT NULL,credential TEXT NOT NULL,checked_hash TEXT,checks TEXT,updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS market_provider_versions(provider TEXT NOT NULL,version INTEGER NOT NULL,body TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(provider,version));
CREATE TABLE IF NOT EXISTS market_jobs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,tool TEXT NOT NULL,fingerprint TEXT NOT NULL,body TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS market_jobs_owner ON market_jobs(owner);
CREATE TABLE IF NOT EXISTS market_artifacts(id TEXT PRIMARY KEY,owner TEXT NOT NULL,job TEXT NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL,bytes BLOB NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS market_entitlements(id TEXT PRIMARY KEY,account TEXT NOT NULL,tool TEXT NOT NULL,starts INTEGER NOT NULL,expires INTEGER NOT NULL,source TEXT NOT NULL,order_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS market_launches(hash TEXT PRIMARY KEY,account TEXT NOT NULL,provider TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS market_provider_sessions(hash TEXT PRIMARY KEY,account TEXT NOT NULL,provider TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS market_contract_tokens(hash TEXT PRIMARY KEY,provider TEXT NOT NULL,scenario TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS market_usage(provider TEXT NOT NULL,operation TEXT NOT NULL,account TEXT NOT NULL,PRIMARY KEY(provider,operation,account));
CREATE TABLE IF NOT EXISTS market_presets(id TEXT PRIMARY KEY,account TEXT NOT NULL,tool TEXT NOT NULL,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS market_boards(id TEXT PRIMARY KEY,account TEXT NOT NULL,title TEXT NOT NULL,date TEXT NOT NULL,capacity INTEGER NOT NULL,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS market_reservations(id TEXT PRIMARY KEY,board TEXT NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,request_key TEXT NOT NULL,created INTEGER NOT NULL,UNIQUE(board,request_key));
CREATE TABLE IF NOT EXISTS market_requests(id TEXT PRIMARY KEY,buyer TEXT NOT NULL,tool TEXT NOT NULL,provider TEXT,body TEXT NOT NULL,response TEXT,status TEXT NOT NULL,created INTEGER NOT NULL);
`);
  // Route earlier reference requests to the explicit reference inbox without changing buyer ownership.
  db.prepare(
    "UPDATE market_requests SET provider='reference:'||tool WHERE provider IS NULL",
  ).run();
}
export const accountId = (db: Store, learner: string) =>
  (
    db
      .prepare("SELECT account FROM market_bindings WHERE learner=?")
      .get(learner) as any
  )?.account as string | undefined;
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function entitlement(db: Store, account: string, tool: string) {
  const grants = db
    .prepare(
      "SELECT g.order_id,g.source FROM grants g WHERE learner=? AND lesson=? AND active=1",
    )
    .all(account, `market:${tool}`) as any[];
  for (const grant of grants) {
    const now = Date.now();
    db.prepare(
      "INSERT OR IGNORE INTO market_entitlements VALUES(?,?,?,?,?,?,?)",
    ).run(
      grant.order_id,
      account,
      tool,
      now,
      now + 30 * 86400000,
      grant.source,
      grant.order_id,
    );
  }
  return db
    .prepare(
      "SELECT e.* FROM market_entitlements e JOIN grants g ON g.order_id=e.order_id AND g.learner=e.account AND g.lesson='market:'||e.tool WHERE e.account=? AND e.tool=? AND e.expires>? AND g.active=1 ORDER BY e.expires DESC LIMIT 1",
    )
    .get(account, tool, Date.now()) as any;
}
export function reserve(
  db: Store,
  boardId: string,
  input: { name: string; email: string; requestKey: string },
) {
  return transaction(db, () => {
    const board = db
      .prepare("SELECT * FROM market_boards WHERE id=?")
      .get(boardId) as any;
    if (!board) throw new Error("Booking page not found.");
    const old = db
      .prepare(
        "SELECT email FROM market_reservations WHERE board=? AND request_key=?",
      )
      .get(boardId, input.requestKey) as any;
    if (old) {
      if (old.email !== input.email)
        throw new Error("Use a new reservation request key.");
      return { reserved: true, repeated: true };
    }
    const count = (
      db
        .prepare("SELECT count(*) n FROM market_reservations WHERE board=?")
        .get(boardId) as any
    ).n;
    if (count >= board.capacity) throw new Error("This session is full.");
    db.prepare("INSERT INTO market_reservations VALUES(?,?,?,?,?,?)").run(
      id("reservation"),
      boardId,
      input.name,
      input.email,
      input.requestKey,
      Date.now(),
    );
    return { reserved: true, repeated: false };
  });
}
