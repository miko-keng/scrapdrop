import type { Lesson, LessonKey, Settings } from "./types";
export const catalog: Lesson[] = [
  {
    key: "summarise-sales",
    title: "Find the story in your sales",
    short: "Summarise sales",
    description:
      "Turn a long list of sales into totals that actually tell you something.",
    minutes: 6,
    price: 200,
    color: "green",
    tag: "Group & summarise",
    outcome: "A clean sales summary, ready to download.",
    steps: [
      {
        title: "Meet your data",
        body: "Every row is one sale. To spot a pattern, we need to collect related rows and add their values. Think of it as sorting receipts into little piles.",
      },
      {
        title: "Make your first summary",
        body: "Choose what makes a pile: a product, a category, or a month. Then choose the number to add. The result updates as you explore.",
      },
      {
        title: "Make it yours",
        body: "Check your summary, answer one quick question, and download your result. You can use this same skill with another dataset.",
      },
    ],
    hints: [
      "The group is the thing you want a separate total for. Look for a product or category column.",
      "The measure is the number you want to add. For a sales total, use Sales, not Quantity.",
      "Choose Product as your group and Sales as your measure. Turn on monthly grouping if the task asks for months.",
    ],
    question: "What happens when you group by product?",
    answers: [
      "Each product gets its own total",
      "Every row becomes the same product",
      "Only the largest sale stays",
    ],
    correctAnswer: 0,
  },
  {
    key: "match-records",
    title: "Give your tables a connection",
    short: "Match records",
    description:
      "Bring the right details together without copying and pasting row by row.",
    minutes: 7,
    price: 200,
    color: "purple",
    tag: "Connect two tables",
    outcome: "Your original table, with the missing details added.",
    steps: [
      {
        title: "Find the common thread",
        body: "Two tables can describe different parts of the same thing. A product code can connect an order to its product name. That shared field is your key.",
      },
      {
        title: "Connect the dots",
        body: "Pick the key in each table, then the detail you want to bring across. A left lookup keeps every row in your original table—even when there is no match.",
      },
      {
        title: "Keep the useful details",
        body: "Check the connection, notice any unmatched rows, and export the combined table. One small skill; a lot less copy and paste.",
      },
    ],
    hints: [
      "Look for a value that identifies the same product in both tables.",
      "Choose Product code in both tables. The second table must have only one row per key.",
      "Bring Product name from the product table. An unmatched code should keep its original row, with an empty name.",
    ],
    question: "What happens to a row that has no matching key?",
    answers: [
      "It disappears",
      "It stays, with the new detail left empty",
      "It copies a random product",
    ],
    correctAnswer: 1,
  },
  {
    key: "flag-exceptions",
    title: "Make the important rows pop",
    short: "Spot exceptions",
    description:
      "Find low stock and unusual values with one clear, repeatable rule.",
    minutes: 5,
    price: 200,
    color: "orange",
    tag: "Highlight what matters",
    outcome: "A table with every matching row clearly flagged.",
    steps: [
      {
        title: "Choose what matters",
        body: "A good rule starts with a simple question. Which products are running low? Which values pass a threshold? Let the rule do the scanning for you.",
      },
      {
        title: "Give your rule a try",
        body: "Choose a numeric column, a comparison, and a threshold. Below 5 means 4 is flagged and 5 is not. Missing values stay unknown.",
      },
      {
        title: "Take your rule with you",
        body: "Check your flags, answer a quick question, and download your table. The export includes a flag column so the meaning travels with the data.",
      },
    ],
    hints: [
      "Choose the number you want to inspect. For low inventory, that is Stock.",
      "“Below 5” means less than 5, not less than or equal to 5.",
      "Set Stock → is below → 5. A missing stock value should be unknown, never assumed to be zero.",
    ],
    question:
      "Your rule is “stock below 5”. What happens to a stock value of 5?",
    answers: ["It gets flagged", "It is missing", "It does not get flagged"],
    correctAnswer: 2,
  },
];
export const getLesson = (key: string) => catalog.find((l) => l.key === key);
export const emptySettings: Settings = {
  group: "",
  measure: "",
  month: false,
  leftKey: "",
  rightKey: "",
  returnColumn: "",
  column: "",
  comparator: "lt",
  threshold: "5",
};
export const examples: { key: LessonKey; goal: string; label: string }[] = [
  {
    key: "summarise-sales",
    goal: "Show me total sales for each product.",
    label: "Summarise my sales",
  },
  {
    key: "match-records",
    goal: "Match product names to my orders using product codes.",
    label: "Connect two tables",
  },
  {
    key: "flag-exceptions",
    goal: "Flag products with stock below 5.",
    label: "Find low stock",
  },
];
