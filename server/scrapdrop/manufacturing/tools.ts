import { z } from "zod";
import {
  capabilities,
  compileRecipe,
  productSchema,
  jobSchema,
  planJob,
  validateSchedule,
  type Job,
} from "../../../src/scrapdrop/manufacturing/engine";
import type { Material } from "../../../src/scrapdrop/model";
export const toolSchemas = {
  inspectCapabilities: z.object({}).strict(),
  inspectInventory: z.object({}).strict(),
  compileRecipe: z
    .object({ products: z.array(productSchema).min(1).max(8) })
    .strict(),
  validateRecipe: z.object({}).strict(),
  solveSharedSheets: z.object({}).strict(),
  estimateOperations: z.object({}).strict(),
  validateSchedule: z.object({}).strict(),
  comparePlans: z.object({}).strict(),
};
export const descriptions: Record<keyof typeof toolSchemas, string> = {
  inspectCapabilities: "Read supported construction families and limitations.",
  inspectInventory: "Read the caller-scoped owned and confirmed shop card.",
  compileRecipe:
    "Propose a full product list from explicit brief dimensions; bounded schemas and geometry are validated. Never invent a locking variant.",
  validateRecipe: "Validate compiled panel nets and report missing tools.",
  solveSharedSheets:
    "Calculate owned-first mixed-product sheet placements and exact shop shortfall.",
  estimateOperations: "Derive grouped operations and hands-on estimate.",
  validateSchedule:
    "Validate the current serial operation schedule for dependencies and exclusive resources.",
  comparePlans:
    "Compare mixed layout against a shop-only and separate-product baseline.",
};
export function toolContext(input: Job, stock: Material[]) {
  let job = structuredClone(input);
  return {
    get job() {
      return job;
    },
    execute(name: string, args: unknown) {
      if (!(name in toolSchemas)) throw Error("Unknown manufacturing tool.");
      const key = name as keyof typeof toolSchemas,
        data = toolSchemas[key].parse(args);
      if (key === "inspectCapabilities") return { capabilities };
      if (key === "inspectInventory")
        return {
          owned: job.owned,
          shop: stock
            .filter((s) => s.type === "card" && s.active && s.confirmed)
            .map(
              ({
                id,
                width,
                length,
                thickness,
                available,
                price,
                color,
                revision,
              }) => ({
                id,
                width,
                length,
                thickness,
                available,
                price,
                color,
                revision,
              }),
            ),
        };
      if (key === "compileRecipe") {
        const { products } = data as z.infer<typeof toolSchemas.compileRecipe>;
        job = jobSchema.parse({ ...job, products });
        return { recipes: products.map(compileRecipe) };
      }
      const plan = planJob(job, stock);
      if (key === "validateRecipe")
        return {
          violations: plan.recipes.flatMap((r) => r.validation),
          missingTools: plan.violations.filter((v) =>
            v.startsWith("Missing tool"),
          ),
        };
      if (key === "solveSharedSheets")
        return {
          ready: plan.ready,
          violations: plan.violations,
          sheets: plan.sheets,
          lines: plan.lines,
          total: plan.total,
        };
      if (key === "estimateOperations")
        return { minutes: plan.minutes, operations: plan.operations };
      if (key === "validateSchedule")
        return {
          violations: validateSchedule(plan.schedule),
          schedule: plan.schedule,
        };
      return {
        baseline: plan.baseline,
        cashAvoided: plan.cashAvoided,
        ownedSheets: plan.usedOwned,
        shopSheets: plan.usedShop,
        ready: plan.ready,
        violations: plan.violations,
      };
    },
  };
}
