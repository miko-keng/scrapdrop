import type { Kit, TemplateId } from "./model";
export function blankDimensions(
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

export function recipeCut(
  id: TemplateId,
  w: number,
  d: number,
  h: number,
): Kit["cut"] {
  const t = { id },
    fit = blankDimensions(id, w, d, h);
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
      ...[10, y + d].flatMap((ty) =>
        [x, x + w].map((tx) => ({ x1: tx, y1: ty, x2: tx, y2: ty + h })),
      ),
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
      { x1: 0, y1: 20, x2: fit.width, y2: 20 },
      { x1: 0, y1: fit.height - 20, x2: fit.width, y2: fit.height - 20 },
      { x1: 30, y1: 0, x2: 30, y2: fit.height },
      { x1: fit.width - 30, y1: 0, x2: fit.width - 30, y2: fit.height },
    ];
  } else
    rects = [
      { x: 0, y: 0, width: w, height: d, label: "Front" },
      { x: w + 10, y: 0, width: w, height: d, label: "Back" },
    ];
  return {
    width: fit.width,
    height: fit.height,
    rects,
    folds,
    holes:
      id === "bookmark"
        ? [
            { x: w / 2, y: 12, radius: 2 },
            { x: w + 10 + w / 2, y: 12, radius: 2 },
          ]
        : [],
  };
}
/** Rigid-panel hinges for the same gift-box net returned by recipeCut.
 * Dimensions describe fold centerlines; thickness/adhesive tolerances need a physical trial.
 */
export function giftBoxPanels(w: number, d: number, h: number) {
  type Panel = {
    id: string;
    parent: string;
    pivot: [number, number, number];
    size: [number, number, number];
    center: [number, number, number];
    axis: "x" | "z";
    angle: number;
    phase: number;
    offset?: number;
  };
  const panels: Panel[] = [
    {
      id: "back",
      parent: "base",
      pivot: [0, 0, -d / 2],
      size: [w, 0.7, h],
      center: [0, 0, -h / 2],
      axis: "x",
      angle: Math.PI / 2,
      phase: 3,
      offset: 0,
    },
    {
      id: "front",
      parent: "base",
      pivot: [0, 0, d / 2],
      size: [w, 0.7, h],
      center: [0, 0, h / 2],
      axis: "x",
      angle: -Math.PI / 2,
      phase: 3,
      offset: 1,
    },
    {
      id: "left",
      parent: "base",
      pivot: [-w / 2, 0, 0],
      size: [h, 0.7, d],
      center: [-h / 2, 0, 0],
      axis: "z",
      angle: -Math.PI / 2,
      phase: 3,
      offset: 2,
    },
    {
      id: "right",
      parent: "base",
      pivot: [w / 2, 0, 0],
      size: [h, 0.7, d],
      center: [h / 2, 0, 0],
      axis: "z",
      angle: Math.PI / 2,
      phase: 3,
      offset: 3,
    },
  ];
  for (const parent of ["back", "front"])
    for (const sign of [-1, 1])
      panels.push({
        id: parent + "-tab-" + sign,
        parent,
        pivot: [(sign * w) / 2, 0.4, parent === "back" ? -h / 2 : h / 2],
        size: [10, 0.55, h],
        center: [sign * 5, 0, 0],
        axis: "z",
        angle: (sign * Math.PI) / 2,
        phase: 4,
      });
  panels.push({
    id: "lid",
    parent: "front",
    pivot: [0, 0, h],
    size: [w, 0.7, d],
    center: [0, 0, d / 2],
    axis: "x",
    angle: -Math.PI / 2,
    phase: 5,
  });
  return panels;
}
export const recipeName = (id: TemplateId) =>
  ({
    giftbox: "gift box",
    wrap: "notebook wrap",
    bookmark: "layered bookmark",
  })[id];
