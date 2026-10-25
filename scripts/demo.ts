// Explicit local-only, disposable demo setup. No real credentials are created or printed.
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { openStore } from "../server/store";
import { initMarket, hashPassword } from "../server/market/store";
import { initScrap } from "../server/scrapdrop/store";
const path = resolve(".data/scrapdrop-demo.sqlite"),
  port = process.env.SCRAPDROP_DEMO_PORT || "4321";
const db = openStore(path);
initMarket(db);
initScrap(db);
for (const [id, email, name] of [
  ["scrapdrop-demo-owner", "studio@scrapdrop.test", "Studio Owner"],
  ["scrapdrop-demo-maker", "maker@scrapdrop.test", "Demo Maker"],
])
  db.prepare("INSERT OR IGNORE INTO market_accounts VALUES(?,?,?,?,?)").run(
    id,
    email,
    name,
    hashPassword("MakeSomething123!"),
    Date.now(),
  );
db.close();
console.log(
  `ScrapDrop local demo: http://127.0.0.1:${port}\nBuyer: maker@scrapdrop.test\nShop: studio@scrapdrop.test\nLocal demonstration password: MakeSomething123!\nSimulated payment is clearly labeled; no PayPal or Gemini calls are enabled.`,
);
const env = {
  ...process.env,
  PORT: port,
  HOST: "127.0.0.1",
  APP_BASE_URL: `http://127.0.0.1:${port}`,
  APP_MODE: "demo",
  PAYPAL_ENV: "sandbox",
  NODE_ENV: "development",
  AI_MODE: "fixture",
  DB_PATH: path,
  SCRAPDROP_OPERATOR_ACCOUNT_ID: "scrapdrop-demo-owner",
  PAYPAL_CLIENT_ID: "",
  PAYPAL_CLIENT_SECRET: "",
  GEMINI_API_KEY: "",
};
const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code || 0));
