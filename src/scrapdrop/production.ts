import { z } from "zod";
import type { Kit } from "./model";
export const economicsSchema = z
  .object({
    sellingPrice: z.number().int().min(0).max(10000000),
    hourlyRate: z.number().int().min(0).max(10000000),
    ownedMaterialCost: z.number().int().min(0).max(10000000),
    consumables: z.number().int().min(0).max(10000000),
    overhead: z.number().int().min(0).max(10000000),
    paymentFees: z.number().int().min(0).max(10000000),
  })
  .strict();
export type EconomicsInput = z.infer<typeof economicsSchema>;
export const emptyEconomics: EconomicsInput = {
  sellingPrice: 0,
  hourlyRate: 0,
  ownedMaterialCost: 0,
  consumables: 0,
  overhead: 0,
  paymentFees: 0,
};
export function economics(
  k: Kit,
  input: EconomicsInput,
  actual?: { completed: number; minutes: number },
) {
  const v = economicsSchema.parse(input),
    q = actual?.completed ?? k.config.quantity,
    minutes =
      actual?.minutes ??
      k.batch?.plan.estimatedMinutes ??
      k.template.minutes * q,
    labor = Math.round((minutes * v.hourlyRate) / 60),
    cost =
      k.total +
      v.ownedMaterialCost +
      v.consumables +
      v.overhead +
      v.paymentFees +
      labor,
    revenue = q * v.sellingPrice;
  return {
    quantity: q,
    minutes,
    labor,
    cost,
    revenue,
    contribution: revenue - cost,
    perGoodUnit: q ? Math.ceil(cost / q) : null,
    cashAvoided: k.batch?.plan.materialSavings || 0,
  };
}
export const resultSchema = z
  .object({
    revision: z.number().int().min(0),
    completed: z.number().int().min(0).max(100),
    spoiled: z.number().int().min(0).max(100),
    minutes: z.number().int().min(1).max(100000),
    notes: z.string().max(1000),
    economics: economicsSchema,
    finalize: z.boolean(),
    offcuts: z
      .array(
        z
          .object({
            sourceId: z.string().min(1).max(100),
            name: z.string().trim().min(1).max(80),
            width: z.number().int().min(1).max(3000),
            length: z.number().int().min(1).max(3000),
            quantity: z.number().int().min(1).max(100),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
export type ProductionResult = z.infer<typeof resultSchema>;
