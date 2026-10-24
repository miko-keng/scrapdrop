import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_SANDBOX_URL;
test(
  "live tool checkout uses server price, reuses retries and keeps unpaid features locked",
  { skip: !base },
  async () => {
    let cookie = "",
      csrf = "";
    async function call(path: string, body?: object) {
      const r = await fetch(base + path, {
        method: body ? "POST" : "GET",
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
    await call("/api/config");
    const input = {
      version: 1,
      idempotencyKey: randomUUID(),
      price: 1,
      owned: true,
    };
    const first = await call("/api/expert/tools/studio-quote/orders", input);
    assert.equal(first.status, 200);
    assert.equal(first.data.amount, 200);
    assert.ok(first.data.providerId);
    const again = await call("/api/expert/tools/studio-quote/orders", input);
    assert.equal(again.data.id, first.data.id);
    assert.equal(again.data.providerId, first.data.providerId);
    const tool = await call("/api/expert/tools/studio-quote");
    assert.equal(tool.data.owned, false);
    assert.equal(
      (await call("/api/expert/tools/studio-quote/demo-access", {})).status,
      403,
    );
    const saved = await call("/api/expert/quotes", {
      toolId: "studio-quote",
      version: 1,
      input: {
        project: "Unpaid project",
        client: "Test client",
        rate: 65,
        revisions: 2,
        expenses: 0,
        items: [{ name: "Work", hours: 1 }],
      },
    });
    assert.equal(saved.status, 403);
  },
);
