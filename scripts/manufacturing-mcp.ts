// Public sample context only. The website uses authenticated, per-request in-memory sessions.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { openStore } from "../server/store";
import { initScrap, inventory } from "../server/scrapdrop/store";
import { exampleJob } from "../src/scrapdrop/manufacturing/engine";
import { createManufacturingServer } from "../server/scrapdrop/manufacturing/mcp";
const db = openStore(":memory:");
initScrap(db);
const { server } = createManufacturingServer(exampleJob(), inventory(db));
await server.connect(new StdioServerTransport());
process.once("SIGINT", async () => {
  await server.close();
  db.close();
  process.exit(0);
});
