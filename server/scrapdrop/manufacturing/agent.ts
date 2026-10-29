import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { aiFetch, aiMode, isLiveAI } from "../../ai-mode";
import { consumeBudget } from "../ai";
import type { Store } from "../../store";
import type { Material } from "../../../src/scrapdrop/model";
import {
  ENGINE_VERSION,
  jobSchema,
  planJob,
  type Plan,
} from "../../../src/scrapdrop/manufacturing/engine";
import { toolSchemas, descriptions } from "./tools";
import { connectManufacturing } from "./mcp";
const instructions = readFileSync(
  new URL("../MANUFACTURING_AGENT.md", import.meta.url),
  "utf8",
);
type AgentResult = {
  plan: Plan;
  message: string;
  source: string;
  trace: { tool: string; result: unknown }[];
  cached: boolean;
};
const cache = new Map<string, AgentResult>();
export async function planWithAgent(
  db: Store,
  owner: string,
  raw: unknown,
  text: string,
) {
  const { inventory } = await import("../store");
  const stock = inventory(db);
  const job = jobSchema.parse(raw);
  const key = createHash("sha256")
    .update(
      JSON.stringify([
        owner,
        job,
        text,
        stock.map((m) => [m.id, m.available, m.revision]),
        ENGINE_VERSION,
        aiMode(),
        process.env.GEMINI_MODEL,
        instructions,
      ]),
    )
    .digest("hex");
  if (cache.has(key)) return { ...cache.get(key)!, cached: true };
  const session = await connectManufacturing(job, stock),
    trace: { tool: string; result: unknown }[] = [];
  async function call(name: string, args: unknown) {
    const out = await session.client.callTool({
      name,
      arguments: args as Record<string, unknown>,
    });
    const content = out.content as { type: string; text?: string }[];
    const data = content
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");
    let result: unknown;
    try {
      result = JSON.parse(data);
    } catch {
      result = { error: data };
    }
    trace.push({ tool: name, result });
    return { result, error: !!out.isError };
  }
  let message = "",
    source = "fixture";
  try {
    if (!isLiveAI()) {
      await call("inspectCapabilities", {});
      await call("inspectInventory", {});
      const unsupported =
        /\b(chair|furniture|phone stand|robot|electrical|locking sleeve|no.glue sleeve)\b/i.test(
          text,
        );
      message = unsupported
        ? "That request is outside the validated construction capabilities. Your manual products are unchanged. Choose a flat part, A-fold display or glued sleeve."
        : "Local demonstration: the current product rows are the explicit design inputs. Tools calculate their fit and shortfall. Enable live AI only for interpreting a new brief.";
      await call("compileRecipe", { products: job.products });
      await call("validateRecipe", {});
      await call("solveSharedSheets", {});
      await call("estimateOperations", {});
      await call("validateSchedule", {});
      await call("comparePlans", {});
    } else {
      source = "gemini";
      const capabilities = await call("inspectCapabilities", {});
      const inventoryContext = await call("inspectInventory", {});
      const contents: any[] = [
        {
          role: "user",
          parts: [
            {
              text: JSON.stringify({
                brief: text,
                job,
                capabilities: capabilities.result,
                inventory: inventoryContext.result,
              }),
            },
          ],
        },
      ];
      const declarations = Object.entries(toolSchemas).map(([name, schema]) => {
        const parameters = z.toJSONSchema(schema);
        delete (parameters as any).$schema;
        return {
          name,
          description: descriptions[name as keyof typeof descriptions],
          parametersJsonSchema: parameters,
        };
      });
      let repairs = 0,
        compiled = false;
      for (let turn = 0; turn < 3; turn++) {
        consumeBudget(db, owner);
        const response = await aiFetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL || "gemini-3.5-flash-lite")}:generateContent`,
          {
            method: "POST",
            headers: {
              "x-goog-api-key": process.env.GEMINI_API_KEY || "",
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(25000),
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: instructions }] },
              contents,
              tools: [{ functionDeclarations: declarations }],
              toolConfig:
                turn === 0
                  ? {
                      functionCallingConfig: {
                        mode: "ANY",
                        allowedFunctionNames: [
                          "compileRecipe",
                          "solveSharedSheets",
                        ],
                      },
                    }
                  : undefined,
              generationConfig: { maxOutputTokens: 2200 },
            }),
          },
        );
        if (!response.ok)
          throw Error(
            "Gemini planning is unavailable; your manual plan remains usable.",
          );
        const body = (await response.json()) as any,
          candidate = body.candidates?.[0];
        if (!candidate?.content?.parts)
          throw Error("Gemini did not return a usable plan.");
        contents.push(candidate.content);
        const calls = candidate.content.parts.filter(
          (p: any) => p.functionCall && !p.thought,
        );
        message =
          candidate.content.parts
            .filter((p: any) => p.text && !p.thought)
            .map((p: any) => p.text)
            .join("")
            .slice(0, 1800) || message;
        if (!calls.length) break;
        if (calls.length > 8) throw Error("Too many requested planning tools.");
        const responses = [];
        for (const p of calls) {
          const { name, args } = p.functionCall;
          if (name === "compileRecipe") {
            if (compiled && ++repairs > 1)
              throw Error("The bounded repair allowance is exhausted.");
            compiled = true;
          }
          const out = await call(name, args || {});
          // A compiler proposal always returns actual fit/shortfall feedback in this round.
          // This saves a provider round and gives the model evidence for its one repair.
          const planCheck =
            name === "compileRecipe" && !out.error
              ? await call("solveSharedSheets", {})
              : undefined;
          responses.push({
            functionResponse: {
              id: p.functionCall.id,
              name,
              response: {
                ...out,
                ...(planCheck ? { planCheck: planCheck.result } : {}),
              },
            },
          });
        }
        contents.push({ role: "user", parts: responses });
      }
    }
    const plan = planJob(session.context.job, stock);
    const out = {
      plan,
      message:
        message ||
        "The tool-calculated plan is shown below. Review all constraints before saving.",
      source,
      trace,
      cached: false,
    };
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, out);
    return out;
  } finally {
    await session.close();
  }
}
