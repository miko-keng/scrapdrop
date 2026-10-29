import { readFileSync, writeFileSync } from "node:fs";
const mode = process.argv[2];
if (!["off", "fixture", "live"].includes(mode)) {
  console.error("Use: restorecart-ai.ts off | fixture | live");
  process.exit(1);
}
const path = new URL("../restorecart.config.json", import.meta.url),
  config = JSON.parse(readFileSync(path, "utf8"));
config.ai.mode = mode;
writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
console.log(`RestoreCart AI mode: ${mode}. No model request was made.`);
