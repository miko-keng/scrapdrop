export type LessonKey = "summarise-sales" | "match-records" | "flag-exceptions";
export type ColumnType = "text" | "decimal" | "date";
export type Column = { id: string; name: string; type: ColumnType };
export type Dataset = {
  id: string;
  name: string;
  columns: Column[];
  rows: Record<string, string>[];
  warnings: string[];
};
export type Settings = {
  group: string;
  measure: string;
  month: boolean;
  leftKey: string;
  rightKey: string;
  returnColumn: string;
  column: string;
  comparator: "lt" | "lte" | "eq" | "gte" | "gt";
  threshold: string;
};
export type Lesson = {
  key: LessonKey;
  title: string;
  short: string;
  description: string;
  minutes: number;
  price: number;
  color: string;
  tag: string;
  outcome: string;
  steps: { title: string; body: string }[];
  hints: string[];
  question: string;
  answers: string[];
  correctAnswer: number;
};
export type Task = {
  id: string;
  goal: string;
  lessonKey: LessonKey;
  summary: string;
  rationale: string;
  source: "guided" | "ai";
  datasets: Dataset[];
  expected: Settings;
  createdAt: string;
  clarification?: string;
  unsupported?: boolean;
};
export type Exercise = {
  id: string;
  task: Task;
  lessonKey: LessonKey;
  settings: Settings;
  step: number;
  revision: number;
  completed: boolean;
  answer: number | null;
  updatedAt: string;
  access: "demo" | "paypal";
  personalisation?: string;
};
export type Result = {
  headers: string[];
  rows: Record<string, string>[];
  warnings: string[];
};
export type Config = {
  mode: "demo" | "sandbox";
  paypalReady: boolean;
  paypalClientId: string | null;
  aiReady: boolean;
  csrf: string;
};
export type Order = {
  id: string;
  lessonKey: LessonKey;
  taskId: string;
  status: string;
  providerId: string | null;
  amount: number;
  access?: boolean;
};
