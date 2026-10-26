import { z } from "zod";
import {
  buildKit,
  configSchema,
  materialFit,
  templates,
  type Kit,
  type Material,
} from "./model";
export const ownedSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(80),
    type: z.enum(["card", "fabric", "ribbon"]),
    width: z.number().int().min(1).max(3000),
    length: z.number().int().min(1).max(3000),
    thickness: z.number().min(0.1).max(2),
    quantity: z.number().int().min(0).max(1000),
    color: z.string().regex(/^#[\da-f]{6}$/i),
  })
  .strict();
export type OwnedMaterial = z.infer<typeof ownedSchema>;
export const batchSchema = z
  .object({
    config: configSchema,
    quantity: z.number().int().min(1).max(100),
    owned: z
      .array(ownedSchema)
      .max(20)
      .refine(
        (a) => new Set(a.map((m) => m.id)).size === a.length,
        "Material IDs must be unique.",
      ),
    ownedRevision: z.number().int().min(0).default(0),
    mixColors: z.boolean().default(true),
    cuttingService: z.boolean().default(false),
    availableMinutes: z.number().int().min(5).max(100000),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tools: z.array(z.enum(["scissors", "ruler", "glue", "hole punch"])).max(4),
    toolsToGet: z
      .array(z.enum(["scissors", "ruler", "glue", "hole punch"]))
      .max(4)
      .default([]),
    budget: z.number().int().min(0).max(10000000).nullable().default(null),
    flexibility: z
      .object({
        resize: z.boolean(),
        minWidth: z.number().int().min(25).max(200),
        minDepth: z.number().int().min(30).max(240),
        minHeight: z.number().min(0.1).max(80),
      })
      .strict()
      .optional(),
    allowedMaterialIds: z.array(z.string().min(1).max(100)).max(8).default([]),
    allowedRibbonIds: z.array(z.string().min(1).max(100)).max(8).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const f = value.flexibility;
    if (
      f?.resize &&
      (f.minWidth > value.config.width ||
        f.minDepth > value.config.depth ||
        (value.config.templateId !== "bookmark" &&
          f.minHeight > value.config.height))
    )
      ctx.addIssue({
        code: "custom",
        message: "Minimum dimensions cannot exceed your target dimensions.",
        path: ["flexibility"],
      });
  });
export type BatchInput = z.infer<typeof batchSchema>;
export type Placement = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
};
export const EDGE = 2,
  GAP = 3;
