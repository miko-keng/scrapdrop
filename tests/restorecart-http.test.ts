import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/restorecart/app";
import { openRC, incident, save, order } from "../server/restorecart/store";

async function fixture() {
  const db = openRC(":memory:");
  let n = 0,
    refundNumber = 0;
  const pp = new Map<string, any>();
  const transport: any = async (path: string, method = "GET", body: any) => {
    if (method === "POST" && path === "/v2/checkout/orders") {
      const id = `TEST${++n}`;
      const p = {
        id,
        status: "CREATED",
        purchase_units: body.purchase_units.map((u: any) => ({
          ...u,
          payee: { merchant_id: "HTTPMERCHANT" },
        })),
        links: [
          {
            rel: "payer-action",
            href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
          },
        ],
      };
      pp.set(id, p);
      return p;
    }
    if (path.endsWith("/capture")) {
      const p = pp.get(path.split("/")[4]);
      p.status = "COMPLETED";
      p.purchase_units[0].payments = {
        captures: [
          {
            id: `CAP${p.id}`,
            status: "COMPLETED",
            amount: p.purchase_units[0].amount,
          },
        ],
      };
      return p;
    }
    if (path.endsWith("/refund"))
      return {
        id: `REFUND${++refundNumber}`,
        status: "COMPLETED",
        amount: body.amount,
      };
    return pp.get(path.split("/").at(-1)!);
  };
  const runtime = createApp({
    db,
    base: "http://localhost",
    testPassword: "Testing123!",
    paymentTransport: transport,
  });
  const server = runtime.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  function client() {
    let cookie = "",
      csrf = "";
    return {
      async request(
        path: string,
        body?: any,
        method?: string,
        withCSRF = true,
      ) {
        const r = await fetch(base + "/api/restorecart" + path, {
          method: method || (body === undefined ? "GET" : "POST"),
          headers: {
            "Content-Type": "application/json",
            cookie,
            ...(withCSRF ? { "x-csrf-token": csrf } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const set = r.headers.get("set-cookie");
        if (set) cookie = set.split(";")[0];
        const data = r.headers.get("content-type")?.includes("application/json")
          ? await r.json()
          : await r.text();
        if (data.csrf) csrf = data.csrf;
        return { status: r.status, data };
      },
    };
  }
  const seller = client(),
    buyer = client(),
    stranger = client();
  for (const c of [seller, buyer, stranger]) await c.request("/session");
  assert.equal(
    (
      await seller.request("/login", {
        email: "seller@restorecart.test",
        password: "Testing123!",
      })
    ).status,
    200,
  );
  const made = await seller.request("/incidents", { name: "Sunday Studio" });
  const id = made.data.id;
  return {
    db,
    runtime,
    pp,
    seller,
    buyer,
    stranger,
    id,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      db.close();
    },
  };
}
async function prepare(f: Awaited<ReturnType<typeof fixture>>) {
  await f.seller.request(`/incidents/${f.id}/example`, {});
  const r = await f.seller.request(`/incidents/${f.id}/reconstruct`, {});
  assert.equal(r.status, 200);
  const i = r.data;
  const allocations: any = { "MUG-BLU": 3, "MUG-RED": 2, "TOTE-NAT": 2 };
  const edit = {
    revision: i.revision,
    name: i.name,
    pickup: "12 Sample Lane, 10–5",
    originalUrl: "",
    products: i.products.map(({ issues, available, ...p }: any) => ({
      ...p,
      price: p.sku === "MUG-BLU" ? "20.00" : p.price,
      currency: "USD",
      resolved: true,
      resolutionNote:
        p.sku === "MUG-BLU" ? "Current stock sheet confirms $20." : "",
      allocation: allocations[p.sku],
    })),
  };
  const saved = await f.seller.request(`/incidents/${f.id}`, edit, "PATCH");
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  let counted = saved.data;
  for (const p of counted.products) {
    const result = await f.seller.request(`/incidents/${f.id}/count`, {
      revision: counted.revision,
      sku: p.sku,
      quantity: p.allocation,
      allocation: p.allocation,
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    counted = result.data;
  }
  const published = await f.seller.request(`/incidents/${f.id}/publish`, {
    revision: counted.revision,
  });
  assert.equal(published.status, 200);
  return published.data;
}

test("RestoreCart HTTP complete reconstruct / publish / paid order / pickup / recover", async () => {
  const f = await fixture();
  try {
    const i = await prepare(f);
    const shop = await f.buyer.request(`/shops/${i.slug}`);
    assert.equal(shop.data.products.length, 3);
    assert.equal(shop.data.products[0].candidates, undefined);
    const checkout = await f.buyer.request(`/shops/${i.slug}/orders`, {
      revision: i.published.revision,
      requestKey: "http-buyer-checkout",
      lines: [
        { sku: "MUG-BLU", quantity: 2 },
        { sku: "TOTE-NAT", quantity: 1 },
      ],
    });
    assert.equal(checkout.status, 200);
    assert.equal(checkout.data.amount, 5200);
    const oid = checkout.data.id;
    f.pp.get(checkout.data.provider).status = "APPROVED";
    const captured = await f.buyer.request(`/orders/${oid}/check`, {});
    assert.equal(captured.data.state, "paid");
    assert.equal(
      (await f.seller.request(`/orders/${oid}/fulfillment`, { state: "ready" }))
        .status,
      200,
    );
    assert.equal(
      (
        await f.seller.request(`/orders/${oid}/fulfillment`, {
          state: "collected",
        })
      ).data.fulfillment,
      "collected",
    );
    await f.seller.request(`/incidents/${f.id}/close`, {});
    const exported = await f.seller.request(`/incidents/${f.id}/exports`, {});
    assert.equal(exported.status, 200);
    assert.equal(exported.data.totals.capturedCents, 5200);
    assert.equal(
      exported.data.inventory.find((p: any) => p.sku === "MUG-BLU").available,
      1,
    );
    assert.equal(exported.data.orders[0].fulfillment, "collected");
    const csv = await f.seller.request(
      `/exports/${exported.data.manifest.id}?file=report`,
    );
    assert.equal(csv.status, 200);
    assert.match(csv.data, /Record type/);
    assert.match(csv.data, /52.00/);
    assert.match(csv.data, /MUG-BLU/);
    assert.match(csv.data, /collected/);
    assert.equal(
      (
        await f.buyer.request(
          `/exports/${exported.data.manifest.id}?file=report`,
        )
      ).status,
      403,
    );
    const repeated = await f.seller.request(`/incidents/${f.id}/exports`, {});
    assert.equal(repeated.data.manifest.id, exported.data.manifest.id);
  } finally {
    await f.close();
  }
});
test("RestoreCart HTTP CSRF and seller authorization prevent unauthorized mutation", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await f.seller.request("/incidents", { name: "Bad" }, "POST", false))
        .status,
      403,
    );
    assert.equal((await f.buyer.request(`/incidents/${f.id}`)).status, 403);
    assert.equal(
      (await f.buyer.request(`/incidents/${f.id}/publish`, { revision: 0 }))
        .status,
      403,
    );
    assert.equal(
      (await f.buyer.request(`/incidents/${f.id}/exports`, {})).status,
      403,
    );
  } finally {
    await f.close();
  }
});
test("RestoreCart HTTP private sources and receipts do not leak to unrelated visitors", async () => {
  const f = await fixture();
  try {
    const i = await prepare(f);
    assert.equal(
      (await f.stranger.request(`/sources/${i.sources[0].id}`)).status,
      403,
    );
    const r = await f.buyer.request(`/shops/${i.slug}/orders`, {
      revision: i.published.revision,
      requestKey: "private-receipt-key",
      lines: [{ sku: "MUG-RED", quantity: 1 }],
    });
    assert.equal(
      (await f.stranger.request(`/orders/${r.data.id}`)).status,
      403,
    );
    const token = order(f.db, r.data.id).token;
    assert.equal(
      (await f.stranger.request(`/orders/${r.data.id}?access=${token}`)).status,
      200,
    );
  } finally {
    await f.close();
  }
});
test("RestoreCart HTTP different cart totals and invalid quantities", async () => {
  const f = await fixture();
  try {
    const i = await prepare(f);
    for (const [index, lines, total] of [
      [1, [{ sku: "MUG-RED", quantity: 1 }], 1800],
      [2, [{ sku: "TOTE-NAT", quantity: 2 }], 2400],
      [
        3,
        [
          { sku: "MUG-BLU", quantity: 1 },
          { sku: "MUG-RED", quantity: 1 },
          { sku: "TOTE-NAT", quantity: 1 },
        ],
        5000,
      ],
    ] as const) {
      const r = await f.buyer.request(`/shops/${i.slug}/orders`, {
        revision: i.published.revision,
        requestKey: `variation-key-${index}`,
        lines,
      });
      assert.equal(r.data.amount, total);
      await f.buyer.request(`/orders/${r.data.id}/cancel`, {});
    }
    assert.equal(
      (
        await f.buyer.request(`/shops/${i.slug}/orders`, {
          revision: i.published.revision,
          requestKey: "invalid-quantity",
          lines: [{ sku: "MUG-BLU", quantity: 0.5 }],
        })
      ).status,
      400,
    );
  } finally {
    await f.close();
  }
});
test("RestoreCart HTTP simultaneous last-unit checkout has exactly one winner", async () => {
  const f = await fixture();
  try {
    const i = await prepare(f);
    const results = await Promise.all(
      [f.buyer, f.stranger].map((c, index) =>
        c.request(`/shops/${i.slug}/orders`, {
          revision: i.published.revision,
          requestKey: `concurrent-key-${index}`,
          lines: [{ sku: "MUG-BLU", quantity: 3 }],
        }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  } finally {
    await f.close();
  }
});
test("RestoreCart HTTP allocation below sold quantity is rejected", async () => {
  const f = await fixture();
  try {
    const i = await prepare(f);
    const checkout = await f.buyer.request(`/shops/${i.slug}/orders`, {
      revision: i.published.revision,
      requestKey: "allocation-guard",
      lines: [{ sku: "MUG-BLU", quantity: 2 }],
    });
    const current = await f.seller.request(`/incidents/${f.id}`);
    const d = current.data;
    const r = await f.seller.request(
      `/incidents/${f.id}`,
      {
        revision: d.revision,
        name: d.name,
        pickup: d.pickup,
        originalUrl: "",
        products: d.products.map(({ issues, available, ...p }: any) => ({
          ...p,
          allocation: p.sku === "MUG-BLU" ? 1 : p.allocation,
        })),
      },
      "PATCH",
    );
    assert.equal(r.status, 409);
    assert.equal(
      (await f.buyer.request(`/orders/${checkout.data.id}`)).data.state,
      "awaiting_buyer",
    );
  } finally {
    await f.close();
  }
});
test("RestoreCart HTTP unsafe external URLs and script source uploads are rejected", async () => {
  const f = await fixture();
  try {
    const d = (await f.seller.request(`/incidents/${f.id}`)).data;
    assert.equal(
      (
        await f.seller.request(
          `/incidents/${f.id}`,
          {
            revision: d.revision,
            name: d.name,
            pickup: "abc",
            products: [],
            originalUrl: "javascript:alert(1)",
          },
          "PATCH",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await f.seller.request(`/incidents/${f.id}/sources`, {
          name: "photo.jpg",
          data: Buffer.from("<html>unsafe</html>").toString("base64"),
        })
      ).status,
      400,
    );
  } finally {
    await f.close();
  }
});
test("RestoreCart HTTP full refund and explicit restock are separate operations", async () => {
  const f = await fixture();
  try {
    const i = await prepare(f);
    const checkout = await f.buyer.request(`/shops/${i.slug}/orders`, {
      revision: i.published.revision,
      requestKey: "refund-http-test",
      lines: [
        { sku: "MUG-BLU", quantity: 2 },
        { sku: "TOTE-NAT", quantity: 1 },
      ],
    });
    const oid = checkout.data.id;
    f.pp.get(checkout.data.provider).status = "APPROVED";
    await f.buyer.request(`/orders/${oid}/check`, {});
    const refund = await f.seller.request(`/orders/${oid}/refund`, {});
    assert.equal(refund.data.refunded, 5200);
    assert.equal(
      (await f.buyer.request(`/shops/${i.slug}`)).data.products[0].available,
      1,
    );
    await f.seller.request(`/orders/${oid}/restock`, {});
    assert.equal(
      (await f.buyer.request(`/shops/${i.slug}`)).data.products[0].available,
      3,
    );
    assert.equal(
      (await f.seller.request(`/orders/${oid}/fulfillment`, { state: "ready" }))
        .status,
      409,
    );
  } finally {
    await f.close();
  }
});
test("RestoreCart HTTP final export blocks pending payments", async () => {
  const f = await fixture();
  try {
    const i = await prepare(f);
    const r = await f.buyer.request(`/shops/${i.slug}/orders`, {
      revision: i.published.revision,
      requestKey: "pending-export-test",
      lines: [{ sku: "MUG-BLU", quantity: 1 }],
    });
    f.db
      .prepare("UPDATE rc_orders SET state='needs_reconciliation' WHERE id=?")
      .run(r.data.id);
    f.db
      .prepare("UPDATE rc_holds SET state='locked' WHERE order_id=?")
      .run(r.data.id);
    await f.seller.request(`/incidents/${f.id}/close`, {});
    assert.equal(
      (await f.seller.request(`/incidents/${f.id}/exports`, {})).status,
      409,
    );
    const original = (
      await f.seller.request(`/incidents/${f.id}/original-example`)
    ).data;
    assert.equal(
      (await f.seller.request(`/incidents/${f.id}/compare`, { original }))
        .status,
      409,
    );
    assert.equal(
      (
        await f.buyer.request(`/shops/${i.slug}/orders`, {
          revision: i.published.revision,
          requestKey: "after-close-test",
          lines: [{ sku: "MUG-RED", quantity: 1 }],
        })
      ).status,
      409,
    );
  } finally {
    await f.close();
  }
});

test("RestoreCart HTTP pending refunds block pickup and final recovery", async () => {
  const f = await fixture();
  try {
    const i = await prepare(f);
    const r = await f.buyer.request(`/shops/${i.slug}/orders`, {
      revision: i.published.revision,
      requestKey: "refund-pending-check",
      lines: [{ sku: "MUG-RED", quantity: 1 }],
    });
    f.pp.get(r.data.provider).status = "APPROVED";
    await f.buyer.request(`/orders/${r.data.id}/check`, {});
    f.db
      .prepare(
        "INSERT INTO rc_refunds(order_id,state,amount) VALUES(?,'checking',1800)",
      )
      .run(r.data.id);
    assert.equal(
      (
        await f.seller.request(`/orders/${r.data.id}/fulfillment`, {
          state: "ready",
        })
      ).status,
      409,
    );
    await f.seller.request(`/incidents/${f.id}/close`, {});
    assert.equal(
      (await f.seller.request(`/incidents/${f.id}/exports`, {})).status,
      409,
    );
    const original = (
      await f.seller.request(`/incidents/${f.id}/original-example`)
    ).data;
    assert.equal(
      (await f.seller.request(`/incidents/${f.id}/compare`, { original }))
        .status,
      409,
    );
  } finally {
    await f.close();
  }
});

test("RestoreCart buyer session exposes no seller setup or AI metadata", async () => {
  const f = await fixture();
  try {
    const session = await f.buyer.request("/session");
    assert.equal(session.data.seller, false);
    assert.equal(session.data.practiceAccount, undefined);
    assert.equal(session.data.ai, undefined);
    assert.equal(session.data.sellerConfigured, undefined);
    assert.ok(session.data.csrf);
    assert.equal((await f.seller.request("/seller-session")).data.seller, true);
  } finally {
    await f.close();
  }
});
test("RestoreCart public directory lists only open published shops without private fields", async () => {
  const f = await fixture();
  try {
    assert.deepEqual((await f.buyer.request("/shops")).data, []);
    const i = await prepare(f);
    await f.seller.request("/incidents", { name: "PRIVATE DRAFT SHOP" });
    const result = await f.buyer.request("/shops");
    assert.equal(result.status, 200);
    assert.equal(result.data.length, 1);
    assert.deepEqual(
      Object.keys(result.data[0]).sort(),
      [
        "availableProductCount",
        "categories",
        "description",
        "products",
        "name",
        "preview",
        "productCount",
        "slug",
      ].sort(),
    );
    assert.equal(result.data[0].slug, i.slug);
    assert.equal(result.data[0].productCount, 3);
    assert.deepEqual(result.data[0].categories, [
      "Home & kitchen",
      "Bags & accessories",
    ]);
    assert.match(result.data[0].description, /Natural tote/);
    const tote = result.data[0].products.find((p: any) => p.sku === "TOTE-NAT");
    assert.equal(tote.price, "12.00");
    assert.equal(tote.currency, "USD");
    assert.equal(tote.available, 2);
    assert.deepEqual(
      Object.keys(tote).sort(),
      [
        "sku",
        "name",
        "description",
        "price",
        "currency",
        "categories",
        "available",
      ].sort(),
    );
    const text = JSON.stringify(result.data);
    for (const privateField of [
      "PRIVATE DRAFT SHOP",
      "sunday-stock",
      "candidates",
      "resolutionNote",
      "pickup",
      "allocation",
    ])
      assert.ok(!text.includes(privateField));
    await f.seller.request(`/incidents/${i.id}/close`, {});
    assert.deepEqual((await f.buyer.request("/shops")).data, []);
    assert.equal(
      (await f.buyer.request(`/shops/${i.slug}`)).data.state,
      "closing",
    );
  } finally {
    await f.close();
  }
});
test("RestoreCart buyers keep seeing published data while seller edits a private draft", async () => {
  const f = await fixture();
  try {
    const i = await prepare(f);
    const draft = incident(f.db, i.id);
    draft.name = "Private working name";
    draft.products[0].price = "999.00";
    draft.products[0].name = "Private replacement product";
    draft.products[0].resolutionNote = "Private supplier information";
    save(f.db, draft);
    const listing = (await f.buyer.request("/shops")).data;
    assert.equal(listing[0].name, "Sunday Studio");
    assert.equal(listing[0].products[0].price, "20.00");
    assert.ok(!JSON.stringify(listing).includes("Private"));
    const shop = (await f.buyer.request(`/shops/${i.slug}`)).data;
    assert.equal(shop.name, "Sunday Studio");
    assert.equal(shop.products[0].price, "20.00");
    assert.equal(shop.products[0].name, "Blue mug");
    assert.ok(!JSON.stringify(shop).includes("Private"));
    const seller = (await f.seller.request(`/incidents/${i.id}`)).data;
    assert.equal(seller.products[0].price, "999.00");
  } finally {
    await f.close();
  }
});
test("RestoreCart buyer cannot become a seller or mutate management endpoints", async () => {
  const f = await fixture();
  try {
    for (const [path, method] of [
      [`/incidents/${f.id}/sources`, "POST"],
      [`/incidents/${f.id}/example`, "POST"],
      [`/incidents/${f.id}/reconstruct`, "POST"],
      [`/incidents/${f.id}`, "PATCH"],
      [`/incidents/${f.id}/publish`, "POST"],
      [`/incidents/${f.id}/close`, "POST"],
      [`/incidents/${f.id}/exports`, "POST"],
      ["/orders/not-an-order/refund", "POST"],
      ["/orders/not-an-order/fulfillment", "POST"],
      ["/orders/not-an-order/restock", "POST"],
    ] as const) {
      const r = await f.buyer.request(
        path,
        { seller: true, role: "seller" },
        method,
      );
      assert.equal(r.status, 403, path);
    }
    assert.equal(
      (await f.buyer.request("/session?seller=true&role=seller")).data.seller,
      false,
    );
    assert.equal(
      (await f.buyer.request(`/orders?incident=${f.id}`)).status,
      403,
    );
    assert.equal((await f.buyer.request("/health")).status, 403);
  } finally {
    await f.close();
  }
});
test("RestoreCart buyer receipt returns to its public shop", async () => {
  const f = await fixture();
  try {
    const i = await prepare(f);
    const checkout = await f.buyer.request(`/shops/${i.slug}/orders`, {
      requestKey: "buyer-return-shop",
      revision: i.published.revision,
      lines: [{ sku: "MUG-RED", quantity: 1 }],
    });
    assert.equal(checkout.status, 200);
    const receipt = await f.buyer.request(`/orders/${checkout.data.id}`);
    assert.equal(receipt.data.shopUrl, `/s/${i.slug}`);
    assert.equal(receipt.data.snapshot.lines[0].unitCents, 1800);
  } finally {
    await f.close();
  }
});

async function paidOne(
  f: Awaited<ReturnType<typeof fixture>>,
  i: any,
  sku: string,
  quantity: number,
  key: string,
) {
  const checkout = await f.buyer.request(`/shops/${i.slug}/orders`, {
    revision: i.published.revision,
    requestKey: key,
    lines: [{ sku, quantity }],
  });
  assert.equal(checkout.status, 200, JSON.stringify(checkout.data));
  f.pp.get(checkout.data.provider).status = "APPROVED";
  const captured = await f.buyer.request(
    `/orders/${checkout.data.id}/check`,
    {},
  );
  assert.equal(captured.data.state, "paid");
  return captured.data;
}
test("RestoreCart continuity maps unusual columns, preserves sources, asks questions and confirms a SKU photo", async () => {
  const f = await fixture();
  try {
    const text =
      "Code,Item label,Cost,Money,On hand,Notes\nBAG-1,Natural bag,12.50,USD,9,Cotton carryall\n";
    const source = await f.seller.request(`/incidents/${f.id}/sources`, {
      name: "count.csv",
      data: Buffer.from(text).toString("base64"),
    });
    const photo = await f.seller.request(`/incidents/${f.id}/sources`, {
      name: "BAG-1.png",
      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S8AAAAASUVORK5CYII=",
    });
    assert.equal(photo.status, 201);
    const mapping = {
      sku: "Code",
      name: "Item label",
      price: "Cost",
      currency: "Money",
      stock: "On hand",
      description: "Notes",
    };
    const mapped = await f.seller.request(`/incidents/${f.id}/mappings`, {
      sourceId: source.data.id,
      mapping,
      observedAt: "2026-01-01T12:00:00.000Z",
    });
    assert.equal(mapped.status, 200, JSON.stringify(mapped.data));
    assert.equal(mapped.data.recognizedProducts, 1);
    assert.equal(
      (
        f.db
          .prepare("SELECT text FROM rc_sources WHERE id=?")
          .get(source.data.id) as any
      ).text,
      text,
    );
    const reconstructed = await f.seller.request(
      `/incidents/${f.id}/reconstruct`,
      {},
    );
    assert.equal(reconstructed.status, 200);
    let i = reconstructed.data;
    assert.equal(i.products[0].price, "12.50");
    assert.equal(i.products[0].imageSourceId, photo.data.id);
    let ready = await f.seller.request(`/incidents/${f.id}/readiness`);
    assert.equal(ready.data.needsInformation, 1);
    assert.equal(
      (
        await f.seller.request(`/incidents/${f.id}/publish`, {
          revision: i.revision,
        })
      ).status,
      409,
    );
    const answer = await f.seller.request(`/incidents/${f.id}/answer`, {
      revision: i.revision,
      sku: "BAG-1",
      name: "Natural bag",
      price: "12.50",
      currency: "USD",
      resolutionNote: "Current sheet",
      imageSourceId: photo.data.id,
      confirm: true,
    });
    assert.equal(answer.status, 200, JSON.stringify(answer.data));
    i = answer.data;
    const count = await f.seller.request(`/incidents/${f.id}/count`, {
      revision: i.revision,
      sku: "BAG-1",
      quantity: 9,
      allocation: 3,
    });
    assert.equal(count.status, 200);
    i = count.data;
    ready = await f.seller.request(`/incidents/${f.id}/readiness`);
    assert.equal(ready.data.ready, 1);
    assert.equal(ready.data.products[0].count.quantity, 9);
    assert.ok(ready.data.products[0].count.at > 0);
    assert.equal(
      (
        await f.seller.request(`/incidents/${f.id}/count`, {
          revision: i.revision,
          sku: "BAG-1",
          quantity: 1,
          allocation: 3,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await f.seller.request(`/incidents/${f.id}/count`, {
          revision: 0,
          sku: "BAG-1",
          quantity: 9,
          allocation: 3,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await f.seller.request(`/incidents/${f.id}/mappings`, {
          sourceId: source.data.id,
          mapping: { ...mapping, name: "Code" },
          observedAt: "",
        })
      ).status,
      400,
    );
  } finally {
    await f.close();
  }
});
test("RestoreCart continuity publishes contact snapshots without leaking later draft messages", async () => {
  const f = await fixture();
  try {
    const contact = {
      contact: "shop@example.test",
      hours: "10am–5pm",
      status: "Temporary shop open for pickup.",
    };
    await f.seller.request(`/incidents/${f.id}/contact`, contact);
    const i = await prepare(f);
    assert.deepEqual(
      (await f.buyer.request(`/shops/${i.slug}`)).data.contact,
      contact,
    );
    await f.seller.request(`/incidents/${f.id}/contact`, {
      ...contact,
      status: "PRIVATE DRAFT MESSAGE",
    });
    assert.deepEqual(
      (await f.buyer.request(`/shops/${i.slug}`)).data.contact,
      contact,
    );
    assert.equal(
      (await f.buyer.request(`/incidents/${f.id}/contact`)).status,
      403,
    );
  } finally {
    await f.close();
  }
});
test("RestoreCart continuity returns paid/refunded sales and stock once, including a later refund delta", async () => {
  const f = await fixture();
  try {
    const i = await prepare(f),
      first = await paidOne(f, i, "MUG-BLU", 2, "return-first"),
      second = await paidOne(f, i, "MUG-RED", 1, "return-second");
    await f.seller.request(`/orders/${first.id}/fulfillment`, {
      state: "ready",
    });
    await f.seller.request(`/orders/${second.id}/refund`, {});
    await f.seller.request(`/orders/${second.id}/restock`, {});
    const original = (
      await f.seller.request(`/incidents/${f.id}/original-example`)
    ).data;
    assert.equal(
      (await f.seller.request(`/incidents/${f.id}/compare`, { original }))
        .status,
      409,
    );
    await f.seller.request(`/incidents/${f.id}/close`, {});
    const compared = await f.seller.request(`/incidents/${f.id}/compare`, {
      original,
    });
    assert.equal(compared.status, 200, JSON.stringify(compared.data));
    assert.equal(compared.data.totals.captured, 5800);
    assert.equal(compared.data.totals.refunded, 1800);
    assert.equal(compared.data.conflicts.length, 0);
    const applied = await f.seller.request(`/incidents/${f.id}/apply`, {
      previewId: compared.data.previewId,
    });
    assert.equal(applied.status, 200, JSON.stringify(applied.data));
    assert.equal(
      applied.data.output.inventory.find((p: any) => p.sku === "MUG-BLU")
        .quantity,
      6,
    );
    assert.equal(
      applied.data.output.inventory.find((p: any) => p.sku === "MUG-RED")
        .quantity,
      5,
    );
    assert.equal(applied.data.output.orders.length, 2);
    assert.deepEqual(
      (await f.seller.request(`/incidents/${f.id}/return-state`)).data.original,
      applied.data.output,
    );
    assert.equal(
      applied.data.output.orders.find(
        (o: any) => o.emergencyOrderId === second.id,
      ).refunded,
      1800,
    );
    const retry = await f.seller.request(`/incidents/${f.id}/apply`, {
      previewId: compared.data.previewId,
    });
    assert.equal(retry.data.repeated, true);
    assert.deepEqual(retry.data.output, applied.data.output);
    const repeated = await f.seller.request(`/incidents/${f.id}/compare`, {
      original: applied.data.output,
    });
    assert.equal(repeated.status, 200, JSON.stringify(repeated.data));
    assert.equal(repeated.data.changes.length, 0);
    assert.equal(repeated.data.alreadyRecorded, 2);
    assert.equal(
      (await f.seller.request(`/incidents/${f.id}/compare`, { original }))
        .status,
      409,
    );
    const dropped = {
      ...original,
      revision: 100,
      exportedAt: new Date().toISOString(),
    };
    assert.equal(
      (
        await f.seller.request(`/incidents/${f.id}/compare`, {
          original: dropped,
        })
      ).status,
      409,
    );
    // A later refund updates finances; physical stock is unchanged until explicitly restocked.
    assert.equal(
      (await f.seller.request(`/orders/${first.id}/refund`, {})).status,
      200,
    );
    const delta = await f.seller.request(`/incidents/${f.id}/compare`, {
      original: applied.data.output,
    });
    assert.equal(delta.status, 200, JSON.stringify(delta.data));
    assert.equal(delta.data.changes.length, 1);
    assert.equal(delta.data.changes[0].kind, "order");
    const deltaApplied = await f.seller.request(`/incidents/${f.id}/apply`, {
      previewId: delta.data.previewId,
    });
    assert.equal(deltaApplied.status, 200);
    assert.equal(
      deltaApplied.data.output.inventory.find((p: any) => p.sku === "MUG-BLU")
        .quantity,
      6,
    );
  } finally {
    await f.close();
  }
});
test("RestoreCart continuity rejects conflicting, stale and insufficient destination records atomically", async () => {
  const f = await fixture();
  try {
    const i = await prepare(f);
    await paidOne(f, i, "MUG-BLU", 1, "return-conflict");
    await f.seller.request(`/incidents/${f.id}/close`, {});
    const original = (
      await f.seller.request(`/incidents/${f.id}/original-example`)
    ).data;
    const missing = { ...original, inventory: [] };
    const c = await f.seller.request(`/incidents/${f.id}/compare`, {
      original: missing,
    });
    assert.ok(c.data.conflicts.length);
    assert.equal(
      (
        await f.seller.request(`/incidents/${f.id}/apply`, {
          previewId: c.data.previewId,
        })
      ).status,
      409,
    );
    const insufficient = {
      ...original,
      inventory: original.inventory.map((p: any) => ({ ...p, quantity: 0 })),
    };
    assert.ok(
      (
        await f.seller.request(`/incidents/${f.id}/compare`, {
          original: insufficient,
        })
      ).data.conflicts.length,
    );
    const valid = await f.seller.request(`/incidents/${f.id}/compare`, {
      original,
    });
    const o = f.db
      .prepare("SELECT id FROM rc_orders WHERE incident=?")
      .get(f.id) as any;
    f.db
      .prepare("UPDATE rc_orders SET fulfillment='ready' WHERE id=?")
      .run(o.id);
    assert.equal(
      (
        await f.seller.request(`/incidents/${f.id}/apply`, {
          previewId: valid.data.previewId,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        f.db
          .prepare(
            "SELECT count(*) n FROM rc_meta WHERE key LIKE 'destination:%'",
          )
          .get() as any
      ).n,
      0,
    );
  } finally {
    await f.close();
  }
});
test("RestoreCart continuity kits version, include images, import safely, restore and rehearse without copying sales", async () => {
  const f = await fixture();
  try {
    const i = await prepare(f);
    await paidOne(f, i, "MUG-BLU", 1, "kit-real-sale");
    const photo = await f.seller.request(`/incidents/${f.id}/sources`, {
      name: "TOTE-NAT.png",
      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S8AAAAASUVORK5CYII=",
    });
    assert.equal(photo.status, 201);
    const first = await f.seller.request(`/incidents/${f.id}/kits`, {});
    assert.equal(first.status, 200);
    assert.equal(first.data.version, 1);
    const same = await f.seller.request(`/incidents/${f.id}/kits`, {});
    assert.equal(same.data.id, first.data.id);
    assert.equal(same.data.duplicate, true);
    await f.seller.request(`/incidents/${f.id}/contact`, {
      contact: "new@example.test",
      hours: "12–5",
      status: "Open",
    });
    assert.equal(
      (await f.seller.request(`/incidents/${f.id}/kits`, {})).data.version,
      2,
    );
    const kit = (await f.seller.request(`/kits/${first.data.id}`)).data;
    assert.equal(
      kit.sources.filter((s: any) => s.mime.startsWith("image/")).length,
      1,
    );
    assert.equal(kit.orders, undefined);
    assert.equal(kit.sessions, undefined);
    assert.equal((await f.seller.request(`/kits/import`, { kit })).status, 200);
    assert.equal(
      (
        await f.seller.request(`/kits/import`, {
          kit: { ...kit, name: "Tampered" },
        })
      ).status,
      400,
    );
    const restored = await f.seller.request(
      `/kits/${first.data.id}/restore`,
      {},
    );
    assert.equal(restored.status, 200, JSON.stringify(restored.data));
    const draft = restored.data.incident;
    assert.equal(draft.state, "draft");
    assert.equal(draft.published, null);
    assert.ok(
      draft.products.every((p: any) => p.allocation === 0 && !p.resolved),
    );
    assert.equal(restored.data.report.images, 1);
    assert.equal(
      (await f.seller.request(`/orders?incident=${draft.id}`)).data.length,
      0,
    );
    assert.equal(
      (
        await f.seller.request(`/incidents/${draft.id}/publish`, {
          revision: draft.revision,
        })
      ).status,
      409,
    );
    const rehearsal = await f.seller.request(
      `/incidents/${draft.id}/rehearse-return`,
      {},
    );
    assert.equal(rehearsal.status, 200, JSON.stringify(rehearsal.data));
    assert.equal(rehearsal.data.passed, true);
    assert.equal(rehearsal.data.repeatChanges, 0);
    assert.equal(rehearsal.data.noPayPalCalls, true);
    const operational = await f.seller.request(
      `/kits/${first.data.id}/restore`,
      { mode: "operational" },
    );
    assert.equal(operational.status, 200);
    assert.equal(
      (
        await f.seller.request(
          `/incidents/${operational.data.incident.id}/readiness`,
        )
      ).data.rehearsal,
      null,
    );
    assert.equal(
      (await f.seller.request(`/orders?incident=${i.id}`)).data.length,
      1,
    );
    assert.equal(incident(f.db, i.id).state, "live");
  } finally {
    await f.close();
  }
});
test("RestoreCart continuity seller tools retain auth and CSRF protection", async () => {
  const f = await fixture();
  try {
    for (const path of [
      `/incidents/${f.id}/readiness`,
      `/incidents/${f.id}/mappings`,
      `/incidents/${f.id}/contact`,
      `/incidents/${f.id}/original-example`,
      `/kits`,
      `/kits/nope`,
      `/destinations/nope`,
    ])
      assert.equal((await f.buyer.request(path)).status, 403, path);
    for (const path of [
      `/incidents/${f.id}/answer`,
      `/incidents/${f.id}/count`,
      `/incidents/${f.id}/compare`,
      `/incidents/${f.id}/apply`,
      `/incidents/${f.id}/kits`,
      `/kits/import`,
      `/kits/nope/restore`,
      `/incidents/${f.id}/rehearse-return`,
    ])
      assert.equal((await f.buyer.request(path, {})).status, 403, path);
    assert.equal(
      (await f.seller.request(`/incidents/${f.id}/count`, {}, "POST", false))
        .status,
      403,
    );
  } finally {
    await f.close();
  }
});

test("RestoreCart continuity new contradictory evidence reopens a prior answer and source-date metadata never becomes a count", async () => {
  const f = await fixture();
  try {
    await prepare(f);
    assert.equal(
      (await f.seller.request(`/incidents/${f.id}/readiness`)).data.ready,
      3,
    );
    await f.seller.request(`/incidents/${f.id}/sources`, {
      name: "new-price.csv",
      data: Buffer.from(
        "sku,name,price,currency,stock\nMUG-BLU,Blue mug,23.00,USD,6\n",
      ).toString("base64"),
    });
    const rebuilt = await f.seller.request(
      `/incidents/${f.id}/reconstruct`,
      {},
    );
    assert.equal(rebuilt.status, 200);
    const blue = rebuilt.data.products.find((p: any) => p.sku === "MUG-BLU");
    assert.equal(blue.resolved, false);
    assert.equal(blue.resolutionNote, "");
    const ready = (await f.seller.request(`/incidents/${f.id}/readiness`)).data;
    assert.equal(ready.needsInformation, 1);
    assert.equal(
      ready.products.find((p: any) => p.sku === "MUG-BLU").count.allocation,
      3,
    );
    assert.equal(
      (
        await f.seller.request(`/incidents/${f.id}/publish`, {
          revision: rebuilt.data.revision,
        })
      ).status,
      409,
    );
  } finally {
    await f.close();
  }
});

test("RestoreCart UAT portable rescue kit restores in a fresh installation with remapped image evidence", async () => {
  const source = await fixture(),
    destination = await fixture();
  try {
    await prepare(source);
    const uploaded = await source.seller.request(
      `/incidents/${source.id}/sources`,
      {
        name: "MUG-BLU.png",
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S8AAAAASUVORK5CYII=",
      },
    );
    assert.equal(uploaded.status, 201);
    // Reconstruct proposes the exact-SKU photo; it remains a seller-confirmed choice.
    const reconstructed = await source.seller.request(
      `/incidents/${source.id}/reconstruct`,
      {},
    );
    assert.equal(reconstructed.status, 200);
    assert.equal(
      reconstructed.data.products.find((p: any) => p.sku === "MUG-BLU")
        .imageSourceId,
      uploaded.data.id,
    );
    const made = await source.seller.request(
        `/incidents/${source.id}/kits`,
        {},
      ),
      kit = (await source.seller.request(`/kits/${made.data.id}`)).data;
    const imported = await destination.seller.request("/kits/import", { kit });
    assert.equal(imported.status, 200, JSON.stringify(imported.data));
    assert.equal(imported.data.duplicate, false);
    const restored = await destination.seller.request(
      `/kits/${imported.data.id}/restore`,
      { mode: "operational" },
    );
    assert.equal(restored.status, 200, JSON.stringify(restored.data));
    const draft = restored.data.incident,
      blue = draft.products.find((p: any) => p.sku === "MUG-BLU");
    assert.notEqual(blue.imageSourceId, uploaded.data.id);
    assert.ok(draft.sources.some((s: any) => s.id === blue.imageSourceId));
    assert.ok(
      blue.candidates.every((e: any) =>
        draft.sources.some((s: any) => s.id === e.sourceId),
      ),
    );
    assert.equal(draft.state, "draft");
    assert.equal(draft.published, null);
    assert.equal(draft.rehearsal, null);
    assert.ok(
      draft.products.every((p: any) => p.allocation === 0 && !p.resolved),
    );
    assert.equal(
      (await destination.seller.request(`/orders?incident=${draft.id}`)).data
        .length,
      0,
    );
    assert.equal(
      (await destination.buyer.request(`/shops/${draft.slug}`)).status,
      404,
    );
    assert.equal(
      (
        await destination.seller.request(`/incidents/${draft.id}/publish`, {
          revision: draft.revision,
        })
      ).status,
      409,
    );
    const blob = destination.db
      .prepare("SELECT bytes,hash FROM rc_sources WHERE id=?")
      .get(blue.imageSourceId) as any;
    const prior = source.db
      .prepare("SELECT bytes,hash FROM rc_sources WHERE id=?")
      .get(uploaded.data.id) as any;
    assert.equal(blob.hash, prior.hash);
    assert.deepEqual(Buffer.from(blob.bytes), Buffer.from(prior.bytes));
  } finally {
    await source.close();
    await destination.close();
  }
});
test("RestoreCart UAT two return previews cannot apply the same stock sale twice", async () => {
  const f = await fixture();
  try {
    const i = await prepare(f);
    await paidOne(f, i, "MUG-BLU", 1, "parallel-return");
    await f.seller.request(`/incidents/${f.id}/close`, {});
    const original = (
      await f.seller.request(`/incidents/${f.id}/original-example`)
    ).data;
    const a = await f.seller.request(`/incidents/${f.id}/compare`, {
        original,
      }),
      b = await f.seller.request(`/incidents/${f.id}/compare`, { original });
    const results = await Promise.all([
      f.seller.request(`/incidents/${f.id}/apply`, {
        previewId: a.data.previewId,
      }),
      f.seller.request(`/incidents/${f.id}/apply`, {
        previewId: b.data.previewId,
      }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const success = results.find((r) => r.status === 200)!;
    assert.equal(success.data.output.orders.length, 1);
    assert.equal(
      success.data.output.inventory.find((p: any) => p.sku === "MUG-BLU")
        .quantity,
      7,
    );
    assert.equal(
      (
        await f.seller.request(`/incidents/${f.id}/compare`, {
          original: success.data.output,
        })
      ).data.changes.length,
      0,
    );
  } finally {
    await f.close();
  }
});

test("RestoreCart accounts register buyer and seller roles, hash passwords, and sign in by username", async () => {
  const f = await fixture();
  try {
    const credentials = {
      email: "demo.buyer@example.test",
      username: "test-buyer",
      password: "AnewPassword2026!",
      role: "buyer",
    };
    const registered = await f.buyer.request("/register", credentials);
    assert.equal(registered.status, 200);
    assert.equal(registered.data.seller, false);
    const stored = f.db
      .prepare("SELECT password_hash FROM rc_accounts WHERE id=?")
      .get(registered.data.user.id) as any;
    assert.ok(!stored.password_hash.includes(credentials.password));
    assert.ok(stored.password_hash.includes(":"));
    assert.equal((await f.buyer.request("/incidents")).status, 403);
    assert.equal(
      (await f.stranger.request("/register", credentials)).status,
      409,
    );
    assert.equal(
      (
        await f.stranger.request("/register", {
          ...credentials,
          email: "other@example.test",
          username: "other",
          role: "admin",
        })
      ).status,
      400,
    );
    await f.buyer.request("/logout", {});
    await f.buyer.request("/session");
    assert.equal((await f.buyer.request("/my-orders")).status, 401);
    assert.equal(
      (
        await f.buyer.request("/login", {
          email: credentials.username,
          password: "wrong",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await f.buyer.request("/login", {
          email: credentials.username,
          password: credentials.password,
        })
      ).status,
      200,
    );
    assert.equal(
      (await f.buyer.request("/session")).data.user.id,
      registered.data.user.id,
    );
  } finally {
    await f.close();
  }
});

test("RestoreCart cart survives reload and sign-in, merges only this guest, and never reserves stock", async () => {
  const f = await fixture();
  try {
    const shop = await prepare(f),
      path = `/shops/${shop.slug}/cart`;
    const saved = {
      quantities: { "MUG-BLU": 2, "TOTE-NAT": 1 },
      requestKey: "saved-guest-cart-2026",
    };
    assert.equal((await f.buyer.request(path, saved, "PUT")).status, 200);
    assert.deepEqual(
      (await f.buyer.request(path)).data.quantities,
      saved.quantities,
    );
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM rc_holds").get() as any).n,
      0,
    );
    assert.deepEqual((await f.stranger.request(path)).data.quantities, {});
    const credentials = {
      email: "cart@example.test",
      username: "cart-buyer",
      password: "CartPassword2026!",
      role: "buyer",
    };
    await f.buyer.request("/register", credentials);
    assert.deepEqual(
      (await f.buyer.request(path)).data.quantities,
      saved.quantities,
    );
    const carts = await f.buyer.request("/my-carts");
    assert.equal(carts.data[0].total, 5200);
    assert.equal(carts.data[0].units, 3);
    await f.buyer.request("/logout", {});
    await f.buyer.request("/session");
    assert.deepEqual((await f.buyer.request(path)).data.quantities, {});
    await f.buyer.request("/login", {
      email: credentials.email,
      password: credentials.password,
    });
    assert.equal(
      (await f.buyer.request(path)).data.requestKey,
      saved.requestKey,
    );
    assert.deepEqual(
      (await f.buyer.request(path)).data.quantities,
      saved.quantities,
    );
    assert.equal(
      (
        await f.buyer.request(
          path,
          { ...saved, quantities: { "MUG-BLU": -1 } },
          "PUT",
        )
      ).status,
      400,
    );
    const changed = incident(f.db, f.id);
    changed.products[0].allocation = 1;
    save(f.db, changed);
    const fresh = await f.buyer.request(path);
    assert.equal(fresh.data.quantities["MUG-BLU"], 1);
    assert.equal(fresh.data.adjusted, true);
  } finally {
    await f.close();
  }
});

test("RestoreCart registered buyer retains private orders after logout and login", async () => {
  const f = await fixture();
  try {
    const shop = await prepare(f);
    const made = await f.buyer.request(`/shops/${shop.slug}/orders`, {
      requestKey: "guest-order-before-register",
      revision: shop.published.revision,
      lines: [{ sku: "MUG-BLU", quantity: 1 }],
    });
    assert.equal(made.status, 200);
    const c = {
      email: "orders@example.test",
      username: "order-buyer",
      password: "OrderPassword2026!",
      role: "buyer",
    };
    const registered = await f.buyer.request("/register", c);
    assert.equal(registered.status, 200);
    assert.equal(
      (await f.buyer.request("/my-orders")).data[0].id,
      made.data.id,
    );
    await f.buyer.request("/logout", {});
    await f.buyer.request("/session");
    await f.buyer.request("/login", {
      email: c.username,
      password: c.password,
    });
    assert.equal(
      (await f.buyer.request(`/orders/${made.data.id}`)).status,
      200,
    );
    assert.equal(
      (await f.stranger.request(`/orders/${made.data.id}`)).status,
      403,
    );
    await f.stranger.request("/register", {
      ...c,
      email: "other-order@example.test",
      username: "other-order-buyer",
    });
    assert.deepEqual((await f.stranger.request("/my-orders")).data, []);
    assert.equal(
      (await f.stranger.request(`/orders/${made.data.id}`)).status,
      403,
    );
  } finally {
    await f.close();
  }
});

test("RestoreCart registered sellers cannot access another seller catalog, sources, orders, kits or recovery", async () => {
  const f = await fixture();
  try {
    const shop = await prepare(f);
    const source = (await f.seller.request(`/incidents/${f.id}`)).data
      .sources[0].id;
    const kit = await f.seller.request(`/incidents/${f.id}/kits`, {});
    const originalKit = (await f.seller.request(`/kits/${kit.data.id}`)).data;
    const customerOrder = await f.stranger.request(
      `/shops/${shop.slug}/orders`,
      {
        requestKey: "seller-isolation-order",
        revision: shop.published.revision,
        lines: [{ sku: "MUG-BLU", quantity: 1 }],
      },
    );
    await f.buyer.request("/register", {
      email: "seller-two@example.test",
      username: "seller-two",
      password: "SellerTwo2026!",
      role: "seller",
    });
    assert.deepEqual((await f.buyer.request("/incidents")).data, []);
    assert.deepEqual((await f.buyer.request("/kits")).data, []);
    for (const path of [
      `/incidents/${f.id}`,
      `/sources/${source}`,
      `/orders?incident=${f.id}`,
      `/kits/${kit.data.id}`,
      `/incidents/${f.id}/return-state`,
      `/orders/${customerOrder.data.id}`,
    ])
      assert.equal((await f.buyer.request(path)).status, 403, path);
    assert.equal(
      (await f.buyer.request(`/orders/${customerOrder.data.id}/refund`, {}))
        .status,
      403,
    );
    const own = await f.buyer.request("/incidents", {
      name: "Separate seller",
    });
    assert.equal(own.status, 201);
    assert.equal(
      (await f.seller.request(`/incidents/${own.data.id}`)).status,
      403,
    );
    f.db
      .prepare("INSERT INTO rc_exports VALUES(?,?,?,?,?)")
      .run("export-private-owner", f.id, "{}", "test-hash", Date.now());
    f.db
      .prepare("INSERT INTO rc_meta VALUES(?,?)")
      .run("destination:private-original-store", "{}");
    assert.equal(
      (await f.buyer.request("/exports/export-private-owner")).status,
      403,
    );
    assert.equal(
      (await f.buyer.request("/destinations/private-original-store")).status,
      403,
    );
    assert.equal(
      (
        await f.buyer.request(`/incidents/${own.data.id}/compare`, {
          original: { storeId: "private-original-store" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await f.buyer.request("/kits/import", { kit: originalKit })).status,
      403,
    );
    // Portable imports are explicitly owned by the importing account, not the incident ID in the file.
    const imported = await f.buyer.request("/kits/import", {
      kit: { ...originalKit, id: "kit-independent-copy" },
    });
    assert.equal(imported.status, 200);
    const restored = await f.buyer.request(
      "/kits/kit-independent-copy/restore",
      { mode: "rehearsal" },
    );
    assert.equal(restored.status, 200);
    const restoredId = restored.data.incident.id;
    assert.equal(
      (await f.buyer.request(`/incidents/${restoredId}`)).status,
      200,
    );
    assert.equal(
      (await f.seller.request(`/incidents/${restoredId}`)).status,
      403,
    );
    assert.equal(
      (
        await f.buyer.request(
          `/sources/${restored.data.incident.sources[0].id}`,
        )
      ).status,
      200,
    );
  } finally {
    await f.close();
  }
});

test("RestoreCart one buyer login covers multiple sellers with separate carts and unified purchase history", async () => {
  const f = await fixture();
  try {
    const first = await prepare(f);
    await f.stranger.request("/register", {
      email: "second-seller@example.test",
      username: "second-seller",
      password: "SecondSeller2026!",
      role: "seller",
    });
    const made = await f.stranger.request("/incidents", {
      name: "Second seller shop",
    });
    const second = await prepare({
      ...f,
      seller: f.stranger,
      id: made.data.id,
    });
    const signed = await f.buyer.request("/register", {
      email: "all-shops@example.test",
      username: "all-shops",
      password: "AllShops2026!",
      role: "buyer",
    });
    assert.equal(signed.status, 200);
    for (const shop of [first, second]) {
      assert.equal((await f.buyer.request(`/shops/${shop.slug}`)).status, 200);
      assert.equal(
        (
          await f.buyer.request(
            `/shops/${shop.slug}/cart`,
            { quantities: { "MUG-BLU": 1 }, requestKey: `cart-for-${shop.id}` },
            "PUT",
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await f.buyer.request(`/shops/${shop.slug}/orders`, {
            requestKey: `order-for-${shop.id}`,
            revision: shop.published.revision,
            lines: [{ sku: "MUG-BLU", quantity: 1 }],
          })
        ).status,
        200,
      );
      assert.equal(
        (await f.buyer.request("/session")).data.user.id,
        signed.data.user.id,
      );
    }
    assert.equal((await f.buyer.request("/my-carts")).data.length, 2);
    assert.equal((await f.buyer.request("/my-orders")).data.length, 2);
    assert.equal((await f.buyer.request("/basket")).data.shops.length, 2);
  } finally {
    await f.close();
  }
});

test("RestoreCart shopping basket adds incrementally, enforces stock and supports quantity changes and removal", async () => {
  const f = await fixture();
  try {
    const shop = await prepare(f),
      path = `/shops/${shop.slug}/basket-items`,
      cart = `/shops/${shop.slug}/cart`;
    assert.equal(
      (
        await f.buyer.request(
          path,
          { sku: "MUG-BLU", quantity: 1 },
          undefined,
          false,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await f.buyer.request(path, {
          sku: "MUG-BLU",
          quantity: 1,
          price: "0.01",
        })
      ).status,
      400,
    );
    assert.equal(
      (await f.buyer.request(path, { sku: "UNKNOWN", quantity: 1 })).status,
      404,
    );
    assert.equal(
      (await f.buyer.request(path, { sku: "MUG-BLU", quantity: 1 })).status,
      200,
    );
    assert.equal(
      (await f.buyer.request(path, { sku: "MUG-BLU", quantity: 2 })).status,
      200,
    );
    assert.equal(
      (await f.buyer.request(path, { sku: "MUG-BLU", quantity: 1 })).status,
      409,
    );
    let basket = (await f.buyer.request("/basket")).data;
    assert.equal(basket.units, 3);
    assert.equal(basket.total, 6000);
    assert.equal(basket.shops[0].name, shop.name);
    assert.equal(basket.shops[0].revision, shop.published.revision);
    assert.equal((await f.stranger.request("/basket")).data.units, 0);
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM rc_holds").get() as any).n,
      0,
    );
    await f.buyer.request(
      cart,
      { quantities: { "MUG-BLU": 1 }, requestKey: "basket-quantity-change" },
      "PUT",
    );
    basket = (await f.buyer.request("/basket")).data;
    assert.equal(basket.units, 1);
    assert.equal(basket.total, 2000);
    await f.buyer.request(
      cart,
      { quantities: { "MUG-BLU": 0 }, requestKey: "basket-remove-last-line" },
      "PUT",
    );
    assert.deepEqual((await f.buyer.request("/basket")).data, {
      shops: [],
      units: 0,
      total: 0,
    });
    assert.equal(
      (
        await f.buyer.request(path, {
          lines: [
            { sku: "MUG-BLU", quantity: 1 },
            { sku: "UNKNOWN", quantity: 1 },
          ],
        })
      ).status,
      404,
    );
    assert.equal((await f.buyer.request("/basket")).data.units, 0);
    assert.equal(
      (
        await f.buyer.request(path, {
          lines: [
            { sku: "MUG-BLU", quantity: 1 },
            { sku: "MUG-RED", quantity: 1 },
          ],
        })
      ).status,
      200,
    );
    assert.equal((await f.buyer.request("/basket")).data.total, 3800);
  } finally {
    await f.close();
  }
});

test("RestoreCart basket shows changed availability without hiding saved items and blocks closed-shop additions", async () => {
  const f = await fixture();
  try {
    const shop = await prepare(f);
    await f.buyer.request(`/shops/${shop.slug}/basket-items`, {
      sku: "MUG-BLU",
      quantity: 2,
    });
    const current = incident(f.db, f.id);
    current.products[0].allocation = 0;
    save(f.db, current);
    const basket = (await f.buyer.request("/basket")).data;
    assert.equal(basket.units, 2);
    assert.equal(basket.shops[0].lines[0].available, 0);
    assert.equal(
      (
        await f.buyer.request(`/shops/${shop.slug}/orders`, {
          requestKey: basket.shops[0].requestKey,
          revision: shop.published.revision,
          lines: [{ sku: "MUG-BLU", quantity: 2 }],
        })
      ).status,
      409,
    );
    await f.seller.request(`/incidents/${f.id}/close`, {});
    assert.equal(
      (
        await f.buyer.request(`/shops/${shop.slug}/basket-items`, {
          sku: "MUG-RED",
          quantity: 1,
        })
      ).status,
      409,
    );
  } finally {
    await f.close();
  }
});

test("RestoreCart unified product editor confirms evidence and stock atomically, including manual products", async () => {
  const f = await fixture();
  try {
    await f.seller.request(`/incidents/${f.id}/example`, {});
    const current = (
      await f.seller.request(`/incidents/${f.id}/reconstruct`, {})
    ).data;
    const body = {
      revision: current.revision,
      sku: "MUG-BLU",
      name: "Blue mug",
      description: "A blue stoneware mug",
      price: "20.00",
      quantity: 8,
      allocation: 3,
      confirm: true,
      excluded: false,
      resolutionNote: "New stock sheet confirms $20.",
      imageSourceId: "",
    };
    const bad = await f.seller.request(`/incidents/${f.id}/editor-product`, {
      ...body,
      quantity: 1,
    });
    assert.equal(bad.status, 400);
    assert.equal(incident(f.db, f.id).revision, current.revision);
    assert.equal(incident(f.db, f.id).products[0].allocation, 0);
    assert.equal(
      (await f.buyer.request(`/incidents/${f.id}/editor-product`, body)).status,
      403,
    );
    const saved = await f.seller.request(
      `/incidents/${f.id}/editor-product`,
      body,
    );
    assert.equal(saved.status, 200);
    const readiness = (await f.seller.request(`/incidents/${f.id}/readiness`))
      .data;
    assert.equal(
      readiness.products.find((p: any) => p.sku === "MUG-BLU").status,
      "ready",
    );
    assert.equal(
      readiness.products.find((p: any) => p.sku === "MUG-BLU").count.quantity,
      8,
    );
    assert.equal(
      (
        await f.seller.request(`/incidents/${f.id}/editor-product`, {
          ...body,
          revision: saved.data.revision,
          create: true,
        })
      ).status,
      409,
    );
    const manual = await f.seller.request(`/incidents/${f.id}/editor-product`, {
      ...body,
      revision: saved.data.revision,
      sku: "HAND-001",
      name: "Handmade card",
      price: "4.00",
      quantity: 3,
      allocation: 2,
      create: true,
    });
    assert.equal(manual.status, 200);
    assert.equal(
      manual.data.products.find((p: any) => p.sku === "HAND-001").allocation,
      2,
    );
  } finally {
    await f.close();
  }
});

test("RestoreCart AI review and payment help are private explanations and never mutate catalog or payment facts", async () => {
  const f = await fixture();
  try {
    const shop = await prepare(f),
      before = JSON.stringify(incident(f.db, f.id));
    const reviewed = await f.seller.request(`/incidents/${f.id}/review`, {});
    assert.equal(reviewed.status, 200);
    assert.equal(reviewed.data.source, "fixture");
    assert.equal(JSON.stringify(incident(f.db, f.id)), before);
    assert.equal(
      (await f.buyer.request(`/incidents/${f.id}/review`, {})).status,
      403,
    );
    const made = await f.buyer.request(`/shops/${shop.slug}/orders`, {
      requestKey: "explain-recorded-payment",
      revision: shop.published.revision,
      lines: [{ sku: "MUG-BLU", quantity: 1 }],
    });
    const beforeOrder = JSON.stringify(order(f.db, made.data.id));
    const help = await f.seller.request(`/incidents/${f.id}/payment-help`, {
      orderId: made.data.id,
    });
    assert.equal(help.status, 200);
    assert.equal(help.data.facts.state, "awaiting_buyer");
    assert.equal(help.data.nextAction, "check_again");
    assert.equal(JSON.stringify(order(f.db, made.data.id)), beforeOrder);
    assert.equal(
      (
        await f.buyer.request(`/incidents/${f.id}/payment-help`, {
          orderId: made.data.id,
        })
      ).status,
      403,
    );
    await f.stranger.request("/register", {
      email: "assistant-other@example.test",
      username: "assistant-other",
      password: "AssistantOther2026!",
      role: "seller",
    });
    const other = await f.stranger.request("/incidents", {
      name: "Other seller",
    });
    assert.equal(
      (
        await f.stranger.request(`/incidents/${other.data.id}/payment-help`, {
          orderId: made.data.id,
        })
      ).status,
      403,
    );
  } finally {
    await f.close();
  }
});
