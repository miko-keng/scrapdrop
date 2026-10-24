import { createHash } from "node:crypto";
import Papa from "papaparse";
export type ImageInput = { name: string; type: string; data: string };
export const sampleImages = () =>
  ["camera/IMG_1042.png", "camera/IMG_1081.png", "portraits/DSC_0024.png"].map(
    (name) => ({
      name,
      type: "image/png",
      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=",
    }),
  );
export const sha = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex");
export function safePath(name: string) {
  if (
    !name ||
    name.length > 180 ||
    name.startsWith("/") ||
    name.includes("\\") ||
    /[\x00-\x1f:]/.test(name) ||
    name.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new Error(
      "Use safe relative filenames without parent-directory paths.",
    );
  return name;
}
const cell = (s: string) =>
  '"' + (/^[=+@\-\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
export const csv = (rows: string[][]) =>
  rows.map((row) => row.map(cell).join(",")).join("\r\n");
const crc = (b: Buffer) => {
  let n = 0xffffffff;
  for (const v of b) {
    n ^= v;
    for (let k = 0; k < 8; k++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ 0xffffffff) >>> 0;
};
// Store-only ZIP: no decompression or uploaded archive execution.
export function zip(entries: { name: string; bytes: Buffer }[]) {
  let offset = 0;
  const local: Buffer[] = [],
    directory: Buffer[] = [];
  for (const entry of entries) {
    safePath(entry.name);
    const name = Buffer.from(entry.name),
      header = Buffer.alloc(30),
      central = Buffer.alloc(46),
      checksum = crc(entry.bytes);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(entry.bytes.length, 18);
    header.writeUInt32LE(entry.bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.bytes.length, 20);
    central.writeUInt32LE(entry.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    local.push(header, name, entry.bytes);
    directory.push(central, name);
    offset += header.length + name.length + entry.bytes.length;
  }
  const cd = Buffer.concat(directory),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
export function renameImages(
  toolId: string,
  files: ImageInput[],
  options: {
    label: string;
    date: string;
    preserveFolders: boolean;
    mapping: string;
    pattern?: string;
  },
) {
  const pattern = options.pattern || "{label}_{date}_{seq}";
  if (
    !pattern.includes("{seq}") ||
    !/^(?:[a-zA-Z0-9_-]|\{(?:label|date|seq)\}){1,100}$/.test(pattern)
  )
    throw new Error(
      "Pattern must include {seq}; use letters, numbers, dashes, underscores, {label}, {date} and {seq}.",
    );
  const map = new Map<string, string>();
  if (options.mapping) {
    if (toolId !== "map-rename")
      throw new Error("CSV mappings need Map Rename.");
    const parsed = Papa.parse<Record<string, string>>(options.mapping, {
      header: true,
      skipEmptyLines: true,
    });
    if (
      parsed.errors.length ||
      !["oldName", "newName"].every((k) => parsed.meta.fields?.includes(k))
    )
      throw new Error("Mapping CSV needs oldName,newName headers.");
    for (const row of parsed.data) {
      if (map.has(row.oldName))
        throw new Error("Duplicate names in mapping CSV.");
      map.set(safePath(row.oldName), safePath(row.newName));
    }
  }
  const names = new Set<string>(),
    sourceNames = new Set<string>();
  let totalBytes = 0;
  const entries: { name: string; bytes: Buffer }[] = [],
    rows: any[] = [];
  files.forEach((file, i) => {
    safePath(file.name);
    if (sourceNames.has(file.name))
      throw new Error("Input filenames must be unique.");
    sourceNames.add(file.name);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data) || file.data.length % 4 !== 0)
      throw new Error("Invalid image encoding.");
    const bytes = Buffer.from(file.data, "base64");
    totalBytes += bytes.length;
    if (bytes.length > 2 * 1024 * 1024 || totalBytes > 12 * 1024 * 1024)
      throw new Error("Images must be at most 2 MB each and 12 MB in total.");
    const png = bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpg)
      throw new Error("Only JPEG and PNG image bytes are supported.");
    if (
      (png && file.type !== "image/png") ||
      (jpg && file.type !== "image/jpeg")
    )
      throw new Error("Image type does not match its contents.");
    const extension = png
      ? ".png"
      : /\.jpeg$/i.test(file.name)
        ? ".jpeg"
        : ".jpg";
    if (!(png ? /\.png$/i : /\.jpe?g$/i).test(file.name))
      throw new Error("Image extension does not match its contents.");
    const label =
      options.label
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-|-$/g, "") || "event";
    const folder =
      toolId === "map-rename" &&
      options.preserveFolders &&
      file.name.includes("/")
        ? file.name.slice(0, file.name.lastIndexOf("/") + 1)
        : "";
    let target =
      map.get(file.name) ||
      `${folder}${pattern
        .replaceAll("{label}", label)
        .replaceAll("{date}", options.date)
        .replaceAll("{seq}", String(i + 1).padStart(3, "0"))}${extension}`;
    safePath(target);
    if (!target.toLowerCase().endsWith(extension))
      throw new Error("Mappings must preserve the image extension.");
    if (names.has(target.toLowerCase()))
      throw new Error(
        "Output filenames collide. Edit the mapping to use unique names.",
      );
    names.add(target.toLowerCase());
    entries.push({ name: target, bytes });
    rows.push({
      oldName: file.name,
      newName: target,
      bytes: bytes.length,
      inputHash: sha(bytes),
      outputHash: sha(bytes),
      mapped: map.has(file.name),
    });
  });
  const mapping = csv([
    ["oldName", "newName", "bytes", "sha256"],
    ...rows.map((r) => [r.oldName, r.newName, String(r.bytes), r.outputHash]),
  ]);
  return {
    rows,
    unmatched: map.size
      ? rows.filter((r) => !r.mapped).map((r) => r.oldName)
      : [],
    unusedMappings: [...map.keys()].filter((n) => !sourceNames.has(n)),
    checks: {
      fileCount: rows.length,
      uniqueNames: true,
      extensionsPreserved: true,
      bytesPreserved: rows.every((r) => r.inputHash === r.outputHash),
    },
    zip: zip([
      ...entries,
      { name: "taskslice-mapping.csv", bytes: Buffer.from(mapping) },
    ]),
    mapping,
  };
}
