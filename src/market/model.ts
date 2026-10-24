export type Family = "batch-file-renaming" | "booking-pages" | "custom";
export type MarketTool = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  provider: string;
  family: Family;
  capabilities: string[];
  inputs: string[];
  outputs: string[];
  price: number;
  days: number;
  trialLimit: number;
  paidLimit: number;
  appUrl: string;
  previewUrl: string;
  reference: boolean;
  available: boolean;
  version: number;
  owned?: boolean;
  expires?: number;
  state?: string;
};
export const tools: MarketTool[] = [
  {
    id: "pattern-rename",
    title: "Pattern Rename",
    subtitle: "A little order for a lot of photos.",
    description:
      "Turn a messy image batch into a neatly named delivery. Set the event, date and sequence. Your original image bytes stay unchanged.",
    provider: "TaskSlice reference apps",
    family: "batch-file-renaming",
    capabilities: [
      "filename-pattern",
      "preserve-file-bytes",
      "sequence-numbers",
    ],
    inputs: ["image/jpeg", "image/png"],
    outputs: ["application/zip", "text/csv"],
    price: 500,
    days: 30,
    trialLimit: 3,
    paidLimit: 100,
    appUrl: "/apps/pattern-rename",
    previewUrl: "/tools/pattern-rename",
    reference: true,
    available: true,
    version: 1,
  },
  {
    id: "map-rename",
    title: "Map Rename",
    subtitle: "Your names. Your folders. All together.",
    description:
      "Rename by a CSV mapping or naming pattern, keep the folder structure, and inspect unmatched names before delivery.",
    provider: "TaskSlice reference apps",
    family: "batch-file-renaming",
    capabilities: [
      "filename-pattern",
      "preserve-file-bytes",
      "sequence-numbers",
      "folder-preservation",
      "csv-mapping",
    ],
    inputs: ["image/jpeg", "image/png"],
    outputs: ["application/zip", "text/csv"],
    price: 700,
    days: 30,
    trialLimit: 3,
    paidLimit: 100,
    appUrl: "/apps/map-rename",
    previewUrl: "/tools/map-rename",
    reference: true,
    available: true,
    version: 1,
  },
  {
    id: "booking-board",
    title: "Booking Board",
    subtitle: "Make room for your next good thing.",
    description:
      "Give a workshop a booking page. Set session capacity, take reservations and keep your attendee list in one place.",
    provider: "TaskSlice reference apps",
    family: "booking-pages",
    capabilities: [
      "session-capacity",
      "public-booking-page",
      "attendee-export",
      "duplicate-protection",
    ],
    inputs: ["session-details"],
    outputs: ["booking-page", "text/csv"],
    price: 900,
    days: 30,
    trialLimit: 1,
    paidLimit: 20,
    appUrl: "/apps/booking-board",
    previewUrl: "/tools/booking-board",
    reference: true,
    available: true,
    version: 1,
  },
];
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export type Problem = {
  family: Family;
  requirements: string[];
  clarification: string | null;
  source: "manual" | "fixture" | "ai" | "rules";
};
export function interpretRules(text: string): Problem {
  const rename = /renam|filename|photo|image|\bzip\b|folder/i.test(text),
    booking = /book|workshop|attendee|reserv|capacity|registration/i.test(text);
  return {
    family: rename
      ? "batch-file-renaming"
      : booking
        ? "booking-pages"
        : "custom",
    requirements: [
      ...(/folder|directory|directories/i.test(text)
        ? ["folder-preservation"]
        : []),
      ...(/\bcsv\b|mapping/i.test(text) ? ["csv-mapping"] : []),
    ],
    clarification:
      rename || booking
        ? null
        : "Choose a task family below, or tell us the input and result you need.",
    source: "rules",
  };
}
export function matchTools(problem: Problem, catalog: MarketTool[]) {
  // An unknown task family is not evidence that every custom website fits.
  if (problem.family === "custom") return [];
  return catalog
    .filter(
      (t) =>
        t.available &&
        t.family === problem.family &&
        problem.requirements.every((c) => t.capabilities.includes(c)),
    )
    .map((t) => ({
      ...t,
      fitReasons: [
        `Works with ${t.inputs.join(", ")}`,
        `Produces ${t.outputs.join(", ")}`,
        ...problem.requirements.map(
          (c) => `Supports ${c.replaceAll("-", " ")}`,
        ),
      ],
    }));
}