export const RECIPE_VERSION = 1;
export type TutorialStep = {
  id: string;
  title: string;
  action: string;
  tools: string[];
  tip: string;
};
export function tutorialSteps(k: Kit): TutorialStep[] {
  const [w, d, h] = k.finished,
    f = blankDimensions(k.template.id, w, d, h),
    n = k.batch?.plan.quantity || k.config.quantity;
  const prep = `Make ${n} project${n === 1 ? "" : "s"} using the ${recipeName(k.template.id)} recipe at ${w} × ${d} × ${h} mm. Check your measured materials and tools. ${k.template.id === "wrap" ? "Bring your own notebook; it is not included." : ""}`;
  const cut =
    k.batch?.input.cuttingService && k.batch.plan.cuttingFee > 0
      ? `Check the shop’s precut ${f.width} × ${f.height} mm outer blanks. Still cut your owned sheets and all detailed outlines yourself. Keep unused material.`
      : `Mark ${f.width} × ${f.height} mm outer blanks using your measured sheet layouts, then cut the part outlines. Keep unused material.`;
  const rows =
    k.template.id === "giftbox"
      ? [
          [
            "Prepare your pieces",
            prep,
            "ruler",
            "Use a real ruler; screen and print scaling are not calibrated.",
          ],
          [
            "Cut the box net",
            cut,
            "scissors,ruler",
            "Keep all four glue tabs attached. Solid lines are cuts; dashed lines are folds.",
          ],
          [
            "Score the fold lines",
            `Mark the ${w} × ${d} mm base, ${h} mm walls, lid hinge and four 10 mm glue tabs. Score the dashed lines gently.`,
            "ruler",
            "Score the tab hinges too. Do not cut a fold line.",
          ],
          [
            "Raise the four walls",
            "Fold each wall to 90°. Keep the base flat and corners square. Follow the hinged motion.",
            "ruler",
            "Dry-fit the walls before gluing.",
          ],
          [
            "Join the corner tabs",
            "Turn the four tabs inward against the side walls. Apply suitable craft glue and hold the corners square.",
            "glue",
            "Follow the adhesive’s drying instructions. Drying time is extra.",
          ],
          [
            "Close the lid",
            "After the glue sets, fold the attached lid over the opening. Check that it closes without forcing it.",
            "",
            "If the lid catches, recheck fold positions before trimming anything.",
          ],
          [
            "Wrap and tie",
            `Cut ${f.ribbon} mm ribbon per box plus the cutting allowance in your layout. Follow the two wrapping directions and tie the ends.`,
            "scissors,ruler",
            "The ribbon route is illustrative, not a knot or tension simulation.",
          ],
          [
            "Check the batch",
            "Check the lid, tabs and ribbon. Count good and spoiled pieces and measure reusable offcuts.",
            "",
            "For a batch, group all cutting, then scoring, then assembly; keep one finished reference unit.",
          ],
        ]
      : k.template.id === "wrap"
        ? [
            [
              "Prepare your notebook",
              prep,
              "ruler",
              "Measure the actual notebook, not its packaging.",
            ],
            [
              "Cut the fabric",
              cut,
              "scissors,ruler",
              "The pattern includes 30 mm side pockets and 20 mm top and bottom hems.",
            ],
            [
              "Mark the folds",
              "Mark 30 mm in from each side and 20 mm from the top and bottom. Do not cut these fold lines.",
              "ruler",
              "Use removable fabric marks.",
            ],
            [
              "Fold the hems",
              "Turn both 20 mm edges inward; secure with suitable fabric glue. The usable height now matches the notebook.",
              "glue",
              "This illustrates folds, not fabric stretch or physics.",
            ],
            [
              "Form the pockets",
              "Turn the 30 mm side pockets inward. Secure the pocket edges, keeping the notebook removable.",
              "glue",
              "Do not glue the notebook into the wrap. Let the glue set.",
            ],
            [
              "Fit the notebook",
              "Slide the two covers into their pockets and fold around the measured spine.",
              "",
              "Check that the notebook opens without stretching the fabric.",
            ],
            [
              "Tie the closure",
              `Cut ${f.ribbon} mm ribbon per wrap and tie it around your notebook.`,
              "scissors,ruler",
              "The notebook is buyer-supplied.",
            ],
            [
              "Check the batch",
              "Inspect pocket adhesion, fit and closure. Count good and spoiled wraps.",
              "",
              "Group repeated operations; record drying time separately from hands-on time.",
            ],
          ]
        : [
            [
              "Prepare two layers",
              prep,
              "ruler",
              "Each bookmark uses two card strips.",
            ],
            [
              "Cut the strips",
              cut + ` Cut two ${w} × ${d} mm strips per bookmark.`,
              "scissors,ruler",
              "The 10 mm gap between strips is waste allowance.",
            ],
            [
              "Align the layers",
              "Dry-fit both strips so their long edges line up. No scoring or folds are required.",
              "ruler",
              "Keep the measured finished size.",
            ],
            [
              "Bond the layers",
              "Apply a thin, even layer of suitable glue, align the strips and press them flat.",
              "glue",
              "Let the adhesive set before punching.",
            ],
            [
              "Punch the hole",
              "Punch both bonded layers at the marked center, 12 mm from the top.",
              "hole punch,ruler",
              "Check the position before punching.",
            ],
            [
              "Thread the ribbon",
              `Cut ${f.ribbon} mm ribbon per bookmark and thread the illustrated loop through the hole.`,
              "scissors,ruler",
              "Leave enough ribbon to secure the loop.",
            ],
            [
              "Finish the ends",
              "Trim loose ribbon ends and inspect the glued edges.",
              "scissors",
              "Do not trim away the finished card dimensions.",
            ],
            [
              "Check the batch",
              "Count good and spoiled pieces and measure reusable offcuts.",
              "",
              "A progress tick is your own record, not an AI quality certificate.",
            ],
          ];
  return rows.map(([title, action, tools, tip], i) => ({
    id: ["prepare", "cut", "score", "fold", "glue", "close", "ribbon", "check"][
      i
    ],
    title,
    action,
    tools: tools ? tools.split(",") : [],
    tip,
  }));
}
export function validateRecipe(k: Kit) {
  const c = k.cut,
    errors: string[] = [];
  for (const r of c.rects)
    if (
      r.x < 0 ||
      r.y < 0 ||
      r.width <= 0 ||
      r.height <= 0 ||
      r.x + r.width > c.width + 0.001 ||
      r.y + r.height > c.height + 0.001
    )
      errors.push("Part outside blank: " + r.label);
  for (let i = 0; i < c.rects.length; i++)
    for (let j = i + 1; j < c.rects.length; j++) {
      const a = c.rects[i],
        b = c.rects[j];
      if (
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.001 &&
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.001
      )
        errors.push("Overlapping parts.");
    }
  for (const f of c.folds)
    if (
      [f.x1, f.x2].some((x) => x < 0 || x > c.width) ||
      [f.y1, f.y2].some((y) => y < 0 || y > c.height)
    )
      errors.push("Fold outside blank.");
  return { valid: !errors.length, errors, physicalTrial: "pending" as const };
}
