import Papa from "papaparse";
import { PDFParse } from "pdf-parse";
import { imageSize } from "image-size";
import {
  fail,
  hash,
  uid,
  candidateSchema,
  mergeCandidates,
  type Product,
} from "./domain";
import { incident, save, tx, type DB } from "./store";

export function sourceList(db: DB, id: string) {
  return (
    db
      .prepare(
        "SELECT id,name,mime,hash,text,length(bytes) size FROM rc_sources WHERE incident=? ORDER BY rowid",
      )
      .all(id) as any[]
  ).map((source) => {
    const settings = db
      .prepare("SELECT value FROM rc_meta WHERE key=?")
      .get(`source:${source.id}`) as any;
    const metadata = settings ? JSON.parse(settings.value) : {};
    return {
      ...source,
      columnMapping: metadata.mapping || null,
      observedAt: metadata.observedAt || null,
      uploadedAt: metadata.uploadedAt || null,
    };
  });
}
export async function addSource(
  db: DB,
  id: string,
  input: { name: string; data: string },
) {
  const i = incident(db, id);
  if (!["draft", "live"].includes(i.state))
    fail("This incident is closing or closed.", 409);
  if (
    !input.name ||
    input.name.length > 160 ||
    !input.data ||
    input.data.length > 7_000_000
  )
    fail("Choose a supported file up to 5 MB.");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data))
    fail("Invalid file encoding.");
  const bytes = Buffer.from(input.data, "base64");
  if (bytes.length > 5 * 1024 * 1024 || !bytes.length)
    fail("Each source must be 1 byte to 5 MB.");
  const digest = hash(bytes);
  const dupe = db
    .prepare("SELECT id FROM rc_sources WHERE incident=? AND hash=?")
    .get(id, digest);
  if (dupe) return { duplicate: true, ...dupe };
  const list = sourceList(db, id);
  if (
    list.length >= 10 ||
    list.reduce((n, s) => n + s.size, 0) + bytes.length > 20 * 1024 * 1024
  )
    fail("Limit: 10 files and 20 MB per rescue shop.");
  let mime = "",
    text = "";
  if (bytes.subarray(0, 5).toString() === "%PDF-") {
    mime = "application/pdf";
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    try {
      const info = await parser.getInfo();
      if (info.total > 10) fail("Choose a PDF with at most 10 pages.");
      const result = await parser.getText();
      if (result.total > 10) fail("Choose a PDF with at most 10 pages.");
      text = result.pages
        .map((p: any) => `Page ${p.num}:\n${p.text}`)
        .join("\n");
    } finally {
      await parser.destroy();
    }
    if (text.length > 100000)
      fail("This PDF contains too much text. Import a smaller catalog.");
  } else if (
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
  ) {
    const dimensions = imageSize(bytes);
    if (
      !dimensions.width ||
      !dimensions.height ||
      dimensions.width * dimensions.height > 20000000
    )
      fail("Image must be at most 20 megapixels.");
    mime = bytes[0] === 137 ? "image/png" : "image/jpeg";
  } else if (/\.csv$/i.test(input.name)) {
    mime = "text/csv";
    text = bytes.toString("utf8");
    if (
      text.includes("\0") ||
      /[<>]/.test(text.slice(0, 80)) ||
      text.length > 500000
    )
      fail("This is not a supported text CSV.");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    if (parsed.errors.length || parsed.data.length > 501)
      fail("CSV must be readable and contain at most 500 product rows.");
  } else
    fail(
      "Supported sources: CSV, PDF, JPEG and PNG. File contents must match the format.",
    );
  const sid = uid("source");
  tx(db, () => {
    const latest = incident(db, id);
    if (!["draft", "live"].includes(latest.state))
      fail("This incident is closing or closed.", 409);
    db.prepare("INSERT INTO rc_sources VALUES(?,?,?,?,?,?,?)").run(
      sid,
      id,
      input.name,
      mime,
      digest,
      bytes,
      text,
    );
    db.prepare("INSERT OR REPLACE INTO rc_meta VALUES(?,?)").run(
      `source:${sid}`,
      JSON.stringify({ uploadedAt: new Date().toISOString() }),
    );
    latest.revision++;
    save(db, latest);
  });
  return { id: sid, duplicate: false };
}
export function csvCandidates(source: any): unknown[] {
  const parsed = Papa.parse<Record<string, string>>(source.text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (parsed.errors.length) return [];
  const rows: unknown[] = [];
  for (const [index, row] of parsed.data.entries()) {
    const get = (...keys: string[]) =>
      keys
        .map((k) =>
          row[source.columnMapping?.[k]?.trim().toLowerCase() || k]?.trim(),
        )
        .find(Boolean) || "";
    const sku = get("sku", "product_id", "product id"),
      name = get("name", "product", "product name", "title");
    if (!sku || !name) continue;
    const rawPrice = get("price", "unit_price", "unit price"),
      price = /^\d{1,6}(\.\d{1,2})?$/.test(rawPrice)
        ? Number(rawPrice).toFixed(2)
        : rawPrice;
    const excerpt = JSON.stringify(row);
    const candidates: any[] = [{ field: "name", value: name }];
    if (price) candidates.push({ field: "price", value: price });
    const currency = get("currency").toUpperCase();
    if (currency) candidates.push({ field: "currency", value: currency });
    const stock = get("stock", "quantity", "inventory");
    if (stock) candidates.push({ field: "stock", value: stock });
    rows.push({
      sku,
      name,
      description: get("description"),
      candidates: candidates.map((e) => ({
        ...e,
        sourceId: source.id,
        location: `Row ${index + 2}`,
        excerpt,
      })),
    });
  }
  return rows;
}
export function deterministicCandidates(sources: any[]): Product[] {
  const rows: unknown[] = sources
    .filter((s) => s.mime === "text/csv")
    .flatMap(csvCandidates);
  // A deliberately narrow parser for explicit catalog lines; all other prose stays unresolved.
  for (const s of sources.filter((s) => s.mime === "application/pdf")) {
    for (const [idx, line] of s.text.split("\n").entries()) {
      const m =
        /^([A-Za-z0-9_-]{2,80})\s*\|\s*([^|]+)\|\s*(\d+(?:\.\d{1,2})?)\s*\|\s*([A-Z]{3})\s*$/.exec(
          line.trim(),
        );
      if (!m) continue;
      rows.push({
        sku: m[1],
        name: m[2].trim(),
        description: "",
        candidates: [
          { field: "name", value: m[2].trim() },
          { field: "price", value: Number(m[3]).toFixed(2) },
          { field: "currency", value: m[4] },
        ].map((e) => ({
          ...e,
          sourceId: s.id,
          location: `PDF text line ${idx + 1}`,
          excerpt: line,
        })),
      });
    }
  }
  return mergeCandidates(rows);
}
function samplePDF(lines: string[]) {
  const stream =
    "BT /F1 12 Tf 40 760 Td " +
    lines
      .map(
        (l, i) =>
          (i ? "0 -24 Td " : "") + `(${l.replace(/[()\\]/g, "\\$&")}) Tj`,
      )
      .join("\n") +
    " ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, o] of objects.entries()) {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out +=
    `xref\n0 6\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}
export async function addSample(db: DB, id: string) {
  if (sourceList(db, id).length)
    fail("Start a new rescue shop to load the example.", 409);
  await addSource(db, id, {
    name: "sunday-stock-2026-10-26.csv",
    data: Buffer.from(
      "sku,name,price,currency,stock,description\nMUG-BLU,Blue mug,20.00,USD,8,A blue stoneware mug\nMUG-RED,Red mug,18.00,USD,5,A warm red stoneware mug\nTOTE-NAT,Natural tote,12.00,USD,4,An everyday cotton tote\n",
    ).toString("base64"),
  });
  await addSource(db, id, {
    name: "sunday-catalog-2026-10-10.pdf",
    data: samplePDF([
      "Sunday Studio - illustrative sample catalog",
      "Seller-provided date: 10 October 2026",
      "MUG-BLU | Blue mug | 18.00 | USD",
      "MUG-RED | Red mug | 18.00 | USD",
      "TOTE-NAT | Natural tote | 12.00 | USD",
    ]).toString("base64"),
  });
}
export function checkEvidence(products: unknown[], sources: any[]) {
  if (!products.length || products.length > 50)
    fail("Reconstruction must contain 1 to 50 supported variants.");
  return products.map((input) => {
    const p = candidateSchema.parse(input);
    if (
      p.imageSourceId &&
      !sources.some(
        (s) => s.id === p.imageSourceId && /^image\/(png|jpeg)$/.test(s.mime),
      )
    )
      fail("AI matched an image outside the supplied shop sources.");
    for (const e of p.candidates) {
      const source = sources.find((s) => s.id === e.sourceId);
      if (!source) fail("AI cited an unknown source.");
      if (!e.location.trim() || !e.excerpt.trim())
        fail("AI evidence needs a location and excerpt.");
      if (source.text) {
        const compact = (s: string) => s.replace(/\s+/g, " ").trim();
        const quoted = compact(e.excerpt);
        const text = compact(source.text);
        const csv =
          source.mime === "text/csv"
            ? csvCandidates(source).map((r: any) =>
                compact(r.candidates[0].excerpt),
              )
            : [];
        if (!text.includes(quoted) && !csv.some((s) => s.includes(quoted)))
          fail("AI excerpt does not appear in the uploaded source.");
        if (
          e.field === "price" &&
          (!/^\d+(?:\.\d{1,2})?$/.test(e.value) ||
            ![
              ...e.excerpt.matchAll(/(?<![\d.])\d+(?:\.\d{1,2})?(?![\d.])/g),
            ].some((m) => Number(m[0]) === Number(e.value)))
        )
          fail("AI price is not supported by its excerpt.");
      }
    }
    return p;
  });
}
