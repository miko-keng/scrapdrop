let testTransport: typeof fetch | undefined;
let calls = 0;
export function setAITransportForTests(transport?: typeof fetch) {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Mock AI transport is test-only.");
  testTransport = transport;
}
export const aiMode = () => process.env.AI_MODE || "fixture";
export const isLiveAI = () =>
  !!testTransport || (aiMode() === "live" && !!process.env.GEMINI_API_KEY);
export const aiStatus = () => {
  const requested = Number(process.env.AI_TEST_REQUEST_BUDGET ?? 3);
  return {
    mode: aiMode(),
    liveRequests: calls,
    budget: Number.isFinite(requested)
      ? Math.min(3, Math.max(0, Math.floor(requested)))
      : 0,
  };
};
export async function aiFetch(url: string, init: RequestInit) {
  if (testTransport) return testTransport(url, init);
  if (!isLiveAI())
    throw new Error(
      "Live AI is disabled. Use the manual controls or fixture interpretation.",
    );
  if (
    process.env.NODE_ENV === "test" &&
    process.env.ALLOW_LIVE_AI_TESTS !== "true"
  )
    throw new Error("Live Gemini requests are blocked in routine tests.");
  const budget = aiStatus().budget;
  if (calls >= budget)
    throw new Error(
      "The three-request Gemini verification budget is exhausted. Use manual input.",
    );
  calls++;
  return fetch(url, init);
}
