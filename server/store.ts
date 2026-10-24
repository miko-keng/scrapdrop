import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
export const id = (prefix: string) => `${prefix}_${randomUUID()}`;
export function openStore(
  path = process.env.DB_PATH || resolve(".data/taskslice.sqlite"),
) {
  if (path !== ":memory:")
    mkdirSync(resolve(path, ".."), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ":memory:") chmodSync(path, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, learner TEXT NOT NULL, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,learner TEXT NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS exercises(id TEXT PRIMARY KEY,learner TEXT NOT NULL,lesson TEXT NOT NULL,body TEXT NOT NULL,updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,learner TEXT NOT NULL,lesson TEXT NOT NULL,task TEXT NOT NULL,status TEXT NOT NULL,provider_id TEXT UNIQUE,request_key TEXT NOT NULL,amount INTEGER NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL,UNIQUE(learner,request_key));
 CREATE TABLE IF NOT EXISTS grants(learner TEXT NOT NULL,lesson TEXT NOT NULL,source TEXT NOT NULL,order_id TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(learner,lesson,order_id));
 CREATE TABLE IF NOT EXISTS captures(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,amount INTEGER NOT NULL,currency TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,body TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS exercises_learner ON exercises(learner);CREATE INDEX IF NOT EXISTS orders_learner ON orders(learner);`);
  return db;
}
export type Store = ReturnType<typeof openStore>;
export function transaction<T>(db: Store, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function hasAccess(db: Store, learner: string, lesson: string) {
  return db
    .prepare(
      "SELECT source FROM grants WHERE learner=? AND lesson=? AND active=1 ORDER BY source DESC LIMIT 1",
    )
    .get(learner, lesson) as { source: "demo" | "paypal" } | undefined;
}
export function grantCapture(
  db: Store,
  order: any,
  observation: {
    id: string;
    amount: string;
    currency: string;
    merchant: string;
    status: string;
  },
  expectedMerchant: string,
) {
  if (
    observation.status !== "COMPLETED" ||
    observation.currency !== "USD" ||
    observation.amount !== (order.amount / 100).toFixed(2) ||
    !expectedMerchant ||
    observation.merchant !== expectedMerchant
  )
    throw new Error(
      "Payment details do not match this order. Access has not been granted.",
    );
  transaction(db, () => {
    const existing = db
      .prepare("SELECT order_id FROM captures WHERE id=?")
      .get(observation.id) as any;
    if (existing && existing.order_id !== order.id)
      throw new Error("Capture already belongs to another order.");
    db.prepare(
      "INSERT OR IGNORE INTO captures(id,order_id,amount,currency) VALUES(?,?,?,?)",
    ).run(observation.id, order.id, order.amount, "USD");
    const latest = db
      .prepare("SELECT status FROM orders WHERE id=?")
      .get(order.id) as any;
    if (["refunded", "reversed"].includes(latest?.status)) return;
    db.prepare("UPDATE orders SET status='paid' WHERE id=?").run(order.id);
    db.prepare(
      "INSERT OR IGNORE INTO grants(learner,lesson,source,order_id) VALUES(?,?,'paypal',?)",
    ).run(order.learner, order.lesson, order.id);
  });
}
