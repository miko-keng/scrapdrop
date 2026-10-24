import { test } from "node:test";
import assert from "node:assert/strict";
import { getLesson } from "../src/shared/catalog";
const base = process.env.TEST_BASE_URL;
async function client() {
  let cookie = "";
  let csrf = "";
  return {
    async call(path: string, method = "GET", body?: unknown) {
      const r = await fetch(base + path, {
        method,
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
          Origin: base!,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const set = r.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      const data = r.headers.get("content-type")?.includes("json")
        ? await r.json()
        : await r.text();
      if (path === "/api/config") csrf = data.csrf;
      return { status: r.status, data };
    },
  };
}
test(
  "HTTP: all three sample journeys, access checks, persisted progress and CSV export",
  { skip: !base },
  async () => {
    const a = await client();
    const b = await client();
    await a.call("/api/config");
    await b.call("/api/config");
    for (const [sampleKey, goal] of [
      ["summarise-sales", "Show total sales for each product."],
      ["match-records", "Match product names to orders."],
      ["flag-exceptions", "Flag stock below 5."],
    ]) {
      const taskRes = await a.call("/api/tasks", "POST", { sampleKey, goal });
      assert.equal(taskRes.status, 200);
      const task = taskRes.data;
      assert.ok(!task.clarification && !task.unsupported);
      const other = await b.call("/api/tasks/" + task.id);
      assert.equal(other.status, 404);
      const blocked = await a.call("/api/exercises", "POST", {
        taskId: task.id,
      });
      assert.equal(blocked.status, 403);
      const access = await a.call("/api/demo-access", "POST", {
        taskId: task.id,
      });
      assert.equal(access.status, 200);
      const opened = await a.call("/api/exercises", "POST", {
        taskId: task.id,
      });
      assert.equal(opened.status, 200);
      const ex = opened.data;
      const denied = await b.call("/api/exercises/" + ex.id);
      assert.equal(denied.status, 404);
      const premature = await a.call("/api/exercises/" + ex.id + "/export");
      assert.equal(premature.status, 403);
      const checked = await a.call(
        "/api/exercises/" + ex.id + "/check",
        "POST",
        {
          settings: task.expected,
          answer: getLesson(sampleKey)!.correctAnswer,
          revision: ex.revision,
        },
      );
      assert.equal(checked.status, 200);
      assert.equal(checked.data.exercise.completed, true);
      const saved = await a.call("/api/exercises/" + ex.id);
      assert.equal(saved.data.completed, true);
      const stale = await a.call("/api/exercises/" + ex.id, "PATCH", {
        settings: task.expected,
        answer: null,
        step: 1,
        revision: 0,
      });
      assert.equal(stale.status, 409);
      const exported = await a.call("/api/exercises/" + ex.id + "/export");
      assert.equal(exported.status, 200);
      assert.ok(exported.data.length > 30);
    }
    const lib = await a.call("/api/library");
    assert.equal(lib.data.exercises.length, 3);
    assert.ok(lib.data.owned.every((o: any) => o.source === "demo"));
  },
);
test(
  "HTTP: rejects unsupported tasks before purchase",
  { skip: !base },
  async () => {
    const a = await client();
    await a.call("/api/config");
    const task = await a.call("/api/tasks", "POST", {
      goal: "Forecast next year revenue and tax.",
    });
    assert.equal(task.status, 200);
    assert.equal(task.data.unsupported, true);
    assert.equal(
      (await a.call("/api/demo-access", "POST", { taskId: task.data.id }))
        .status,
      400,
    );
  },
);
