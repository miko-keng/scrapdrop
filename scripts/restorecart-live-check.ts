import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { openRC, createIncident } from "../server/restorecart/store";
import { addSample } from "../server/restorecart/sources";
import { reconstruct, status } from "../server/restorecart/reconstruction";

// Deliberate opt-in smoke test. Uses owned example sources, never a seller's private catalog.
const configPath = new URL("../restorecart.config.json", import.meta.url),
  original = readFileSync(configPath, "utf8"),
  config = JSON.parse(original);
const db = openRC(":memory:");
const report: any = {
  date: new Date().toISOString(),
  kind: "actual Gemini API",
  model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  passed: false,
};
try {
  config.ai.mode = "live";
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  const i = createIncident(db, "Live verification example");
  await addSample(db, i.id);
  const result = await reconstruct(db, i.id, async (url, init) => {
    const r = await fetch(url, init);
    if (!r.ok) {
      const detail = (await r.clone().json()) as any;
      report.providerError = String(
        detail.error?.message || detail.error?.status || "unknown",
      ).replaceAll(process.env.GEMINI_API_KEY || "__NO_KEY__", "[redacted]");
    }
    return r;
  });
  const repeat = await reconstruct(db, i.id);
  report.variants = result.products.length;
  report.bluePrices = [
    ...new Set(
      result.products
        .find((p) => p.sku === "MUG-BLU")
        ?.candidates.filter((c) => c.field === "price")
        .map((c) => c.value),
    ),
  ];
  report.trace = result.run.trace;
  report.cachedRepeat = repeat.run.cached;
  report.calls = status().calls;
  report.passed =
    result.products.length === 3 &&
    report.bluePrices.includes("18.00") &&
    report.bluePrices.includes("20.00") &&
    repeat.run.cached;
} catch (e) {
  report.error = (e as Error).message;
  report.trace = (e as any).trace;
  report.calls = status().calls;
  process.exitCode = 1;
} finally {
  writeFileSync(configPath, original);
  db.close();
  mkdirSync(new URL("../tests/evidence", import.meta.url), { recursive: true });
  writeFileSync(
    new URL("../tests/evidence/restorecart-live-ai.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
