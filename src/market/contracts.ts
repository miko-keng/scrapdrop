export const sampleContracts = {
  "image-rename-v1": {
    family: "batch-file-renaming",
    title: "Image renaming",
    sample: "3 PNGs in camera/ and portraits/ folders",
    inputs: ["image/jpeg", "image/png"],
    outputs: ["application/zip", "text/csv"],
  },
  "booking-capacity-v1": {
    family: "booking-pages",
    title: "Booking capacity",
    sample: "4 reservation attempts against 3 places",
    inputs: ["session-details"],
    outputs: ["booking-page", "text/csv"],
  },
} as const;
export type SampleContract = keyof typeof sampleContracts;
export function comparisonKey(tool: {
  available: boolean;
  sampleReady?: boolean;
  sampleContract?: SampleContract | null;
  family: string;
  inputs: string[];
  outputs: string[];
}) {
  const contract = tool.sampleContract && sampleContracts[tool.sampleContract];
  return tool.available &&
    tool.sampleReady === true &&
    contract &&
    tool.family === contract.family &&
    contract.inputs.every((input) => tool.inputs.includes(input)) &&
    contract.outputs.every((output) => tool.outputs.includes(output))
    ? tool.sampleContract
    : null;
}
export function canCompare(tools: Parameters<typeof comparisonKey>[0][]) {
  const key = tools.length && comparisonKey(tools[0]);
  return !!key && tools.every((tool) => comparisonKey(tool) === key);
}
