import { z } from "zod";
import type { Material, Kit } from "../model";
import { templates } from "../model";
import { ownedSchema, type OwnedMaterial } from "../batch";

export const ENGINE_VERSION = "manufacturing-2.0.0";
export const productSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,50}$/),
    name: z.string().trim().min(1).max(80),
    family: z.enum(["flat", "folded", "sleeve"]),
    width: z.number().min(20).max(500),
    length: z.number().min(20).max(700),
    depth: z.number().min(5).max(200),
    quantity: z.number().int().min(1).max(100),
    hole: z.boolean(),
  })
  .strict();
export const jobSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    products: z
      .array(productSchema)
      .min(1)
      .max(8)
      .refine(
        (a) => new Set(a.map((p) => p.id)).size === a.length,
        "Product IDs must be unique",
      ),
    owned: z
      .array(ownedSchema)
      .max(20)
      .refine(
        (a) => new Set(a.map((p) => p.id)).size === a.length,
        "Material IDs must be unique",
      ),
    ownedRevision: z.number().int().min(0),
    tools: z.array(z.enum(["scissors", "ruler", "glue", "hole punch"])).max(4),
    budget: z.number().int().min(0).max(10000000),
    availableMinutes: z.number().int().min(1).max(100000),
    thickness: z.number().min(0.2).max(1.5),
    color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    mixColors: z.boolean(),
    rotate: z.boolean(),
  })
  .strict()
  .superRefine((j, c) => {
    if (j.products.reduce((n, p) => n + p.quantity, 0) > 300)
      c.addIssue({
        code: "custom",
        message: "Limit this job to 300 products.",
      });
  });
