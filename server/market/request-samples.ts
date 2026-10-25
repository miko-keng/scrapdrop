import { renameImages, sampleImages } from "./files";
import { tools } from "../../src/market/model";

// Only bundled, non-personal sample files can be shared/replayed in a request.
export function snapshotSample(job: any) {
  if (!job.sampleInput || job.sampleInput.source !== "bundled-images")
    throw new Error(
      "Run the supplied image sample before attaching a reproducible example. Your uploads are not shared.",
    );
  return {
    source: "bundled-images",
    toolId: job.toolId,
    version: job.version,
    options: job.sampleInput.options,
    rows: job.rows,
    checks: job.checks,
  };
}
export function replaySample(snapshot: any, alternative?: "map-rename") {
  const tool = tools.find((t) => t.id === (alternative || snapshot.toolId));
  if (
    snapshot.source !== "bundled-images" ||
    !tool ||
    !["pattern-rename", "map-rename"].includes(tool.id)
  )
    throw new Error("This request has no supported replayable sample.");
  if (!alternative && tool.version !== snapshot.version)
    throw new Error(
      "The original tool version is unavailable. The saved result remains visible.",
    );
  if (alternative && snapshot.toolId !== "pattern-rename")
    throw new Error(
      "This example alternative is available for Pattern Rename requests.",
    );
  const start = performance.now();
  const options =
    tool.id === "pattern-rename"
      ? { ...snapshot.options, mapping: "", preserveFolders: false }
      : snapshot.options;
  const output = renameImages(tool.id, sampleImages(), options);
  return {
    kind: "files",
    toolId: tool.id,
    toolTitle: tool.title,
    version: tool.version,
    status: "succeeded",
    replay: true,
    elapsedMs: Math.max(1, Math.round(performance.now() - start)),
    rows: output.rows,
    checks: output.checks,
    unmatched: output.unmatched,
    unusedMappings: output.unusedMappings,
    artifacts: [],
  };
}
