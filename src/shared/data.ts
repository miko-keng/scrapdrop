import Papa from "papaparse";
import { Decimal } from "decimal.js";
Decimal.set({ precision: 80 });
import type { Column, Dataset, LessonKey, Settings } from "./types";
import { emptySettings } from "./catalog";
const dateValid = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !isNaN(Date.parse(v + "T00:00:00Z")) &&
  new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
export const isDecimal = (v: string) =>
  v.length <= 60 &&
  /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v) &&
  new Decimal(v).isFinite();
export function parseCSV(
  text: string,
  name = "Your data.csv",
  id = "dataset",
): Dataset {
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024)
    throw new Error("This file is too large. Choose a CSV smaller than 2 MB.");
  const p = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  if (p.errors.length)
    throw new Error(
      "This CSV could not be read. Check the quotes and column separators.",
    );
  if (p.data.length < 2)
    throw new Error("Add a header and at least one row of data.");
  const heads = p.data[0].map((v) => v.trim());
  if (heads.length > 30 || p.data.length > 5001)
    throw new Error("For now, use up to 30 columns and 5,000 rows.");
  if (
    heads.some((v) => !v || v.length > 100) ||
    new Set(heads).size !== heads.length
  )
    throw new Error(
      "Give every column a unique, non-empty name (up to 100 characters).",
    );
  if (p.data.some((r) => r.length !== heads.length))
    throw new Error(
      "Some rows have a different number of columns. Please fix them before continuing.",
    );
  if (p.data.some((r) => r.some((v) => v.length > 2000)))
    throw new Error(
      "A cell is too long. Keep each cell under 2,000 characters.",
    );
  const warnings: string[] = [];
  const columns: Column[] = heads.map((name, i) => {
    const vals = p.data
      .slice(1)
      .map((r) => r[i].trim())
      .filter(Boolean);
    const isId =
      /(?:code|id|zip|phone|sku)/i.test(name) ||
      vals.some((v) => /^0\d/.test(v));
    const type =
      vals.length && !isId && vals.every(isDecimal)
        ? "decimal"
        : vals.length && vals.every(dateValid)
          ? "date"
          : "text";
    if (vals.some((v) => /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(v)))
      warnings.push(
        `${name}: dates need YYYY-MM-DD format before monthly grouping.`,
      );
    return { id: `c${i}`, name, type };
  });
  return {
    id,
    name,
    columns,
    rows: p.data
      .slice(1)
      .map((r) =>
        Object.fromEntries(columns.map((c, i) => [c.id, r[i].trim()])),
      ),
    warnings,
  };
}
const sales = `Order date,Product,Category,Quantity,Sales\n2026-10-01,Notebook,Stationery,2,24.00\n2026-10-02,Canvas tote,Accessories,1,28.00\n2026-10-03,Ceramic mug,Home,2,36.00\n2026-10-04,Notebook,Stationery,3,36.00\n2026-10-05,Canvas tote,Accessories,2,56.00\n2026-10-06,Ceramic mug,Home,1,18.00\n2026-11-01,Notebook,Stationery,1,12.00\n2026-11-02,Canvas tote,Accessories,1,28.00\n2026-11-03,Ceramic mug,Home,3,54.00`;
const orders = `Order,Product code,Quantity\nA-101,0012,2\nA-102,0013,1\nA-103,0014,3\nA-104,0012,1\nA-105,0099,2`;
const products = `Product code,Product name,Category\n0012,Notebook,Stationery\n0013,Canvas tote,Accessories\n0014,Ceramic mug,Home`;
const stock = `Product,Category,Stock,Reorder level\nNotebook,Stationery,3,5\nCanvas tote,Accessories,12,5\nCeramic mug,Home,4,5\nPencil set,Stationery,5,5\nDesk tray,Home,,5\nArt print,Decor,2,5`;
export function sampleDatasets(key: LessonKey): Dataset[] {
  return key === "match-records"
    ? [
        parseCSV(orders, "Orders.csv", "orders"),
        parseCSV(products, "Products.csv", "products"),
      ]
    : [
        parseCSV(
          key === "flag-exceptions" ? stock : sales,
          key === "flag-exceptions"
            ? "Studio inventory.csv"
            : "Little Studio sales.csv",
          "sample",
        ),
      ];
}
export function defaultSettings(
  ds: Dataset[],
  key: LessonKey,
  goal = "",
): Settings {
  const c = ds[0].columns;
  const col = (rx: RegExp, type?: string) =>
    c.find((x) => rx.test(x.name) && (!type || x.type === type))?.id || "";
  const numeric = c.find((x) => x.type === "decimal")?.id || "";
  const text = c.find((x) => x.type === "text")?.id || c[0]?.id || "";
  const s = {
    ...emptySettings,
    group: col(/product$|category|name/i, "text") || text,
    measure: col(/sales|revenue|amount|total/i, "decimal") || numeric,
    column: col(/stock|inventory|quantity/i, "decimal") || numeric,
    month: /month/i.test(goal),
  };
  const mentionedGroup = c.find(
    (x) =>
      x.type === "text" &&
      ["by ", "each ", "per "].some((prefix) =>
        goal.toLowerCase().includes(prefix + x.name.toLowerCase()),
      ),
  );
  if (mentionedGroup) s.group = mentionedGroup.id;
  if (ds[1]) {
    const right = ds[1].columns;
    const shared = c.find((a) =>
      right.some((b) => b.name.toLowerCase() === a.name.toLowerCase()),
    );
    s.leftKey = shared?.id || c[0].id;
    s.rightKey =
      right.find((x) => x.name.toLowerCase() === shared?.name.toLowerCase())
        ?.id || right[0].id;
    s.returnColumn =
      right.find((x) => /name/i.test(x.name) && x.id !== s.rightKey)?.id ||
      right.find((x) => x.id !== s.rightKey)?.id ||
      "";
  }
  const threshold = goal.match(
    /(?:below|under|less than|above|over|greater than|at least|at most|equal(?:s| to)?)\s*(-?\d+(?:\.\d+)?)/i,
  );
  if (threshold) s.threshold = threshold[1];
  if (/at least|greater than or equal|>=/i.test(goal)) s.comparator = "gte";
  else if (/at most|less than or equal|<=/i.test(goal)) s.comparator = "lte";
  else if (/above|over|greater than/i.test(goal)) s.comparator = "gt";
  else if (/equal/i.test(goal)) s.comparator = "eq";
  return s;
}