export type Product = z.infer<typeof productSchema>;
export type Job = z.infer<typeof jobSchema>;
export type Panel = {
  id: string;
  parent: string | null;
  x: number;
  y: number;
  width: number;
  length: number;
  angle: number;
  rootAngle: number;
  label: string;
  tab?: boolean;
};
export type Recipe = {
  version: 2;
  engine: string;
  product: Product;
  blank: { width: number; length: number };
  panels: Panel[];
  folds: number[];
  holes: { x: number; y: number; radius: number }[];
  tools: string[];
  steps: { title: string; action: string; fold: number; tools: string[] }[];
  evidence: "prototype";
  validation: string[];
};
export const capabilities = [
  {
    family: "flat",
    examples: ["hang tag", "backing card", "insert", "divider"],
    closure: "none",
    limits: "Rectangular card; optional 4 mm punched hole.",
  },
  {
    family: "folded",
    examples: ["price-card holder", "table sign", "table tent"],
    closure: "open standing A-fold",
    limits:
      "Two equal panels; stability needs a physical trial. No load-bearing stand.",
  },
  {
    family: "sleeve",
    examples: ["product sleeve", "paper band"],
    closure: "10 mm glued overlap",
    limits:
      "Open ends; 1 mm fit allowance per side. Glue required; no validated locking variant yet.",
  },
] as const;
export function compileRecipe(raw: unknown): Recipe {
  const p = productSchema.parse(raw),
    { width: w, length: l, depth: d } = p;
  const segments =
    p.family === "flat"
      ? [{ length: l, label: p.name, angle: 0 }]
      : p.family === "folded"
        ? [
            { length: l, label: "Front display", angle: 0 },
            { length: l, label: "Back display", angle: -140 },
          ]
        : [
            { length: l + 2, label: "Front face", angle: 0 },
            { length: d + 2, label: "Side", angle: -90 },
            { length: l + 2, label: "Back face", angle: -90 },
            { length: d + 2, label: "Side", angle: -90 },
            { length: 10, label: "Glue overlap", angle: -90 },
          ];
  let y = 0;
  const panels: Panel[] = segments.map((s, i) => {
    const panel = {
      id: `${p.id}-panel-${i}`,
      parent: i ? `${p.id}-panel-${i - 1}` : null,
      x: 0,
      y,
      width: w,
      length: s.length,
      angle: s.angle,
      rootAngle: p.family === "folded" ? 70 : 0,
      label: s.label,
      tab: p.family === "sleeve" && i === 4,
    };
    y += s.length;
    return panel;
  });
  const tools = [
    "scissors",
    "ruler",
    ...(p.family === "sleeve" ? ["glue"] : []),
    ...(p.family === "flat" && p.hole ? ["hole punch"] : []),
  ];
  const folds = panels.slice(1).map((p) => p.y);
  const r: Recipe = {
    version: 2,
    engine: ENGINE_VERSION,
    product: p,
    blank: { width: w, length: y },
    panels,
    folds,
    holes:
      p.family === "flat" && p.hole ? [{ x: w / 2, y: 10, radius: 2 }] : [],
    tools,
    evidence: "prototype",
    validation: [],
    steps: [
      {
        title: "Prepare the batch",
        action: `Make ${p.quantity} ${p.name}. Use card compatible with your selected thickness. Check your ruler and tools. This construction needs a physical trial before production promises.`,
        fold: 0,
        tools,
      },
      {
        title: "Cut all blanks",
        action: `Cut ${p.quantity} outer blanks of ${w} × ${y} mm using the allocated sheets. Solid outlines are cuts; preserve dashed fold lines. Group the cutting before assembly.`,
        fold: 0,
        tools: ["scissors", "ruler"],
      },
      ...(folds.length
        ? [
            {
              title: "Score every fold",
              action: `Measure fold lines at ${folds.join(", ")} mm from the start of the ${y} mm blank. Score gently along the width; do not cut these lines.`,
              fold: 0,
              tools: ["ruler"],
            },
          ]
        : []),
      {
        title:
          p.family === "flat" ? "Finish the flat parts" : "Fold the panels",
        action:
          p.family === "flat"
            ? p.hole
              ? "Punch a 4 mm hole centred across the width, 10 mm from the top."
              : "Keep the part flat. Check the measured edges and trim loose fibres."
            : p.family === "folded"
              ? "Fold the centre hinge to form an open A-shaped display. Keep both lower edges level. Test stability on the intended surface."
              : "Fold the four parallel score lines to 90°. Wrap around the actual product to check clearance before applying glue.",
        fold: 1,
        tools: p.family === "flat" && p.hole ? ["hole punch"] : ["ruler"],
      },
      ...(p.family === "sleeve"
        ? [
            {
              title: "Join the overlap",
              action:
                "Glue the 10 mm overlap to the inside of the first panel. Keep the ends open and the product removable. Follow the adhesive drying instructions; drying time is not included in hands-on estimates.",
              fold: 1,
              tools: ["glue"],
            },
          ]
        : []),
      {
        title: "Check and record",
        action:
          "Check dimensions and fit on a first sample. Repeat assembly for the batch. Count good and spoiled units, record hands-on time and measure reusable offcuts; the animation is not a strength certificate.",
        fold: 1,
        tools: ["ruler"],
      },
    ],
  };
  r.validation = validateRecipe(r);
  return r;
}
export function validateRecipe(r: Recipe): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const p of r.panels) {
    if (ids.has(p.id) || (p.parent && !ids.has(p.parent)))
      errors.push("Panel tree has an invalid parent.");
    ids.add(p.id);
    if (
      ![p.x, p.y, p.width, p.length, p.angle, p.rootAngle].every(
        Number.isFinite,
      ) ||
      p.width <= 0 ||
      p.length <= 0 ||
      p.x < 0 ||
      p.y < 0 ||
      p.x + p.width > r.blank.width + 1e-6 ||
      p.y + p.length > r.blank.length + 1e-6
    )
      errors.push("Panel is outside the blank.");
  }
  if (
    Math.abs(
      r.panels.reduce((n, p) => n + p.width * p.length, 0) -
        r.blank.width * r.blank.length,
    ) > 0.01
  )
    errors.push("Panel area does not match blank area.");
  for (const h of r.holes)
    if (
      h.x - h.radius < 2 ||
      h.y - h.radius < 2 ||
      h.x + h.radius > r.blank.width - 2 ||
      h.y + h.radius > r.blank.length - 2
    )
      errors.push("Hole lacks edge clearance.");
  if (
    r.product.family === "sleeve" &&
    (r.panels.length !== 5 ||
      r.panels[0].length !== r.panels[2].length ||
      r.panels[1].length !== r.panels[3].length)
  )
    errors.push("Sleeve closure dimensions disagree.");
  for (let i = 0; i < r.panels.length; i++)
    for (let j = i + 1; j < r.panels.length; j++) {
      const a = r.panels[i],
        b = r.panels[j];
      if (
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 &&
        Math.min(a.y + a.length, b.y + b.length) - Math.max(a.y, b.y) > 1e-6
      )
        errors.push("Panels overlap in the cutting net.");
    }
  return [...new Set(errors)];
}
export type Placement = {
  partId: string;
  productId: string;
  x: number;
  y: number;
  width: number;
  length: number;
  rotated: boolean;
};
export type Sheet = {
  id: string;
  lotId: string;
  source: "owned" | "shop";
  name: string;
  color: string;
  thickness: number;
  width: number;
  length: number;
  placements: Placement[];
  remaining: { x: number; y: number; width: number; length: number }[];
};
export type Operation = {
  id: string;
  name: string;
  minutes: number;
  predecessors: string[];
  resources: string[];
};
export type Slot = Operation & { start: number; end: number };
export type Plan = {
  version: 2;
  engine: string;
  input: Job;
  recipes: Recipe[];
  sheets: Sheet[];
  unplaced: string[];
  violations: string[];
  ready: boolean;
  lines: Kit["lines"];
  total: number;
  minutes: number;
  operations: Operation[];
  schedule: Slot[];
  usedOwned: number;
  usedShop: number;
  utilization: number;
  baseline: { shopCents: number; separateSheets: number } | null;
  cashAvoided: number | null;
  warnings: string[];
};
const EDGE = 2,
  GAP = 3;
