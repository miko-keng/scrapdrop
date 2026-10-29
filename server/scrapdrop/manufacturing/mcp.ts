import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { toolSchemas, descriptions, toolContext } from "./tools";
import {
  ENGINE_VERSION,
  capabilities,
  type Job,
} from "../../../src/scrapdrop/manufacturing/engine";
import type { Material } from "../../../src/scrapdrop/model";
export function createManufacturingServer(job: Job, stock: Material[]) {
  const context = toolContext(job, stock),
    server = new McpServer({
      name: "scrapdrop-manufacturing",
      version: "2.0.0",
    });
  for (const name of Object.keys(toolSchemas) as (keyof typeof toolSchemas)[]) {
    server.registerTool(
      name,
      { description: descriptions[name], inputSchema: toolSchemas[name] },
      async (args: unknown) => {
        try {
          const result = context.execute(name, args);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
          };
        } catch (e) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: (e as Error).message }],
          };
        }
      },
    );
  }
  server.registerResource(
    "construction-registry",
    "scrapdrop://constructions",
    {
      description: "Supported construction families; no arbitrary CAD.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ engine: ENGINE_VERSION, capabilities }),
        },
      ],
    }),
  );
  return { server, context };
}
/** Authenticated web requests get a separate, caller-scoped MCP session. No public unauthenticated endpoint. */
export async function connectManufacturing(job: Job, stock: Material[]) {
  const { server, context } = createManufacturingServer(job, stock),
    client = new Client({ name: "scrapdrop-planner", version: "2.0.0" }),
    [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  return {
    client,
    context,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
