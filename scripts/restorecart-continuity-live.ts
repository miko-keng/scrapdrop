import { readFileSync, writeFileSync } from "node:fs";
import { openRC, createIncident } from "../server/restorecart/store";
import { addSample, addSource } from "../server/restorecart/sources";
import { reconstruct, status } from "../server/restorecart/reconstruction";
const path = new URL("../restorecart.config.json", import.meta.url),
  original = readFileSync(path, "utf8"),
  settings = JSON.parse(original),
  db = openRC(":memory:");
const report: any = {
  date: new Date().toISOString(),
  kind: "Actual Gemini text + owned product-card screenshot smoke test",
  passed: false,
  scope: "Narrow synthetic example, not a merchant photo accuracy benchmark",
};
try {
  settings.ai = {
    ...settings.ai,
    mode: "live",
    maxCallsPerRun: 2,
    processCallBudget: 2,
  };
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
  const i = createIncident(db, "Owned visual reconstruction check");
  await addSample(db, i.id);
  const image = await addSource(db, i.id, {
    name: "studio-product-photo.png",
    data: readFileSync(
      new URL("../examples/restorecart/blue-mug-evidence.png", import.meta.url),
    ).toString("base64"),
  });
  const result = await reconstruct(db, i.id),
    calls = status().calls,
    repeat = await reconstruct(db, i.id);
  const blue = result.products.find((p) => p.sku === "MUG-BLU");
  report.model = status().model;
  report.variants = result.products.map((p) => ({
    sku: p.sku,
    imageMatched: p.imageSourceId === image.id,
    priceCandidates: [
      ...new Set(
        p.candidates.filter((e) => e.field === "price").map((e) => e.value),
      ),
    ],
  }));
  report.imageMatchedToBlue = blue?.imageSourceId === image.id;
  report.conflictingPricesPreserved =
    blue?.candidates.some((e) => e.field === "price" && e.value === "18.00") &&
    blue?.candidates.some((e) => e.field === "price" && e.value === "20.00");
  report.calls = calls;
  report.repeatCalls = status().calls - calls;
  report.cachedRepeat = repeat.run.cached;
  report.passed =
    result.products.length === 3 &&
    report.imageMatchedToBlue &&
    report.conflictingPricesPreserved &&
    report.cachedRepeat &&
    report.repeatCalls === 0;
  if (!report.passed) process.exitCode = 1;
} catch (e) {
  report.error = String((e as Error).message).replaceAll(
    process.env.GEMINI_API_KEY || "__NO_KEY__",
    "[redacted]",
  );
  report.calls = status().calls;
  process.exitCode = 1;
} finally {
  writeFileSync(path, original);
  db.close();
  writeFileSync(
    new URL(
      "../tests/evidence/restorecart-continuity-live.json",
      import.meta.url,
    ),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
