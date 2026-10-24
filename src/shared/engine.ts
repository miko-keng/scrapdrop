import { Decimal } from "decimal.js";
import Papa from "papaparse";
import type { Dataset, LessonKey, Settings, Result } from "./types";
import { isDecimal } from "./data";
export function compute(ds: Dataset[], key: LessonKey, s: Settings): Result {
  const a = ds[0];
  if (!a) throw new Error("Choose a dataset first.");
  const find = (id: string) => {
    const c = a.columns.find((c) => c.id === id);
    if (!c) throw new Error("Choose a valid column.");
    return c;
  };
  if (key === "summarise-sales") {
    const group = find(s.group),
      measure = find(s.measure);
    if (measure.type !== "decimal")
      throw new Error("Choose a numeric column to add.");
    const date = a.columns.find((c) => c.type === "date");
    if (s.month && !date)
      throw new Error(
        "Monthly grouping needs a date column in YYYY-MM-DD format.",
      );
    const map = new Map<
      string,
      {
        group: string;
        month: string;
        sum: Decimal;
        valid: number;
        excluded: number;
      }
    >();
    for (const r of a.rows) {
      const g = r[group.id] || "Missing value";
      const m = s.month
        ? (r[date!.id] || "").slice(0, 7) || "Missing date"
        : "";
      const k = JSON.stringify([r[group.id] || null, s.month ? m : null]);
      const item = map.get(k) || {
        group: g,
        month: m,
        sum: new Decimal(0),
        valid: 0,
        excluded: 0,
      };
      const v = r[measure.id];
      if (v && isDecimal(v)) {
        item.sum = item.sum.add(v);
        item.valid++;
      } else item.excluded++;
      map.set(k, item);
    }
    const groupName =
      s.month && group.name === "Month" ? "Month (group)" : group.name;
    const headers = [...(s.month ? ["Month"] : []), groupName];
    let totalName = `${measure.name} total`;
    while (headers.includes(totalName)) totalName += " (sum)";
    headers.push(totalName);
    let excludedName = "Excluded values";
    while (headers.includes(excludedName)) excludedName += " (count)";
    headers.push(excludedName);
    const rows = [...map.values()]
      .sort(
        (x, y) =>
          x.month.localeCompare(y.month) || x.group.localeCompare(y.group),
      )
      .map((v) => ({
        ...(s.month ? { Month: v.month } : {}),
        [groupName]: v.group,
        [totalName]: v.valid
          ? v.sum.toFixed(Math.max(2, v.sum.decimalPlaces()))
          : "",
        [excludedName]: String(v.excluded),
      }));
    const missing = [...map.values()].reduce((t, v) => t + v.excluded, 0);
    return {
      headers,
      rows,
      warnings: missing
        ? [
            `${missing} missing numeric value${missing === 1 ? " was" : "s were"} excluded. An empty total is unknown, not zero.`,
          ]
        : [],
    };
  }
  if (key === "match-records") {
    const b = ds[1];
    if (!b) throw new Error("Add a second CSV to connect your tables.");
    find(s.leftKey);
    const rk = b.columns.find((c) => c.id === s.rightKey);
    const ret = b.columns.find((c) => c.id === s.returnColumn);
    if (!rk || !ret)
      throw new Error(
        "Choose the matching key and the detail to bring across.",
      );
    const map = new Map<string, string>();
    for (const row of b.rows) {
      const k = row[rk.id];
      if (!k) continue;
      if (map.has(k))
        throw new Error(
          `The second table has more than one “${k}”. Use a unique key before matching.`,
        );
      map.set(k, row[ret.id]);
    }
    const used = new Set(a.columns.map((c) => c.name));
    let outName = ret.name;
    while (used.has(outName)) outName += " (matched)";
    let statusName = "Match status";
    while (used.has(statusName) || statusName === outName)
      statusName += " (lookup)";
    const headers = [...a.columns.map((c) => c.name), outName, statusName];
    let unmatched = 0;
    const rows = a.rows.map((row) => {
      const k = row[s.leftKey];
      const match = !!k && map.has(k);
      if (!match) unmatched++;
      return {
        ...Object.fromEntries(a.columns.map((c) => [c.name, row[c.id]])),
        [outName]: match ? map.get(k)! : "",
        [statusName]: match ? "Matched" : "No match",
      };
    });
    return {
      headers,
      rows,
      warnings: unmatched
        ? [
            `${unmatched} row${unmatched === 1 ? " has" : "s have"} no match. Your original rows are kept.`,
          ]
        : [],
    };
  }
  const col = find(s.column);
  if (col.type !== "decimal")
    throw new Error("Choose a numeric column for this rule.");
  if (!isDecimal(s.threshold))
    throw new Error("Enter a valid number for the threshold.");
  const t = new Decimal(s.threshold);
  const headers = [...a.columns.map((c) => c.name)];
  let flag = "Flag";
  while (headers.includes(flag)) flag += " (rule)";
  headers.push(flag);
  const rows = a.rows.map((r) => {
    const v = r[col.id];
    let answer = "Unknown";
    if (v && isDecimal(v)) {
      const d = new Decimal(v);
      answer = {
        lt: d.lt(t),
        lte: d.lte(t),
        eq: d.eq(t),
        gte: d.gte(t),
        gt: d.gt(t),
      }[s.comparator]
        ? "Flagged"
        : "Not flagged";
    }
    return {
      ...Object.fromEntries(a.columns.map((c) => [c.name, r[c.id]])),
      [flag]: answer,
    };
  });
  return {
    headers,
    rows,
    warnings: rows.some((r) => r[flag] === "Unknown")
      ? ["Missing values are marked Unknown. They are not assumed to be zero."]
      : [],
  };
}
export function settingsMatch(key: LessonKey, a: Settings, b: Settings) {
  const fields: (keyof Settings)[] =
    key === "summarise-sales"
      ? ["group", "measure", "month"]
      : key === "match-records"
        ? ["leftKey", "rightKey", "returnColumn"]
        : ["column", "comparator", "threshold"];
  return fields.every((k) =>
    k === "threshold"
      ? isDecimal(String(a[k])) && new Decimal(String(a[k])).eq(String(b[k]))
      : a[k] === b[k],
  );
}
function safeCell(v: string) {
  return /^[=+@\t\r]/.test(v) || (/^\s*[-=+@]/.test(v) && !isDecimal(v))
    ? `'${v}`
    : v;
}
export function exportCSV(result: Result) {
  return Papa.unparse({
    fields: result.headers.map(safeCell),
    data: result.rows.map((r) => result.headers.map((h) => safeCell(r[h]))),
  });
}
