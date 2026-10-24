import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Opt-in: creates an unpaid order against the configured PayPal sandbox app.
const base = process.env.TEST_SANDBOX_URL;
test(
  "Live sandbox: order creation, idempotent retry, status, unpaid gating and disabled demo access",
  { skip: !base },
  async () => {
    let cookie = "",
      csrf = "";
    async function call(path: string, method = "GET", body?: object) {
      const r = await fetch(base + path, {
        method,
        headers: {
          Cookie: cookie,
          Origin: base!,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (r.headers.get("set-cookie"))
        cookie = r.headers.get("set-cookie")!.split(";")[0];
      const data = await r.json();
      if (path === "/api/config") csrf = data.csrf;
      return { status: r.status, data };
    }
    const config = await call("/api/config");
    assert.equal(config.data.mode, "sandbox");
    assert.equal(config.data.paypalReady, true);
    const task = await call("/api/tasks", "POST", {
      sampleKey: "summarise-sales",
      goal: "Total sales for each product",
    });
    assert.equal(task.status, 200);
    const input = { taskId: task.data.id, idempotencyKey: randomUUID() };
    const first = await call("/api/orders", "POST", input);
    assert.equal(first.status, 200);
    assert.ok(first.data.providerId);
    assert.equal(first.data.amount, 200);
    const retry = await call("/api/orders", "POST", input);
    assert.equal(retry.status, 200);
    assert.equal(retry.data.id, first.data.id);
    assert.equal(retry.data.providerId, first.data.providerId);
    const status = await call("/api/orders/" + first.data.id);
    assert.equal(status.status, 200);
    assert.notEqual(status.data.status, "paid");
    assert.equal(
      (await call("/api/exercises", "POST", { taskId: task.data.id })).status,
      403,
    );
    assert.equal(
      (await call("/api/demo-access", "POST", { taskId: task.data.id })).status,
      403,
    );
  },
);
