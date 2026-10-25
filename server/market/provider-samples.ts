import { z } from "zod";
import {
  sampleImages,
  renameImages,
  safePath,
  sha,
  csv,
  zip,
  type ImageInput,
} from "./files";
import type { MarketTool } from "../../src/market/model";

export const renameOptions = z.object({
  label: z.string().max(60).default("Wedding"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default("2026-10-25"),
  pattern: z.string().max(120).default("{label}_{date}_{seq}"),
  preserveFolders: z.boolean().default(true),
  mapping: z.string().max(30000).default(""),
});
export const imageBatch = z
  .array(
    z
      .object({
        name: z.string().max(180),
        type: z.enum(["image/png", "image/jpeg"]),
        data: z.string().max(2800000),
      })
      .strict(),
  )
  .min(1)
  .max(100);
export function providerOriginAllowed(raw: string, production: boolean) {
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash) return false;
    const configured = (process.env.PROVIDER_ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!production)
      configured.push(
        process.env.PROVIDER_REFERENCE_ORIGIN || "http://127.0.0.1:4418",
      );
    return (
      configured.includes(url.origin) &&
      (url.protocol === "https:" ||
        (!production && ["localhost", "127.0.0.1"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}
export async function boundedJSON(response: Response, max = 20 * 1024 * 1024) {
  if (Number(response.headers.get("content-length") || 0) > max)
    throw new Error("Provider response is too large.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Provider returned no body.");
  let count = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.length;
      if (count > max) throw new Error("Provider response is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export async function providerCall(
  origin: string,
  path: string,
  body: unknown,
) {
  const response = await fetch(new URL(path, new URL(origin).origin), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  const payload = await boundedJSON(response);
  return { response, payload };
}
// Inspect store-only ZIPs without extracting files. The v1 sample contract requires this format.
export function storedEntries(bytes: Buffer) {
  if (bytes.length < 22 || bytes.length > 16 * 1024 * 1024)
    throw new Error("Invalid provider ZIP size.");
  let offset = 0;
  const entries = new Map<string, Buffer>();
  while (
    offset + 30 <= bytes.length &&
    bytes.readUInt32LE(offset) === 0x04034b50
  ) {
    const flags = bytes.readUInt16LE(offset + 6),
      method = bytes.readUInt16LE(offset + 8),
      length = bytes.readUInt32LE(offset + 18),
      rawLength = bytes.readUInt32LE(offset + 22),
      nameLength = bytes.readUInt16LE(offset + 26),
      extraLength = bytes.readUInt16LE(offset + 28),
      start = offset + 30 + nameLength + extraLength,
      end = start + length;
    if (
      entries.size >= 101 ||
      method !== 0 ||
      (flags & ~0x800) !== 0 ||
      length !== rawLength ||
      end > bytes.length
    )
      throw new Error("Unsupported provider ZIP.");
    const name = safePath(
      bytes.subarray(offset + 30, offset + 30 + nameLength).toString(),
    );
    if (
      entries.has(name) ||
      [...entries.keys()].some((n) => n.toLowerCase() === name.toLowerCase())
    )
      throw new Error("Duplicate provider ZIP entry.");
    entries.set(name, bytes.subarray(start, end));
    offset = end;
  }
  const centralStart = offset;
  let centralCount = 0;
  while (
    offset + 46 <= bytes.length &&
    bytes.readUInt32LE(offset) === 0x02014b50
  ) {
    const nameLength = bytes.readUInt16LE(offset + 28),
      extraLength = bytes.readUInt16LE(offset + 30),
      commentLength = bytes.readUInt16LE(offset + 32),
      end = offset + 46 + nameLength + extraLength + commentLength;
    const mode = bytes.readUInt32LE(offset + 38) >>> 16;
    if (
      end > bytes.length ||
      ((mode & 0xf000) !== 0 && (mode & 0xf000) !== 0x8000)
    )
      throw new Error("Invalid provider ZIP attributes.");
    const name = bytes
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString();
    if (!entries.has(name)) throw new Error("Provider ZIP directory mismatch.");
    centralCount++;
    offset = end;
  }
  if (
    offset + 22 !== bytes.length ||
    bytes.readUInt32LE(offset) !== 0x06054b50 ||
    centralCount !== entries.size ||
    bytes.readUInt16LE(offset + 10) !== centralCount ||
    bytes.readUInt32LE(offset + 16) !== centralStart
  )
    throw new Error("Invalid provider ZIP directory.");
  // Re-encode checked entries with fresh trusted headers/CRCs; never serve the provider's raw ZIP metadata.
  const canonical = zip([...entries].map(([name, bytes]) => ({ name, bytes })));
  return { entries, canonical };
}
export function validateImageResult(payload: any, files: ImageInput[]) {
  const parsed = z
    .object({
      rows: z
        .array(
          z.object({
            oldName: z.string().max(180),
            newName: z.string().max(180),
          }),
        )
        .max(100),
      zip: z.string().max(23000000),
    })
    .parse(payload);
  const { entries, canonical } = storedEntries(
    Buffer.from(parsed.zip, "base64"),
  );
  if (parsed.rows.length !== files.length || entries.size !== files.length + 1)
    throw new Error("Provider output count does not match the input.");
  const seen = new Set<string>();
  const rows = parsed.rows.map((row, i) => {
    safePath(row.newName);
    if (row.oldName !== files[i].name || seen.has(row.newName.toLowerCase()))
      throw new Error(
        "Provider changed input order or returned colliding filenames.",
      );
    seen.add(row.newName.toLowerCase());
    if (
      row.newName.split(".").at(-1)?.toLowerCase() !==
      files[i].name.split(".").at(-1)?.toLowerCase()
    )
      throw new Error("Provider changed an image extension.");
    const source = Buffer.from(files[i].data, "base64"),
      output = entries.get(row.newName);
    if (!output || !source.equals(output))
      throw new Error("Provider changed or omitted image bytes.");
    return {
      ...row,
      bytes: source.length,
      inputHash: sha(source),
      outputHash: sha(output),
    };
  });
  const mapping = csv([
    ["oldName", "newName", "bytes", "sha256"],
    ...rows.map((r) => [r.oldName, r.newName, String(r.bytes), r.outputHash]),
  ]);
  if (entries.get("taskslice-mapping.csv")?.toString() !== mapping)
    throw new Error("Provider mapping does not describe the actual output.");
  return {
    rows,
    checks: {
      fileCount: rows.length,
      uniqueNames: true,
      extensionsPreserved: true,
      bytesPreserved: true,
    },
    zip: canonical,
    mapping,
    unmatched: [],
    unusedMappings: [],
  };
}
export async function runProviderSample(tool: MarketTool, options: unknown) {
  const input =
    tool.sampleContract === "image-rename-v1"
      ? { files: sampleImages(), options: renameOptions.parse(options) }
      : { capacity: 3, attempts: 4 };
  const { response, payload } = await providerCall(
    tool.appUrl,
    "/taskslice/trial",
    { contract: tool.sampleContract, input },
  );
  if (!response.ok)
    throw new Error(
      "Provider sample failed. Try again when its service is available.",
    );
  if (tool.sampleContract === "image-rename-v1")
    return { kind: "files", ...validateImageResult(payload, sampleImages()) };
  const booking = z
    .object({
      outcomes: z.tuple([
        z.literal(true),
        z.literal(true),
        z.literal(true),
        z.literal(false),
      ]),
    })
    .parse(payload);
  return {
    kind: "booking",
    capacity: 3,
    accepted: booking.outcomes.filter(Boolean).length,
    rejected: 1,
    checks: { capacityEnforced: true },
    note: "Provider capacity simulation; this does not create persistent reservations.",
  };
}
