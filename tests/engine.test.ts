import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, defaultSettings, sampleDatasets } from "../src/shared/data";
import { compute, settingsMatch, exportCSV } from "../src/shared/engine";
import { emptySettings } from "../src/shared/catalog";
test("CSV parser respects quoted fields and multiline values", () => {
  const d = parseCSV('Name,Value\n"a,b",2\n"two\nlines",3');
  assert.equal(d.rows[0].c0, "a,b");
  assert.equal(d.rows[1].c0, "two\nlines");
});
test("CSV rejects duplicate headers and inconsistent width", () => {
  assert.throws(() => parseCSV("A,A\n1,2"), /unique/);
  assert.throws(() => parseCSV("A,B\n1,2,3"), /number/);
});
test("preserves identifier leading zeros and rejects ambiguous date inference", () => {
  const d = parseCSV("Product code,Date,Sales\n0012,03/04/2026,2.50");
  assert.equal(d.columns[0].type, "text");
  assert.equal(d.columns[1].type, "text");
  assert.equal(d.rows[0].c0, "0012");
  assert.equal(d.warnings.length, 1);
});
test("decimal sums are exact and all-null groups remain unknown", () => {
  const d = parseCSV("Product,Sales\na,0.10\na,0.20\nb,");
  const r = compute([d], "summarise-sales", {
    ...emptySettings,
    group: "c0",
    measure: "c1",
  });
  assert.equal(r.rows[0]["Sales total"], "0.30");
  assert.equal(r.rows[1]["Sales total"], "");
  assert.equal(r.rows[1]["Excluded values"], "1");
});
test("month grouping uses actual dates and totals", () => {
  const ds = sampleDatasets("summarise-sales");
  const s = defaultSettings(ds, "summarise-sales", "total by month");
  const r = compute(ds, "summarise-sales", s);
  assert.equal(r.rows.length, 6);
  assert.equal(
    r.rows.find((x) => x.Month === "2026-10" && x.Product === "Notebook")?.[
      "Sales total"
    ],
    "60.00",
  );
});
test("lookup preserves unmatched rows and duplicate right keys are rejected", () => {
  const a = parseCSV("Code,Q\n001,2\n099,3");
  const b = parseCSV("Code,Name\n001,Book");
  const s = {
    ...emptySettings,
    leftKey: "c0",
    rightKey: "c0",
    returnColumn: "c1",
  };
  const r = compute([a, b], "match-records", s);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].Name, "Book");
  assert.equal(r.rows[1]["Match status"], "No match");
  assert.throws(
    () =>
      compute(
        [a, parseCSV("Code,Name\n001,Book\n001,Other")],
        "match-records",
        s,
      ),
    /more than one/,
  );
});
test("flag boundaries and missing values are distinct", () => {
  const d = parseCSV("Product,Stock\na,4\nb,5\nc,");
  const s = {
    ...emptySettings,
    column: "c1",
    comparator: "lt" as const,
    threshold: "5",
  };
  assert.deepEqual(
    compute([d], "flag-exceptions", s).rows.map((r) => r.Flag),
    ["Flagged", "Not flagged", "Unknown"],
  );
  assert.equal(
    compute([d], "flag-exceptions", { ...s, comparator: "lte" }).rows[1].Flag,
    "Flagged",
  );
});
test("flag output cannot overwrite an existing Flag column", () => {
  const d = parseCSV("Flag,Stock\nkeep,1");
  const r = compute([d], "flag-exceptions", { ...emptySettings, column: "c1" });
  assert.equal(r.rows[0].Flag, "keep");
  assert.equal(r.rows[0]["Flag (rule)"], "Flagged");
});
test("export escapes spreadsheet formulas and preserves negative numbers", () => {
  const out = exportCSV({
    headers: ["Value"],
    rows: [{ Value: "=SUM(A1:A4)" }, { Value: "-12.50" }, { Value: "+cmd" }],
    warnings: [],
  });
  assert.ok(out.includes("'=SUM"));
  assert.ok(out.includes("-12.50"));
  assert.ok(!out.includes("'-12.50"));
  assert.ok(out.includes("'+cmd"));
});
test("comparing numeric thresholds accepts equivalent decimal values", () => {
  assert.equal(
    settingsMatch(
      "flag-exceptions",
      { ...emptySettings, threshold: "5.0" },
      emptySettings,
    ),
    true,
  );
});
test("generated headings cannot collide with original grouping fields", () => {
  const d = parseCSV("Sales total,Sales\na,2\na,3");
  const r = compute([d], "summarise-sales", {
    ...emptySettings,
    group: "c0",
    measure: "c1",
  });
  assert.equal(r.headers.length, new Set(r.headers).size);
  assert.equal(r.rows[0]["Sales total"], "a");
  assert.equal(r.rows[0]["Sales total (sum)"], "5.00");
});
test("formula-like column headings are escaped on export too", () => {
  const csv = exportCSV({
    headers: ["=cmd"],
    rows: [{ "=cmd": "safe" }],
    warnings: [],
  });
  assert.ok(csv.startsWith("'=cmd"));
});
test("guided defaults respect an explicitly named category grouping", () => {
  const ds = sampleDatasets("summarise-sales");
  const settings = defaultSettings(
    ds,
    "summarise-sales",
    "Total sales by Category",
  );
  assert.equal(
    ds[0].columns.find((c) => c.id === settings.group)?.name,
    "Category",
  );
});
