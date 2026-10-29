import { useMemo, useState } from "react";
import { AgStudio } from "ag-studio-react";
import {
  createAiHarness,
  directLlmRunner,
  type AgLlmAdapter,
  type AgLlmResponse,
  type AgReportState,
  type AgStudioApi,
} from "ag-studio";
import { api } from "../../api";
import { AgStudioScope } from "../AgStudioScope";
export default function ProductionInsights({
  rows,
}: {
  rows: Record<string, any>[];
}) {
  const [failed, setFailed] = useState(false);
  const data = useMemo(
    () => ({
      sources: [
        {
          id: "production",
          name: "Production outcomes",
          description:
            "Authenticated manufacturing jobs. Estimate-only rows are not actual results.",
          data: rows,
          fields: [
            ...["job", "title", "status"].map((id) => ({
              id,
              format: "textFormat" as const,
            })),
            ...[
              "products",
              "ownedSheets",
              "purchasedSheets",
              "purchaseUSD",
              "cashAvoidedUSD",
              "utilizationPct",
              "estimatedMinutes",
              "actualMinutes",
              "good",
              "spoiled",
              "contributionUSD",
            ].map((id) => ({ id, format: "decimalFormat" as const })),
          ],
        },
      ],
    }),
    [rows],
  );
  const columns = [
    "title",
    "status",
    "products",
    "ownedSheets",
    "purchasedSheets",
    "purchaseUSD",
    "cashAvoidedUSD",
    "utilizationPct",
    "estimatedMinutes",
    "actualMinutes",
    "good",
    "spoiled",
    "contributionUSD",
  ];
  const initialState: AgReportState = useMemo(
    () => ({
      selectedPageId: "overview",
      pages: [
        {
          id: "overview",
          widgets: {
            time: {
              type: "column-chart-grouped",
              format: {
                title: {
                  enabled: true,
                  text: "Time: estimates versus recorded actuals",
                },
              },
              dataMapping: {
                categoryKey: [{ id: "production.title" }],
                valueKey: [
                  { id: "production.estimatedMinutes", aggregation: "sum" },
                  { id: "production.actualMinutes", aggregation: "sum" },
                ],
              },
            },
            output: {
              type: "column-chart-grouped",
              format: {
                title: {
                  enabled: true,
                  text: "Recorded good and spoiled units",
                },
              },
              dataMapping: {
                categoryKey: [{ id: "production.title" }],
                valueKey: [
                  { id: "production.good", aggregation: "sum" },
                  { id: "production.spoiled", aggregation: "sum" },
                ],
              },
            },
            outcomes: {
              type: "grid",
              format: {
                title: {
                  enabled: true,
                  text: "Estimated and actual production",
                },
              },
              dataMapping: {
                cols: columns.map((k) => ({ id: `production.${k}` })),
              },
            },
          },
          widgetLayout: {
            time: { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 4 },
            output: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 4 },
            outcomes: { xTrack: 0, yTrack: 4, xSpan: 12, ySpan: 5 },
          },
          layout: { columns: 12, rowHeight: 65 },
        },
      ],
    }),
    [],
  );
  const ai = useMemo(() => {
    const adapter: AgLlmAdapter = {
      executeTurn(request, options) {
        const last = [...request.input]
          .reverse()
          .find(
            (i) =>
              i.kind === "input" && i.type === "message" && i.role === "user",
          );
        const question =
          last && last.type === "message"
            ? last.content
                .filter((c) => c.type === "text")
                .map((c) => (c.type === "text" ? c.text : ""))
                .join(" ")
            : "";
        const id = crypto.randomUUID();
        const complete: Promise<AgLlmResponse> = api(
          "/scrapdrop/manufacturing/analytics/explain",
          {
            method: "POST",
            body: JSON.stringify({ question }),
            signal: options?.signal,
          },
        ).then((r) => ({
          id,
          createdAt: Date.now(),
          status: "completed",
          output: [
            {
              id,
              kind: "output",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "text",
                  text: `${r.source === "fixture" ? "Fixture demonstration · " : ""}${r.answer}\n\nEvidence: ${r.evidence.sampleCount} finalized job(s).`,
                  annotations: [],
                },
              ],
            },
          ],
        }));
        return {
          complete,
          stream: {
            async *[Symbol.asyncIterator]() {
              const response = await complete;
              const message = response.output[0];
              if (message.type === "message")
                yield {
                  type: "TEXT_MESSAGE_CHUNK" as const,
                  messageId: id,
                  role: "assistant" as const,
                  delta: message.content
                    .map((c) => (c.type === "text" ? c.text : ""))
                    .join(""),
                };
            },
          },
        };
      },
    };
    return ({ api }: { api: AgStudioApi }) =>
      createAiHarness(api, () => ({
        primary: "production",
        agents: [
          directLlmRunner({
            id: "production",
            name: "Production insights",
            maxTurns: 1,
            instructions: () =>
              "Answer from the server-authorized production projection only.",
            tools: () => [],
            adapter,
          }),
        ],
        promptStarters: [
          {
            label: "Time overruns",
            prompt: "Which recorded batches took longer than planned?",
          },
        ],
      }));
  }, []);
  if (failed)
    return (
      <p>
        The analytics panel could not initialize. Use the production table
        below.
      </p>
    );
  return (
    <AgStudioScope
      fallback={
        <p>
          AG Studio licence is not configured. The equivalent production table
          remains available below.
        </p>
      }
    >
      <AgStudio
        data={data}
        onErrorRaised={(event) => {
          if (event.fatal) setFailed(true);
        }}
        initialState={initialState}
        mode="edit"
        panels={{ edit: { right: ["ai", "data"] } }}
        ai={ai}
        loadThemeGoogleFonts={false}
        style={{ height: 650 }}
      />
    </AgStudioScope>
  );
}
