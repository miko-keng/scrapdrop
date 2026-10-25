import { z } from "zod";
export type Material = {
  id: string;
  name: string;
  type: "card" | "fabric" | "ribbon";
  color: string;
  shade: string;
  width: number;
  length: number;
  thickness: number;
  quantity: number;
  available: number;
  price: number;
  revision: number;
  active: boolean;
  confirmed: boolean;
  imageId?: string | null;
  sample: boolean;
};
export const templates = [
  {
    id: "giftbox",
    version: 1,
    title: "The little gift box",
    subtitle: "A thoughtful home for something small.",
    type: "card",
    minutes: 25,
    tools: ["scissors", "ruler", "glue"],
    defaults: { width: 90, depth: 60, height: 35 },
    labels: ["Width", "Depth", "Height"],
    guide: [
      "Mark and cut the supplied card using the measured cutting diagram.",
      "Score the dashed fold lines with a ruler. Fold the base and walls inward.",
      "Glue the corner tabs and let them set. Fold the attached lid over.",
      "Wrap the supplied ribbon around the box and tie it. Keep unused material for another project.",
    ],
  },
  {
    id: "wrap",
    version: 1,
    title: "A fresh chapter",
    subtitle: "Give your own notebook a new favorite cover.",
    type: "fabric",
    minutes: 20,
    tools: ["scissors", "ruler", "glue"],
    defaults: { width: 100, depth: 145, height: 12 },
    labels: ["Book width", "Book height", "Spine"],
    guide: [
      "Bring your own notebook at the exact dimensions selected. The notebook is not included.",
      "Cut the fabric rectangle shown in the cutting diagram; keep the remaining fabric.",
      "Fold the side pockets around the cover. Use suitable craft glue on the pockets, keeping the notebook removable.",
      "Let the glue dry, insert the notebook and tie the supplied ribbon around it.",
    ],
  },
  {
    id: "bookmark",
    version: 1,
    title: "Save your place",
    subtitle: "A tiny gift for the next great read.",
    type: "card",
    minutes: 15,
    tools: ["scissors", "ruler", "glue", "hole punch"],
    defaults: { width: 40, depth: 140, height: 2 },
    labels: ["Width", "Length", "Layer thickness"],
    guide: [
      "Cut two strips from the supplied card using the layout.",
      "Glue the two layers together and allow to dry.",
      "Punch the marked hole and loop the ribbon through it.",
      "Trim the ribbon ends. Keep the unused card and ribbon.",
    ],
  },
] as const;
export type TemplateId = (typeof templates)[number]["id"];
export const configSchema = z
  .object({
    templateId: z.enum(["giftbox", "wrap", "bookmark"]),
    width: z.number().int().min(25).max(200),
    depth: z.number().int().min(30).max(240),
    height: z.number().min(0.1).max(80),
    materialId: z.string().min(1).max(100),
    ribbonId: z.string().min(1).max(100),
    quantity: z.number().int().min(1).max(6),
  })
  .strict();