// Conservative uniform grids, choosing the better of two orientations. No optimal-nesting claim.
export function sheetLayout(
  width: number,
  length: number,
  blankWidth: number,
  blankHeight: number,
  limit = 100,
): Placement[] {
  let best: Placement[] = [];
  for (const rotated of [false, true]) {
    const w = rotated ? blankHeight : blankWidth,
      h = rotated ? blankWidth : blankHeight;
    const cols = Math.max(0, Math.floor((width - 2 * EDGE + GAP) / (w + GAP))),
      rows = Math.max(0, Math.floor((length - 2 * EDGE + GAP) / (h + GAP)));
    const cells: Placement[] = [];
    for (let y = 0; y < rows && cells.length < limit; y++)
      for (let x = 0; x < cols && cells.length < limit; x++)
        cells.push({
          x: EDGE + x * (w + GAP),
          y: EDGE + y * (h + GAP),
          width: w,
          height: h,
          rotated,
        });
    if (cells.length > best.length) best = cells;
  }
  return best;
}
export type Allocation = {
  source: "owned" | "shop";
  itemId: string;
  name: string;
  type: OwnedMaterial["type"];
  color: string;
  width: number;
  length: number;
  units: number;
  projects: number;
  yieldPerUnit: number;
  placements: Placement[];
  ribbonCut: number;
  usedArea: number;
  remainingArea: number;
  remainingLength: number;
  remainingWholeUnits: number;
};
export type BatchPlan = {
  quantity: number;
  madeFromOwned: number;
  ownedSheetProjects: number;
  ownedRibbonProjects: number;
  allocations: Allocation[];
  missingTools: string[];
  requiredTools: string[];
  toolsToGet: string[];
  budgetFits: boolean;
  estimatedMinutes: number;
  timeFits: boolean;
  deadlineValid: boolean;
  stockReady: boolean;
  ready: boolean;
  warnings: string[];
  fullShopSubtotal: number;
  comparisonAvailable: boolean;
  materialSavings: number;
  purchaseUnits: number;
  cuttingFee: number;
};
export function buildBatchKit(
  raw: unknown,
  stock: Material[],
  now = Date.now(),
): Kit {
  const input = batchSchema.parse(raw),
    t = templates.find((t) => t.id === input.config.templateId)!;
  const material = stock.find((m) => m.id === input.config.materialId),
    ribbon = stock.find((m) => m.id === input.config.ribbonId);
  if (!material || !ribbon)
    throw Error("Choose a material and ribbon from the shop.");
  // One-project model checks recipe, type and thickness. Larger owned sheets can still be previewed.
  const fit = materialFit(
    t.id,
    input.config.width,
    input.config.depth,
    t.id === "bookmark" ? material.thickness * 2 : input.config.height,
  );
  const preview = buildKit(
    { ...input.config, quantity: 1 },
    [
      {
        ...material,
        width: Math.max(material.width, fit.width + 4),
        length: Math.max(material.length, fit.height + 4),
      },
      { ...ribbon, length: Math.max(ribbon.length, fit.ribbon + 4) },
    ],
    false,
  );
  const allocations: Allocation[] = [],
    lines: Kit["lines"] = [];
  let ownedSheetProjects = 0,
    ownedRibbonProjects = 0,
    stockReady = true,
    fullShopSubtotal = 0,
    comparisonAvailable = true;
  function allocate(kind: "sheet" | "ribbon") {
    const reference = kind === "sheet" ? material! : ribbon!,
      owned = input.owned.filter(
        (m) =>
          m.type === reference.type &&
          m.quantity > 0 &&
          m.thickness <= (kind === "sheet" ? 1.5 : 2) &&
          Math.abs(m.thickness - reference.thickness) < 0.051 &&
          (input.mixColors ||
            m.color.toLowerCase() === reference.color.toLowerCase()) &&
          (kind !== "ribbon" || m.width <= input.config.width / 2),
      );
    const capacity = (m: { width: number; length: number }) =>
      kind === "sheet"
        ? sheetLayout(m.width, m.length, fit.width, fit.height).length
        : Math.min(
            100,
            Math.max(
              0,
              Math.floor((m.length - 2 * EDGE + GAP) / (fit.ribbon + GAP)),
            ),
          );
    const shopYield = capacity(reference);
    if (!shopYield) comparisonAvailable = false;
    fullShopSubtotal += shopYield
      ? Math.ceil(input.quantity / shopYield) * reference.price
      : 0;
    let left = input.quantity;
    const candidates = [
      ...owned
        .sort((a, b) => capacity(b) - capacity(a) || a.id.localeCompare(b.id))
        .map((m) => ({
          ...m,
          source: "owned" as const,
          available: m.quantity,
        })),
      { ...reference, source: "shop" as const },
    ];
    for (const m of candidates) {
      const per = capacity(m);
      if (!per || !left) continue;
      const needed = Math.ceil(left / per),
        units = m.source === "owned" ? Math.min(needed, m.available) : needed;
      if (!units) continue;
      const projects = Math.min(left, units * per),
        layout =
          kind === "sheet"
            ? sheetLayout(
                m.width,
                m.length,
                fit.width,
                fit.height,
                Math.min(per, projects),
              )
            : [];
      if (m.source === "shop") {
        if (units > m.available || !reference.active || !reference.confirmed)
          stockReady = false;
        lines.push({
          itemId: m.id,
          name: m.name,
          units,
          unitPrice: reference.price,
          total: units * reference.price,
          revision: reference.revision,
        });
      } else if (kind === "sheet") ownedSheetProjects += projects;
      else ownedRibbonProjects += projects;
      allocations.push({
        source: m.source,
        itemId: m.id,
        name: m.name,
        type: m.type,
        color: m.color,
        width: m.width,
        length: m.length,
        units,
        projects,
        yieldPerUnit: per,
        placements: layout,
        ribbonCut: kind === "ribbon" ? fit.ribbon : 0,
        usedArea: kind === "sheet" ? projects * fit.width * fit.height : 0,
        remainingArea:
          kind === "sheet"
            ? units * m.width * m.length - projects * fit.width * fit.height
            : 0,
        remainingLength:
          kind === "ribbon" ? units * m.length - projects * fit.ribbon : 0,
        remainingWholeUnits: m.source === "owned" ? m.quantity - units : 0,
      });
      left -= projects;
    }
    if (left) stockReady = false;
  }
  allocate("sheet");
  allocate("ribbon");
  const subtotal = lines.reduce((s, l) => s + l.total, 0),
    cuttingFee =
      input.cuttingService && lines.some((l) => l.itemId === material.id)
        ? 250
        : 0;
  const toolsToGet = t.tools.filter(
    (tool) => !input.tools.includes(tool) && input.toolsToGet.includes(tool),
  );
  const missingTools = t.tools.filter(
    (tool) => !input.tools.includes(tool) && !toolsToGet.includes(tool),
  );
  const budgetFits =
    input.budget === null || subtotal + cuttingFee <= input.budget;
  const estimatedMinutes = input.quantity * t.minutes + 10;
  const deadlineValid =
    Number.isFinite(Date.parse(input.deadline + "T23:59:59+08:00")) &&
    new Date(input.deadline + "T12:00:00+08:00").toISOString().slice(0, 10) ===
      input.deadline &&
    Date.parse(input.deadline + "T23:59:59+08:00") >= now;
  const timeFits = input.availableMinutes >= estimatedMinutes;
  const plan: BatchPlan = {
    quantity: input.quantity,
    madeFromOwned: Math.min(ownedSheetProjects, ownedRibbonProjects),
    ownedSheetProjects,
    ownedRibbonProjects,
    allocations,
    missingTools,
    requiredTools: [...t.tools],
    toolsToGet,
    budgetFits,
    estimatedMinutes,
    timeFits,
    deadlineValid,
    stockReady,
    ready:
      stockReady &&
      !missingTools.length &&
      timeFits &&
      deadlineValid &&
      budgetFits,
    warnings: [],
    fullShopSubtotal,
    comparisonAvailable,
    materialSavings: comparisonAvailable
      ? Math.max(0, fullShopSubtotal - subtotal)
      : 0,
    purchaseUnits: lines.reduce((s, l) => s + l.units, 0),
    cuttingFee,
  };
  if (!stockReady)
    plan.warnings.push(
      "The shop cannot supply this shortfall with current stock. Choose another shade, reduce the batch, or add more owned material.",
    );
  if (!budgetFits)
    plan.warnings.push(
      "This materials and service total exceeds your budget. Adjust your permitted dimensions, shades, quantity or budget.",
    );
  if (toolsToGet.length)
    plan.warnings.push(
      "Arrange before making: " +
        toolsToGet.join(", ") +
        ". These tools are not included in this purchase.",
    );
  if (missingTools.length)
    plan.warnings.push(
      "You still need these tools: " + missingTools.join(", ") + ".",
    );
  if (!timeFits)
    plan.warnings.push(
      `Allow at least ${estimatedMinutes} hands-on minutes at the template pace, including 10 minutes setup. Drying and collection time are extra.`,
    );
  if (!deadlineValid)
    plan.warnings.push("Choose a valid deadline today or later.");
  if (
    input.owned.some(
      (m) =>
        m.quantity &&
        !allocations.some((a) => a.source === "owned" && a.itemId === m.id),
    )
  )
    plan.warnings.push(
      "Some owned materials were not used: check type, thickness, size, ribbon width or the mixed-colors setting.",
    );
  return {
    ...preview,
    config: { ...preview.config, quantity: input.quantity },
    materials: [material, ribbon],
    lines,
    subtotal,
    preparation: cuttingFee,
    total: subtotal + cuttingFee,
    stockReady,
    warnings: plan.warnings,
    batch: { input, plan, pickupPlaces: 1 },
  };
}

