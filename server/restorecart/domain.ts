import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

export const uid = (prefix: string) => `${prefix}_${randomUUID()}`;
export const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
export const money = (n: number) => (n / 100).toFixed(2);
export function cents(v: unknown) {
  if (typeof v !== "string" || !/^\d{1,6}\.\d{2}$/.test(v))
    fail("Use a positive USD price such as 20.00.");
  const n = Math.round(Number(v) * 100);
  if (n <= 0 || n > 10000000) fail("Price must be between $0.01 and $100,000.");
  return n;
}
export const evidenceSchema = z
  .object({
    field: z.enum(["name", "price", "currency", "stock"]),
    value: z.string().max(500),
    sourceId: z.string().max(100),
    location: z.string().max(100),
    excerpt: z.string().max(1000),
  })
  .strict();
export const candidateSchema = z
  .object({
    sku: z.string().min(1).max(80),
    name: z.string().max(160),
    description: z.string().max(1000).default(""),
    candidates: z.array(evidenceSchema).max(100),
    imageSourceId: z.string().optional(),
  })
  .strict();
export type Evidence = z.infer<typeof evidenceSchema>;
export type Product = z.infer<typeof candidateSchema> & {
  price: string;
  currency: string;
  allocation: number;
  excluded: boolean;
  resolved: boolean;
  resolutionNote: string;
};
export type Incident = {
  id: string;
  name: string;
  slug: string;
  state: "draft" | "live" | "closing" | "closed";
  revision: number;
  products: Product[];
  pickup: string;
  originalUrl: string;
  published: null | {
    revision: number;
    products: Product[];
    pickup: string;
    name: string;
  };
  mode: string;
  run: any;
  created: number;
};
export function productIssues(p: Product) {
  const issues: string[] = [];
  if (!p.sku.trim() || !p.name.trim()) issues.push("Name and SKU are required");
  try {
    cents(p.price);
  } catch {
    issues.push("Choose a valid price");
  }
  if (p.currency !== "USD") issues.push("Confirm USD currency");
  if (!p.resolved) issues.push("Confirm source details");
  if (
    !Number.isInteger(p.allocation) ||
    p.allocation < 0 ||
    p.allocation > 10000
  )
    issues.push("Allocation must be a whole number from 0 to 10,000");
  return issues;
}
export function mergeCandidates(raw: unknown[]): Product[] {
  const products = new Map<string, Product>();
  for (const input of raw) {
    const row = candidateSchema.parse(input),
      key = row.sku.trim();
    let p = products.get(key);
    if (!p) {
      p = {
        ...row,
        sku: key,
        candidates: [],
        price: "",
        currency: "",
        allocation: 0,
        resolved: false,
        excluded: false,
        resolutionNote: "",
      };
      products.set(key, p);
    }
    for (const e of row.candidates)
      if (!p.candidates.some((v) => JSON.stringify(v) === JSON.stringify(e)))
        p.candidates.push(e);
    if (row.imageSourceId) p.imageSourceId = row.imageSourceId;
  }
  return [...products.values()].map((p) => {
    for (const field of ["price", "currency"] as const) {
      const values = [
        ...new Set(
          p.candidates.filter((e) => e.field === field).map((e) => e.value),
        ),
      ];
      if (values.length === 1) p[field] = values[0];
    }
    return p;
  });
}
export function safeCSV(rows: unknown[][]) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let s = String(value ?? "");
          if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
          return '"' + s.replaceAll('"', '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
}

export function salesReportCSV(report: any) {
  const rows: any[][] = [
    [
      "Record type",
      "Order ID",
      "SKU",
      "Product",
      "Quantity",
      "Unit price USD",
      "Captured USD",
      "Refunded USD",
      "Net USD",
      "Pickup status",
      "Stock set aside",
      "Stock remaining",
    ],
  ];
  for (const o of report.orders) {
    rows.push([
      "Order",
      o.id,
      "",
      "",
      "",
      "",
      money(o.amount),
      money(o.refunded),
      money(o.amount - o.refunded),
      o.fulfillment,
      "",
      "",
    ]);
    for (const l of o.lines)
      rows.push([
        "Item",
        o.id,
        l.sku,
        l.name || "",
        l.quantity,
        money(l.unitCents),
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
  }
  for (const stock of report.inventory)
    rows.push([
      "Stock",
      "",
      stock.sku,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      stock.allocated,
      stock.available,
    ]);
  rows.push([
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    money(report.totals.capturedCents),
    money(report.totals.refundedCents),
    money(report.totals.netCents),
    "",
    "",
    "",
  ]);
  return safeCSV(rows);
}
