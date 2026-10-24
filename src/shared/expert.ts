import { Decimal } from "decimal.js";

export type QuoteInput = {
  project: string;
  client: string;
  rate: number;
  revisions: number;
  expenses: number;
  items: { name: string; hours: number }[];
};
export type ToolDefinition = {
  title: string;
  description: string;
  creator: string;
  defaultRate: number;
  includedRevisions: number;
  revisionHours: number;
  bufferPercent: number;
  explanations: {
    hours: string;
    rate: string;
    revisions: string;
    expenses: string;
    buffer: string;
  };
};
export type WorkedExample = {
  name: string;
  input: QuoteInput;
  expectedTotal: string;
};
export type ExpertTool = {
  id: string;
  version: number;
  definition: ToolDefinition;
  price: number;
  owned: boolean;
  source?: string;
};
export type QuoteResult = {
  lines: { label: string; amount: string }[];
  baseHours: string;
  extraRevisions: number;
  extraHours: string;
  subtotal: string;
  buffer: string;
  total: string;
};
export const currency = (n: string | number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(n),
  );
export const studioDefinition: ToolDefinition = {
  title: "The thoughtful project quote",
  description:
    "Give your creative work a price that leaves room to do it well.",
  creator: "TaskSlice Studio",
  defaultRate: 65,
  includedRevisions: 2,
  revisionHours: 3,
  bufferPercent: 10,
  explanations: {
    hours:
      "Break the project into deliverables. Estimate the time for each, including research and preparation.",
    rate: "Use your own working rate. This tool applies your numbers; it does not estimate a market rate.",
    revisions:
      "Two revision rounds are included in the estimated project hours. Every additional round adds three hours of work.",
    expenses:
      "Add direct project expenses at cost, such as licensed assets or print samples. These are separate from your time.",
    buffer:
      "A 10% contingency is added to labour to allow for uncertainty. Direct expenses are not marked up.",
  },
};
export const starterInput = (): QuoteInput => ({
  project: "Brand identity for Sunday Studio",
  client: "Sunday Studio",
  rate: 65,
  revisions: 3,
  expenses: 80,
  items: [
    { name: "Brand discovery", hours: 4 },
    { name: "Logo design", hours: 12 },
    { name: "Packaging concept", hours: 8 },
  ],
});
export const exampleBriefs = [
  {
    label: "Brand identity",
    brief:
      "Quote a brand identity project for Sunday Studio: brand discovery 4 hours, logo design 12 hours, packaging concept 8 hours. My rate is $65/hour, with 3 revision rounds and $80 in expenses.",
  },
  {
    label: "Website design",
    brief:
      "Quote a website for Fern Cafe: discovery 3 hours, homepage design 10 hours and mobile layouts 7 hours. My rate is $75/hour, 2 revisions and $50 in expenses.",
  },
];
export function calculateQuote(
  def: ToolDefinition,
  input: QuoteInput,
): QuoteResult {
  const finite = (n: number, max: number, name: string) => {
    if (!Number.isFinite(n) || n < 0 || n > max)
      throw new Error(
        `Check ${name}: use a non-negative number within the supported range.`,
      );
  };
  finite(input.rate, 10000, "hourly rate");
  finite(input.expenses, 1000000, "expenses");
  finite(input.revisions, 100, "revisions");
  finite(def.includedRevisions, 100, "included revisions");
  finite(def.revisionHours, 100, "revision hours");
  finite(def.bufferPercent, 100, "contingency");
  if (
    !Number.isInteger(input.revisions) ||
    !Number.isInteger(def.includedRevisions)
  )
    throw new Error("Revision rounds must be whole numbers.");
  if (!input.items.length || input.items.length > 20)
    throw new Error("Add between one and twenty deliverables.");
  const lines = input.items.map((item) => {
    finite(item.hours, 1000, "hours");
    if (!item.name.trim()) throw new Error("Name each deliverable.");
    return {
      label: item.name,
      amount: new Decimal(item.hours)
        .mul(input.rate)
        .toFixed(2, Decimal.ROUND_HALF_UP),
    };
  });
  const baseHours = input.items.reduce(
    (sum, item) => sum.add(item.hours),
    new Decimal(0),
  );
  const extraRevisions = Math.max(0, input.revisions - def.includedRevisions);
  const extraHours = new Decimal(extraRevisions).mul(def.revisionHours);
  const labour = lines
    .reduce((sum, line) => sum.add(line.amount), new Decimal(0))
    .add(extraHours.mul(input.rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  const buffer = labour
    .mul(def.bufferPercent)
    .div(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (extraRevisions)
    lines.push({
      label: `Additional revisions (${extraRevisions} × ${def.revisionHours}h)`,
      amount: extraHours.mul(input.rate).toFixed(2, Decimal.ROUND_HALF_UP),
    });
  return {
    lines,
    baseHours: baseHours.toString(),
    extraRevisions,
    extraHours: extraHours.toString(),
    subtotal: labour.toFixed(2, Decimal.ROUND_HALF_UP),
    buffer: buffer.toFixed(2),
    total: labour
      .add(buffer)
      .add(input.expenses)
      .toFixed(2, Decimal.ROUND_HALF_UP),
  };
}
export const starterExamples = (): WorkedExample[] => [
  {
    name: "Brand project, one extra revision",
    input: starterInput(),
    expectedTotal: "2010.50",
  },
  {
    name: "Small project, included revisions",
    input: {
      project: "Logo refresh",
      client: "Fern Cafe",
      rate: 50,
      revisions: 2,
      expenses: 25,
      items: [{ name: "Logo refresh", hours: 10 }],
    },
    expectedTotal: "575.00",
  },
];
export function checkExamples(def: ToolDefinition, examples: WorkedExample[]) {
  return examples.map((example) => {
    const actual = calculateQuote(def, example.input).total;
    const expected = new Decimal(example.expectedTotal);
    if (!expected.isFinite() || expected.isNegative())
      throw new Error("Expected totals must be valid positive amounts.");
    return {
      name: example.name,
      actual,
      expected: expected.toFixed(2),
      passed: expected.eq(actual),
    };
  });
}
