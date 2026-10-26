import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
const mode = process.argv[2];
if (!["live", "fixture"].includes(mode)) throw Error("Use live or fixture.");
const path = ".env";
let source = existsSync(path) ? readFileSync(path, "utf8") : "";
source = /^AI_MODE=.*$/m.test(source)
  ? source.replace(/^AI_MODE=.*$/m, "AI_MODE=" + mode)
  : source + "\nAI_MODE=" + mode + "\n";
writeFileSync(path, source, { mode: 0o600 });
chmodSync(path, 0o600);
console.log(
  "AI_MODE=" + mode + ". Restart the server to apply. No credentials changed.",
);