export type KitConfig = z.infer<typeof configSchema>;
export type Part = {
  id: string;
  label: string;
  stockId: string | null;
  color: string;
  size: [number, number, number];
  position: [number, number, number];
  exploded: [number, number, number];
  context?: boolean;
};
export type Kit = {
  schemaVersion: 1;
  fulfillmentTerms?: {
    pickupSlotId: string;
    label: string;
    starts: number;
    ends: number;
    location: string;
  };
  config: KitConfig;
  template: (typeof templates)[number];
  materials: Material[];
  lines: {
    itemId: string;
    name: string;
    units: number;
    unitPrice: number;
    total: number;
    revision: number;
  }[];
  subtotal: number;
  preparation: number;
  total: number;
  currency: "USD";
  parts: Part[];
  cut: {
    width: number;
    height: number;
    rects: {
      x: number;
      y: number;
      width: number;
      height: number;
      label: string;
    }[];
    folds: { x1: number; y1: number; x2: number; y2: number }[];
    holes?: { x: number; y: number; radius: number }[];
  };
  finished: [number, number, number];
  warnings: string[];
  stockReady: boolean;
};
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export function materialFit(
  templateId: TemplateId,
  w: number,
  d: number,
  h: number,
) {
  if (templateId === "giftbox")
    return {
      width: w + 2 * h + 20,
      height: 2 * d + 3 * h + 20,
      ribbon: 2 * w + 2 * d + 4 * h + 120,
    };
  if (templateId === "wrap")
    return {
      width: 2 * w + h + 60,
      height: d + 40,
      ribbon: 2 * d + 2 * h + 150,
    };
  return { width: 2 * w + 10, height: d + 10, ribbon: 200 };
}
export function buildKit(
  raw: unknown,
  inventory: Material[],
  checkStock = true,
): Kit {
  const config = configSchema.parse(raw),
    { width: w, depth: d, height: inputHeight, quantity: q } = config,
    t = templates.find((t) => t.id === config.templateId)!;
  let h = inputHeight;
  if (t.id === "giftbox" && h < 20)
    throw Error("This box needs a height of at least 20 mm.");
  if (t.id === "wrap" && (h > 30 || h < 5))
    throw Error("Choose a notebook spine between 5 and 30 mm.");

  const m = inventory.find((m) => m.id === config.materialId),
    r = inventory.find((m) => m.id === config.ribbonId);
  if (!m || !r || !m.active || !r.active || !m.confirmed || !r.confirmed)
    throw Error("Choose confirmed, available materials.");
  if (m.type !== t.type || r.type !== "ribbon")
    throw Error("That material is not compatible with this project.");
  if (m.thickness > 1.5 || r.thickness > 2)
    throw Error(
      "These recipes support sheet thickness up to 1.5 mm and ribbon up to 2 mm.",
    );
  if (r.width > w / 2)
    throw Error("This ribbon is too wide for the selected project.");
  if (t.id === "bookmark") {
    h = Number((2 * m.thickness).toFixed(2));
    config.height = h;
  }
  const fit = materialFit(t.id, w, d, h);
  if (!(
    (fit.width <= m.width && fit.height <= m.length) ||
    (fit.height <= m.width && fit.width <= m.length)
  ))
    throw Error(
      `This design needs a usable ${fit.width} × ${fit.height} mm rectangle. Choose a larger piece or a smaller design.`,
    );
  if (r.length < fit.ribbon)
    throw Error(
      `This design needs a ribbon segment of at least ${fit.ribbon} mm.`,
    );
  const stockReady = m.available >= q && r.available >= q;
  if (checkStock && !stockReady)
    throw Error(
      "One of these materials has sold out or is reserved. Choose another shade or fewer kits.",
    );
  const parts: Part[] = [];
  const add = (
    id: string,
    label: string,
    size: Part["size"],
    position: Part["position"],
    exploded: Part["exploded"],
    stockId = m.id,
    color = m.color,
    context = false,
  ) =>
    parts.push({
      id,
      label,
      size,
      position,
      exploded,
      stockId: context ? null : stockId,
      color,
      context,
    });
  if (t.id === "giftbox") {
    add("base", "Card · base", [w, m.thickness, d], [0, 0, 0], [0, -45, 0]);
    add(
      "front",
      "Card · front",
      [w, h, m.thickness],
      [0, h / 2, d / 2],
      [0, h / 2, d / 2 + 45],
    );
    add(
      "back",
      "Card · back",
      [w, h, m.thickness],
      [0, h / 2, -d / 2],
      [0, h / 2, -d / 2 - 45],
    );
    add(
      "left",
      "Card · left side",
      [m.thickness, h, d],
      [-w / 2, h / 2, 0],
      [-w / 2 - 45, h / 2, 0],
    );
    add(
      "right",
      "Card · right side",
      [m.thickness, h, d],
      [w / 2, h / 2, 0],
      [w / 2 + 45, h / 2, 0],
    );
    add(
      "lid",
      "Card · lid",
      [w + 2, m.thickness, d + 2],
      [0, h + 1, 0],
      [0, h + 70, 0],
    );
    add(
      "ribbon",
      "Ribbon · finishing band",
      [r.width, r.thickness, d + 5],
      [0, h + 2, 0],
      [0, h + 100, 0],
      r.id,
      r.color,
    );
    add(
      "ribbon-front",
      "Ribbon · band front",
      [r.width, h, r.thickness],
      [0, h / 2, d / 2 + 1],
      [0, h / 2, d / 2 + 75],
      r.id,
      r.color,
    );
  } else if (t.id === "wrap") {
    add(
      "book",
      "Your notebook · not included",
      [w - 4, d - 4, h - 2],
      [0, d / 2, 0],
      [0, d / 2, 0],
      m.id,
      "#eae4d8",
      true,
    );
    add(
      "front",
      "Fabric · front cover",
      [w, d, m.thickness],
      [0, d / 2, h / 2 + 1],
      [0, d / 2, h / 2 + 45],
    );
    add(
      "back",
      "Fabric · back cover",
      [w, d, m.thickness],
      [0, d / 2, -h / 2 - 1],
      [0, d / 2, -h / 2 - 45],
    );
    add(
      "spine",
      "Fabric · spine",
      [m.thickness, d, h],
      [-w / 2, d / 2, 0],
      [-w / 2 - 40, d / 2, 0],
    );
    add(
      "ribbon",
      "Ribbon · closure",
      [r.width, d + 2, r.thickness],
      [w / 4, d / 2, h / 2 + 2],
      [w / 4, d / 2, h / 2 + 75],
      r.id,
      r.color,
    );
  } else {
    add(
      "back",
      "Card · back layer",
      [w, d, m.thickness],
      [0, d / 2, -m.thickness / 2],
      [0, d / 2, -25],
    );
    add(
      "front",
      "Card · front layer",
      [w, d, m.thickness],
      [0, d / 2, m.thickness / 2],
      [0, d / 2, 25],
    );
    add(
      "ribbon",
      "Ribbon · tassel",
      [r.width, 55, r.thickness],
      [0, d + 20, 0],
      [0, d + 55, 0],
      r.id,
      r.color,
    );
  }
  const lines = [m, r].map((item) => ({
    itemId: item.id,
    name: item.name,
    units: q,
    unitPrice: item.price,
    total: item.price * q,
    revision: item.revision,
  }));
  const subtotal = lines.reduce((s, l) => s + l.total, 0),
    preparation = 150 * q;
  let rects: Kit["cut"]["rects"],
    folds: Kit["cut"]["folds"] = [];
  if (t.id === "giftbox") {
    const x = h + 10,
      y = h + 10;
    rects = [
      { x, y, width: w, height: d, label: "Base" },
      { x, y: 10, width: w, height: h, label: "Back" },
      { x, y: y + d, width: w, height: h, label: "Front" },
      { x: 10, y, width: h, height: d, label: "Left" },
      { x: x + w, y, width: h, height: d, label: "Right" },
      { x, y: y + d + h, width: w, height: d, label: "Lid" },
      { x: x - 10, y: y + d, width: 10, height: h, label: "Glue tab" },
      { x: x + w, y: y + d, width: 10, height: h, label: "Glue tab" },
      { x: x - 10, y: 10, width: 10, height: h, label: "Glue tab" },
      { x: x + w, y: 10, width: 10, height: h, label: "Glue tab" },
    ];
    folds = [
      { x1: x, y1: y, x2: x + w, y2: y },
      { x1: x, y1: y + d, x2: x + w, y2: y + d },
      { x1: x, y1: y, x2: x, y2: y + d },
      { x1: x + w, y1: y, x2: x + w, y2: y + d },
      { x1: x, y1: y + d + h, x2: x + w, y2: y + d + h },
    ];
  } else if (t.id === "wrap") {
    rects = [
      {
        x: 0,
        y: 0,
        width: fit.width,
        height: fit.height,
        label: "Fabric wrap · includes pockets",
      },
    ];
    folds = [
      { x1: 30, y1: 0, x2: 30, y2: fit.height },
      { x1: fit.width - 30, y1: 0, x2: fit.width - 30, y2: fit.height },
    ];
  } else
    rects = [
      { x: 0, y: 0, width: w, height: d, label: "Front" },
      { x: w + 10, y: 0, width: w, height: d, label: "Back" },
    ];
  return {
    schemaVersion: 1,
    config,
    template: t,
    materials: [m, r],
    lines,
    subtotal,
    preparation,
    total: subtotal + preparation,
    currency: "USD",
    parts,
    cut: {
      width: fit.width,
      height: fit.height,
      rects,
      folds,
      holes:
        t.id === "bookmark"
          ? [
              { x: w / 2, y: 12, radius: 2 },
              { x: w + 10 + w / 2, y: 12, radius: 2 },
            ]
          : [],
    },
    finished: [w, d, h],
    warnings:
      t.id === "wrap"
        ? [
            "Bring your own notebook. It is not included.",
            "Allow extra drying time after gluing.",
          ]
        : ["Bring your own listed tools. Allow glue to dry."],
    stockReady,
  };
}
export function defaultConfig(
  id: TemplateId,
  inventory: Material[],
): KitConfig {
  const t = templates.find((t) => t.id === id)!;
  return {
    templateId: id,
    ...t.defaults,
    materialId:
      inventory.find(
        (m) => m.type === t.type && m.active && m.confirmed && m.available > 0,
      )?.id || "",
    ribbonId:
      inventory.find(
        (m) =>
          m.type === "ribbon" && m.active && m.confirmed && m.available > 0,
      )?.id || "",
    quantity: 1,
  };
}