export const toolUse: Record<string, string> = {
  scissors:
    "Cut your own sheets, make detailed cuts and trim ribbon. The shop service cuts purchased outer sheet blanks only.",
  ruler:
    "Check measurements and mark cuts or fold lines, including on pre-cut blanks.",
  glue: "Assemble the box, attach the notebook pockets or bond the bookmark layers. Cutting does not include gluing.",
  "hole punch":
    "Make the bookmark hole. Sheet cutting does not include hole punching.",
};
export function projectAlternatives(raw: unknown, stock: Material[]) {
  const input = batchSchema.parse(raw),
    base = buildBatchKit(input, stock);
  const candidates: { id: string; label: string; reason: string; kit: Kit }[] =
    [
      {
        id: "current",
        label: "My target design",
        reason: "Your chosen dimensions and reference shades.",
        kit: base,
      },
    ];
  const f = input.flexibility;
  const range = (target: number, min: number) =>
    [...new Set([target, Math.round((target + min) / 2), min])].filter(
      (n) => n <= target && n >= min,
    );
  const widths = f?.resize
    ? range(input.config.width, f.minWidth)
    : [input.config.width];
  const depths = f?.resize
    ? range(input.config.depth, f.minDepth)
    : [input.config.depth];
  const heights =
    f?.resize && input.config.templateId !== "bookmark"
      ? range(input.config.height, f.minHeight)
      : [input.config.height];
  const materials = [
    input.config.materialId,
    ...input.allowedMaterialIds.filter((id) => id !== input.config.materialId),
  ]
    .filter((id) =>
      stock.some(
        (m) =>
          m.id === id &&
          m.type === base.template.type &&
          m.active &&
          m.confirmed,
      ),
    )
    .slice(0, 5);
  const ribbons = [
    input.config.ribbonId,
    ...input.allowedRibbonIds.filter((id) => id !== input.config.ribbonId),
  ]
    .filter((id) =>
      stock.some(
        (m) => m.id === id && m.type === "ribbon" && m.active && m.confirmed,
      ),
    )
    .slice(0, 5);
  const valid: Kit[] = [];
  let tested = 0;
  outer: for (const w of widths)
    for (const d of depths)
      for (const h of heights)
        for (const m of materials)
          for (const r of ribbons) {
            if (tested >= 400) break outer;
            tested++;
            try {
              const kit = buildBatchKit(
                {
                  ...input,
                  config: {
                    ...input.config,
                    width: w,
                    depth: d,
                    height: h,
                    materialId: m,
                    ribbonId: r,
                  },
                },
                stock,
              );
              if (kit.batch!.plan.ready) valid.push(kit);
            } catch {}
          }
  const volume = (k: Kit) => k.config.width * k.config.depth * k.config.height;
  const signature = (k: Kit) => JSON.stringify([k.config, k.total, k.lines]);
  const choose = (sort: (a: Kit, b: Kit) => number, label: string) => {
    const kit = [...valid]
      .sort(sort)
      .find((k) => !candidates.some((c) => signature(c.kit) === signature(k)));
    if (!kit) return;
    if (
      candidates
        .slice(1)
        .some(
          (c) =>
            c.kit.total <= kit.total &&
            c.kit.batch!.plan.purchaseUnits <= kit.batch!.plan.purchaseUnits &&
            volume(c.kit) >= volume(kit),
        )
    )
      return;
    if (
      base.batch!.plan.ready &&
      kit.total >= base.total &&
      kit.batch!.plan.purchaseUnits >= base.batch!.plan.purchaseUnits
    )
      return;
    const sizeChanged =
      kit.config.width !== base.config.width ||
      kit.config.depth !== base.config.depth ||
      kit.config.height !== base.config.height;
    const shadeChanged =
      kit.config.materialId !== base.config.materialId ||
      kit.config.ribbonId !== base.config.ribbonId;
    candidates.push({
      id: "option-" + candidates.length,
      label,
      reason: [
        sizeChanged
          ? "Dimensions stay within your minimums."
          : "Target dimensions retained.",
        shadeChanged
          ? "Uses only additional shades you allowed."
          : "Reference shop shades retained.",
      ].join(" "),
      kit,
    });
  };
  choose(
    (a, b) =>
      a.total - b.total ||
      a.batch!.plan.purchaseUnits - b.batch!.plan.purchaseUnits ||
      volume(b) - volume(a),
    "Lower spending within my limits",
  );
  choose(
    (a, b) =>
      a.batch!.plan.purchaseUnits - b.batch!.plan.purchaseUnits ||
      a.total - b.total ||
      volume(b) - volume(a),
    "Fewer new material units",
  );
  return {
    alternatives: candidates,
    compared: tested,
    notice:
      "Comparison uses only the sizes and stocked shades you allowed. Quantity, deadline and tools stay fixed.",
  };
}