type Demand = { id: string; productId: string; width: number; length: number };
function demands(recipes: Recipe[]): Demand[] {
  return recipes
    .flatMap((r) =>
      Array.from({ length: r.product.quantity }, (_, i) => ({
        id: `${r.product.id}-${i + 1}`,
        productId: r.product.id,
        width: r.blank.width,
        length: r.blank.length,
      })),
    )
    .sort(
      (a, b) =>
        b.width * b.length - a.width * a.length || a.id.localeCompare(b.id),
    );
}
function pack(
  recipes: Recipe[],
  job: Job,
  stock: Material[],
  owned = job.owned,
) {
  const pending = demands(recipes),
    sheets: Sheet[] = [];
  const lots = [
    ...owned
      .filter((m) => m.type === "card")
      .map((m) => ({ ...m, source: "owned" as const, count: m.quantity })),
    ...stock
      .filter(
        (m) => m.type === "card" && m.active && m.confirmed && m.available > 0,
      )
      .sort((a, b) => a.price - b.price || a.id.localeCompare(b.id))
      .map((m) => ({ ...m, source: "shop" as const, count: m.available })),
  ].filter(
    (m) =>
      Math.abs(m.thickness - job.thickness) < 0.051 &&
      (job.mixColors || m.color.toLowerCase() === job.color.toLowerCase()),
  );
  for (const lot of lots) {
    for (let si = 0; si < Math.min(lot.count, 300) && pending.length; si++) {
      const sheet: Sheet = {
        id: `${lot.source}:${lot.id}:${si + 1}`,
        lotId: lot.id,
        source: lot.source,
        name: lot.name,
        color: lot.color,
        thickness: lot.thickness,
        width: lot.width,
        length: lot.length,
        placements: [],
        remaining: [
          {
            x: EDGE,
            y: EDGE,
            width: lot.width - 2 * EDGE,
            length: lot.length - 2 * EDGE,
          },
        ],
      };
      for (let di = 0; di < pending.length;) {
        const part = pending[di];
        let chosen:
          | { i: number; w: number; l: number; rotated: boolean; score: number }
          | undefined;
        sheet.remaining.forEach((f, i) => {
          for (const rotated of job.rotate ? [false, true] : [false]) {
            const w = rotated ? part.length : part.width,
              l = rotated ? part.width : part.length;
            if (w <= f.width + 1e-6 && l <= f.length + 1e-6) {
              const score = f.width * f.length - w * l;
              if (!chosen || score < chosen.score)
                chosen = { i, w, l, rotated, score };
            }
          }
        });
        if (!chosen) {
          di++;
          continue;
        }
        const c = chosen as {
          i: number;
          w: number;
          l: number;
          rotated: boolean;
        };
        const f = sheet.remaining.splice(c.i, 1)[0];
        sheet.placements.push({
          partId: part.id,
          productId: part.productId,
          x: f.x,
          y: f.y,
          width: c.w,
          length: c.l,
          rotated: c.rotated,
        });
        const right = {
          x: f.x + c.w + GAP,
          y: f.y,
          width: f.width - c.w - GAP,
          length: c.l,
        };
        const below = {
          x: f.x,
          y: f.y + c.l + GAP,
          width: f.width,
          length: f.length - c.l - GAP,
        };
        for (const free of [right, below])
          if (free.width > 0 && free.length > 0) sheet.remaining.push(free);
        pending.splice(di, 1);
      }
      if (!sheet.placements.length) break;
      sheets.push(sheet);
    }
  }
  return { sheets, pending };
}
export function scheduleOperations(operations: Operation[]): Slot[] {
  const slots: Slot[] = [];
  const resources = new Map<string, number>();
  const remaining = [...operations];
  while (remaining.length) {
    const i = remaining.findIndex((o) =>
      o.predecessors.every((p) => slots.some((s) => s.id === p)),
    );
    if (i < 0)
      throw Error(
        "Operation dependencies contain a cycle or missing predecessor.",
      );
    const o = remaining.splice(i, 1)[0];
    let start = Math.max(
      0,
      ...o.predecessors.map((p) => slots.find((s) => s.id === p)!.end),
      ...o.resources.map((r) => resources.get(r) || 0),
    );
    if (o.minutes > 480)
      throw Error("An operation exceeds the 8-hour working window.");
    if ((start % 1440) + o.minutes > 480)
      start = (Math.floor(start / 1440) + 1) * 1440;
    const end = start + o.minutes;
    for (const r of o.resources) resources.set(r, end);
    slots.push({ ...o, start, end });
  }
  return slots;
}
export function validateSchedule(slots: Slot[]): string[] {
  const errors: string[] = [];
  const ids = new Set(slots.map((s) => s.id));
  if (ids.size !== slots.length) errors.push("Duplicate operation.");
  for (const s of slots) {
    if (
      !Number.isFinite(s.start) ||
      !Number.isFinite(s.end) ||
      s.start < 0 ||
      Math.abs(s.end - s.start - s.minutes) > 0.01
    )
      errors.push("Invalid operation interval.");
    if ((s.start % 1440) + s.minutes > 480 + 1e-6)
      errors.push("Operation is outside the 09–17 workshop window.");
    for (const p of s.predecessors) {
      const parent = slots.find((o) => o.id === p);
      if (!parent || parent.end > s.start + 1e-6)
        errors.push("Predecessor is not finished.");
    }
    for (const o of slots) {
      if (
        o.id !== s.id &&
        s.resources.some((r) => o.resources.includes(r)) &&
        s.start < o.end - 1e-6 &&
        o.start < s.end - 1e-6
      )
        errors.push("Exclusive resource overlap.");
    }
  }
  return [...new Set(errors)];
}
export function planJob(raw: unknown, stock: Material[]): Plan {
  const input = jobSchema.parse(raw),
    recipes = input.products.map(compileRecipe),
    { sheets, pending } = pack(recipes, input, stock);
  const required = [...new Set(recipes.flatMap((r) => r.tools))],
    violations = [
      ...recipes.flatMap((r) => r.validation),
      ...required
        .filter((t) => !input.tools.includes(t as Job["tools"][number]))
        .map((t) => `Missing tool: ${t}.`),
    ];
  if (pending.length)
    violations.push(
      `${pending.length} blank(s) do not fit compatible available card. Change dimensions or add matching stock.`,
    );
  const counts = new Map<string, number>();
  for (const s of sheets.filter((s) => s.source === "shop"))
    counts.set(s.lotId, (counts.get(s.lotId) || 0) + 1);
  const lines = [...counts].map(([itemId, units]) => {
    const m = stock.find((m) => m.id === itemId)!;
    return {
      itemId,
      name: m.name,
      units,
      unitPrice: m.price,
      total: m.price * units,
      revision: m.revision,
    };
  });
  const total = lines.reduce((n, l) => n + l.total, 0);
  const operations: Operation[] = [
    {
      id: "cut",
      name: `Cut ${sheets.reduce((n, s) => n + s.placements.length, 0)} blanks`,
      minutes: Math.ceil(
        3 + sheets.reduce((n, s) => n + s.placements.length, 0) * 0.45,
      ),
      predecessors: [],
      resources: ["maker", "cutter"],
    },
  ];
  for (const r of recipes) {
    let prev = "cut";
    if (r.folds.length) {
      operations.push({
        id: `score-${r.product.id}`,
        name: `Score ${r.product.name}`,
        minutes: Math.ceil(1 + r.folds.length * r.product.quantity * 0.2),
        predecessors: ["cut"],
        resources: ["maker"],
      });
      prev = `score-${r.product.id}`;
    }
    operations.push({
      id: `finish-${r.product.id}`,
      name: `${r.product.family === "flat" ? "Finish" : "Assemble"} ${r.product.name}`,
      minutes: Math.ceil(
        1 + r.product.quantity * (r.product.family === "sleeve" ? 1.5 : 0.5),
      ),
      predecessors: [prev],
      resources: ["maker"],
    });
  }
  const schedule = scheduleOperations(operations),
    minutes = operations.reduce((n, o) => n + o.minutes, 0);
  if (total > input.budget)
    violations.push(
      `Purchase exceeds budget by ${total - input.budget} cents.`,
    );
  if (minutes > input.availableMinutes)
    violations.push(
      `Hands-on estimate exceeds available time by ${minutes - input.availableMinutes} minutes.`,
    );
  const shopOnly = pack(recipes, input, stock, []),
    baselineAvailable = !shopOnly.pending.length;
  const shopCents = shopOnly.sheets.reduce(
    (n, s) => n + stock.find((m) => m.id === s.lotId)!.price,
    0,
  );
  const separate = recipes.reduce((n, r) => {
    const single = pack([r], input, stock, []);
    return n + single.sheets.length;
  }, 0);
  const area = sheets.reduce((n, s) => n + s.width * s.length, 0),
    used = sheets
      .flatMap((s) => s.placements)
      .reduce((n, p) => n + p.width * p.length, 0);
  return {
    version: 2,
    engine: ENGINE_VERSION,
    input,
    recipes,
    sheets,
    unplaced: pending.map((p) => p.id),
    violations,
    ready: violations.length === 0,
    lines,
    total,
    minutes,
    operations,
    schedule,
    usedOwned: sheets.filter((s) => s.source === "owned").length,
    usedShop: sheets.filter((s) => s.source === "shop").length,
    utilization: area ? used / area : 0,
    baseline: baselineAvailable
      ? { shopCents, separateSheets: separate }
      : null,
    cashAvoided: baselineAvailable ? shopCents - total : null,
    warnings: [
      "Prototype constructions: physically test a first sample.",
      "Rectangle packing is a heuristic, not a globally optimal layout.",
      "Hands-on estimates exclude adhesive drying; follow the adhesive instructions.",
      "Source colors follow the allocated sheets; a product may use different permitted colors.",
    ],
  };
}
export function manufacturingKit(plan: Plan, stock: Material[]): Kit {
  if (!plan.ready) throw Error(plan.violations.join(" "));
  // Legacy commerce envelope only: manufacturing views always render the frozen V2 recipe.
  const first = plan.recipes[0];
  return {
    schemaVersion: 1,
    manufacturing: plan,
    config: {
      templateId: "giftbox",
      width: 90,
      depth: 60,
      height: 35,
      materialId: plan.lines[0]?.itemId || "",
      ribbonId: "",
      quantity: 1,
    },
    template: {
      ...templates[0],
      title: plan.input.title,
      subtitle: "Mixed-product manufacturing job",
    },
    materials: stock.filter((m) => plan.lines.some((l) => l.itemId === m.id)),
    lines: plan.lines,
    subtotal: plan.total,
    preparation: 0,
    total: plan.total,
    currency: "USD",
    parts: [],
    cut: {
      width: first.blank.width,
      height: first.blank.length,
      rects: first.panels.map((p) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.length,
        label: p.label,
      })),
      folds: first.folds.map((y) => ({
        x1: 0,
        y1: y,
        x2: first.blank.width,
        y2: y,
      })),
    },
    finished: [first.product.width, first.product.length, first.product.depth],
    warnings: plan.warnings,
    stockReady: true,
  };
}
export function exampleJob(): Job {
  return {
    title: "Retail display sets",
    products: [
      {
        id: "holder",
        name: "Price-card holders",
        family: "folded",
        width: 80,
        length: 45,
        depth: 10,
        quantity: 12,
        hole: false,
      },
      {
        id: "tags",
        name: "Hang tags",
        family: "flat",
        width: 35,
        length: 60,
        depth: 5,
        quantity: 24,
        hole: true,
      },
      {
        id: "sleeves",
        name: "Product sleeves",
        family: "sleeve",
        width: 60,
        length: 40,
        depth: 15,
        quantity: 12,
        hole: false,
      },
    ],
    owned: [
      {
        id: "workshop-card",
        name: "Leftover card",
        type: "card",
        width: 200,
        length: 300,
        thickness: 1,
        quantity: 4,
        color: "#84996b",
      },
    ],
    ownedRevision: 0,
    tools: ["scissors", "ruler", "glue", "hole punch"],
    budget: 3000,
    availableMinutes: 180,
    thickness: 1,
    color: "#84996b",
    mixColors: true,
    rotate: true,
  };
}
