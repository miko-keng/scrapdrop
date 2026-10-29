import { OrderProgress } from "./OrderProgress";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Upload,
  Sparkles,
  Eye,
  Download,
  Plus,
  CheckCircle2,
  Package,
  X,
  RefreshCw,
} from "lucide-react";
import { MappingPanel, RecoveryPanel } from "./Continuity";
import "./seller.css";
type Props = {
  current: any;
  incidents: any[];
  session: any;
  api: (path: string, body?: any, method?: string) => Promise<any>;
  run: (label: string, fn: () => Promise<any>) => Promise<void>;
  busy: string;
  load: (id: string) => Promise<any>;
  loadList: () => Promise<any>;
};
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n / 100,
  );
export function SellerWorkspace(p: Props) {
  const [section, setSection] = useState("Shop editor"),
    [readiness, setReadiness] = useState<any>(null),
    [mappings, setMappings] = useState<any[]>([]),
    [review, setReview] = useState<any>(null),
    [preview, setPreview] = useState(false),
    [creating, setCreating] = useState(false),
    [message, setMessage] = useState(""),
    [newName, setNewName] = useState(""),
    [orders, setOrders] = useState<any[]>([]),
    [filter, setFilter] = useState("All"),
    [contact, setContact] = useState<any>(null),
    [loadError, setLoadError] = useState(""),
    [restoreMode, setRestoreMode] = useState("operational");
  const shop = p.current,
    closed = shop && !["draft", "live"].includes(shop.state);
  async function refresh() {
    await p.load(shop.id);
    await p.loadList();
  }
  async function refreshOrders() {
    setOrders(await p.api(`/orders?incident=${shop.id}`));
  }
  useEffect(() => {
    setReview(null);
    setCreating(false);
    setMessage("");
    setReadiness(null);
    setOrders([]);
    setFilter("All");
    setContact(null);
  }, [shop?.id]);
  useEffect(() => {
    if (!shop) return;
    let alive = true;
    setLoadError("");
    Promise.all([
      p.api(`/incidents/${shop.id}/readiness`),
      p.api(`/incidents/${shop.id}/mappings`),
      p.api(`/incidents/${shop.id}/contact`),
      p.api(`/orders?incident=${shop.id}`),
    ])
      .then(([r, m, c, o]) => {
        if (alive) {
          setReadiness(r);
          setMappings(m);
          setContact(c);
          setOrders(o);
        }
      })
      .catch((e: any) => {
        if (alive) setLoadError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [shop?.id, shop?.revision]);
  // New buyer orders do not change the catalog revision. Refresh independently.
  useEffect(() => {
    if (!shop || section !== "Orders") return;
    let alive = true;
    const update = () => {
      if (document.visibilityState === "hidden") return;
      void p
        .api(`/orders?incident=${shop.id}`)
        .then((o) => {
          if (alive) {
            setOrders(o);
            setLoadError("");
          }
        })
        .catch((e: any) => {
          if (alive) setLoadError(e.message);
        });
    };
    update();
    const timer = window.setInterval(update, 15000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [section, shop?.id]);
  async function files(files: FileList | null) {
    if (!files) return;
    await p.run("Saving source files", async () => {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024)
          throw Error("Each file must be 5 MB or smaller.");
        const data = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1]);
          r.onerror = () => reject(Error("Could not read file."));
          r.readAsDataURL(file);
        });
        await p.api(`/incidents/${shop.id}/sources`, { name: file.name, data });
      }
      await refresh();
      setMessage(
        "Files saved. Select Import with Gemini to prepare your products.",
      );
    });
  }
  async function backup() {
    await p.run("Preparing shop backup", async () => {
      const k = await p.api(`/incidents/${shop.id}/kits`, {});
      location.assign(`/api/restorecart/kits/${k.id}`);
      setMessage(`Shop backup version ${k.version} downloaded.`);
    });
  }
  async function restore(file: File | undefined, practice: boolean) {
    if (!file) return;
    await p.run("Restoring shop backup", async () => {
      if (file.size > 28_000_000) throw Error("Backup file is too large.");
      const kit = await p.api("/kits/import", {
        kit: JSON.parse(await file.text()),
      });
      const result = await p.api(`/kits/${kit.id}/restore`, {
        mode: practice ? "rehearsal" : "operational",
      });
      await p.loadList();
      await p.load(result.incident.id);
      setSection("Shop editor");
      setMessage(result.report.message);
    });
  }
  useEffect(() => {
    if (!preview) return;
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(false);
      if (e.key === "Tab") {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".rc-draft-preview button,.rc-draft-preview a[href]",
          ),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [preview]);
  const publishBlockers: string[] = [];
  if (closed) publishBlockers.push("This shop is closed to new orders.");
  if (shop?.rehearsal)
    publishBlockers.push("Practice mode cannot publish or take payments.");
  if (shop && !readiness) publishBlockers.push("Checking product readiness…");
  if (readiness && !readiness.products?.some((r: any) => r.status === "ready"))
    publishBlockers.push("Confirm at least one product and set aside stock.");
  const incomplete =
    readiness?.products?.filter((r: any) => r.status === "needs-information") ||
    [];
  if (incomplete.length)
    publishBlockers.push(
      `Finish reviewing ${incomplete.length} product(s), or hide them from the shop.`,
    );
  if (shop && !shop.pickup?.trim())
    publishBlockers.push("Save pickup instructions in Shop details below.");
  const pending = orders.filter(
    (o) =>
      !["paid", "failed", "canceled"].includes(o.state) ||
      o.refund?.state === "checking",
  );
  function matches(o: any) {
    if (filter === "All") return true;
    if (filter === "Payment checking")
      return pending.some((x) => x.id === o.id);
    if (filter === "Canceled / refunded")
      return o.state === "canceled" || o.refunded > 0;
    if (filter === "Ready for pickup")
      return o.fulfillment === "ready" && !o.refunded;
    if (filter === "Collected") return o.fulfillment === "collected";
    return (
      o.state === "paid" &&
      !o.refunded &&
      !["ready", "collected"].includes(o.fulfillment)
    );
  }
  return (
    <main className="rc-workspace rc-seller-workspace">
      <div className="rc-workspace-heading">
        <div>
          <span className="rc-eyebrow">YOUR SELLER WORKSPACE</span>
          <h1>Your shop, ready to reopen.</h1>
          <p>Import your records, confirm the details and publish.</p>
        </div>
        <span className="rc-pill">
          {p.session.ai?.mode === "live" ? "Gemini enabled" : "AI offline"}
        </span>
      </div>
      <div className="rc-seller-selector">
        <label>
          Your shop
          <select
            aria-label="Select rescue shop"
            value={shop?.id || ""}
            disabled={!!p.busy}
            onChange={(e) =>
              p.run("Opening shop", () => p.load(e.target.value))
            }
          >
            <option value="" disabled>
              Select a shop
            </option>
            {p.incidents
              .filter((i) => !shop?.demoPrepared || i.id === shop.id)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {i.state}
                </option>
              ))}
          </select>
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            p.run("Creating shop", async () => {
              const i = await p.api("/incidents", { name: newName });
              await p.loadList();
              await p.load(i.id);
              setNewName("");
              setSection("Shop editor");
            });
          }}
        >
          <label>
            New shop name
            <input
              required
              value={newName}
              maxLength={80}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Your business name"
            />
          </label>
          <button className="rc-button secondary" disabled={!!p.busy}>
            <Plus size={17} />
            New shop
          </button>
        </form>
      </div>
      {!shop ? (
        <section className="rc-panel">
          <h2>Create your shop to get started.</h2>
          <p>Then upload records or try the sample files.</p>
        </section>
      ) : (
        <>
          <nav className="rc-tabs" aria-label="Seller sections">
            {["Shop editor", "Orders", "Recovery"].map((t) => (
              <button
                key={t}
                className={t === section ? "active" : ""}
                aria-current={t === section ? "page" : undefined}
                onClick={() => setSection(t)}
              >
                {t}
              </button>
            ))}
          </nav>
          <div className="rc-editor-toolbar">
            <span>
              <b>{shop.name}</b> ·{" "}
              {shop.state === "live"
                ? "Published"
                : shop.state === "draft"
                  ? "Unpublished draft"
                  : "Closed to new orders"}
            </span>
            <div>
              <button
                className="rc-button secondary"
                onClick={() => setPreview(true)}
              >
                <Eye size={16} />
                Preview saved draft
              </button>
              {shop.published && (
                <a
                  className="rc-button secondary"
                  href={`/s/${shop.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View published shop ↗
                </a>
              )}
              <button
                className="rc-button"
                disabled={!!p.busy || publishBlockers.length > 0}
                aria-describedby="rc-publish-status"
                onClick={() =>
                  p.run("Publishing shop", async () => {
                    await p.api(`/incidents/${shop.id}/publish`, {
                      revision: shop.revision,
                    });
                    await refresh();
                    setMessage(
                      "Published. Your customers can now order from this shop.",
                    );
                  })
                }
              >
                {shop.published ? "Publish changes" : "Publish shop"}
              </button>
            </div>
            <p
              id="rc-publish-status"
              className="rc-publish-status"
              role="status"
            >
              {publishBlockers.length
                ? publishBlockers.join(" ")
                : "Ready to publish your saved products and shop details."}
            </p>
          </div>
          {loadError && (
            <p role="alert" className="rc-alert">
              Could not refresh this workspace: {loadError}
            </p>
          )}
          {shop.demoPrepared && section === "Shop editor" && (
            <p className="rc-notice">
              Prepared demo: sample records and shop details are already saved.
              Complete the product review below. These starting records were
              preloaded; use Review with Gemini for live AI assistance.
            </p>
          )}
          {message && (
            <p className="rc-notice" role="status">
              <CheckCircle2 size={17} />
              {message}
            </p>
          )}
          {shop.rehearsal && (
            <section className="rc-panel">
              <h3>Practice draft · payments disabled</h3>
              <p>
                This backup rehearsal cannot publish or change the original
                shop.
              </p>
              <button
                className="rc-button secondary"
                disabled={!!p.busy}
                onClick={() =>
                  p.run("Practicing record return", async () => {
                    const result = await p.api(
                      `/incidents/${shop.id}/rehearse-return`,
                      {},
                    );
                    setMessage(
                      `${result.passed ? "Passed" : "Needs attention"}: ${result.firstChanges} first-run changes, ${result.repeatChanges} repeat changes. No real orders changed.`,
                    );
                  })
                }
              >
                Practice returning a sale
              </button>
            </section>
          )}
          {section === "Shop editor" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <section className="rc-panel">
                <div className="rc-seller-sectionhead">
                  <div>
                    <span className="rc-eyebrow">1 · IMPORT</span>
                    <h2>Bring your product records.</h2>
                    <p>
                      Gemini reads your documents and matches photos to
                      variants. Original files stay private.
                    </p>
                  </div>
                  <details className="rc-backup-menu">
                    <summary>Shop backup</summary>
                    <button
                      className="rc-link"
                      disabled={!!p.busy || !shop.products.length}
                      onClick={backup}
                    >
                      <Download size={16} />
                      Download shop backup
                    </button>
                    <p>
                      A backup contains products, pictures and shop details, not
                      orders. Restoring creates an unpublished shop with fresh
                      stock checks.
                    </p>
                    <label>
                      Open backup as
                      <select
                        value={restoreMode}
                        onChange={(e) => setRestoreMode(e.target.value)}
                      >
                        <option value="operational">New shop draft</option>
                        <option value="rehearsal">
                          Practice only — no publishing or payments
                        </option>
                      </select>
                    </label>
                    <label className="rc-link">
                      Upload shop backup (.json)
                      <input
                        className="rc-sr"
                        type="file"
                        accept=".json"
                        disabled={!!p.busy}
                        onChange={(e) => {
                          void restore(
                            e.target.files?.[0],
                            restoreMode === "rehearsal",
                          );
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <small>
                      Use a backup downloaded from RestoreCart. For CSV, PDF or
                      pictures, use the product-record upload below.
                    </small>
                  </details>
                </div>
                <label className="rc-seller-drop">
                  <Upload size={26} />
                  <b>Choose CSV, PDF or product images</b>
                  <span>5 MB each · up to 10 files</span>
                  <input
                    type="file"
                    accept=".csv,.pdf,.png,.jpg,.jpeg"
                    multiple
                    className="rc-sr"
                    disabled={!!p.busy || closed}
                    onChange={(e) => {
                      void files(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                <div className="rc-buttonrow">
                  <button
                    className="rc-button secondary"
                    disabled={!!p.busy || closed || shop.sources?.length > 0}
                    onClick={() =>
                      p.run("Loading sample files", async () => {
                        await p.api(`/incidents/${shop.id}/example`, {});
                        await refresh();
                        setMessage(
                          "Sample files loaded. Select Import with Gemini.",
                        );
                      })
                    }
                  >
                    Use sample files
                  </button>
                  <button
                    className="rc-button"
                    disabled={!!p.busy || closed || !shop.sources?.length}
                    onClick={() =>
                      p.run("Gemini is preparing your catalog", async () => {
                        await p.api(`/incidents/${shop.id}/reconstruct`, {});
                        await refresh();
                        setReview(null);
                        setMessage(
                          "Catalog prepared. Check highlighted questions and confirm stock below.",
                        );
                      })
                    }
                  >
                    <Sparkles size={17} />
                    Import with Gemini
                  </button>
                </div>
                <small>
                  Import sends these records and images to Gemini. AI
                  suggestions are never published automatically.
                </small>
                {shop.sources?.length > 0 && (
                  <details className="rc-source-files">
                    <summary>{shop.sources.length} source files</summary>
                    {shop.sources.map((s: any) => (
                      <a
                        href={`/api/restorecart/sources/${s.id}`}
                        target="_blank"
                        rel="noreferrer"
                        key={s.id}
                      >
                        {s.name}
                      </a>
                    ))}
                  </details>
                )}
                {mappings.some((m) => m.recognizedProducts === 0) &&
                  !shop.products.length && (
                    <details>
                      <summary>
                        Import needs help identifying spreadsheet columns
                      </summary>
                      <MappingPanel
                        current={shop}
                        api={p.api}
                        run={p.run}
                        busy={p.busy}
                        dirty={false}
                        refresh={refresh}
                      />
                    </details>
                  )}
              </section>
              <section className="rc-panel">
                <div className="rc-seller-sectionhead">
                  <div>
                    <span className="rc-eyebrow">2 · REVIEW</span>
                    <h2>Check your products.</h2>
                    <p>
                      {readiness?.products?.filter(
                        (r: any) => r.status === "ready",
                      ).length || 0}{" "}
                      ready ·{" "}
                      {readiness?.products?.filter(
                        (r: any) => r.status === "needs-information",
                      ).length || 0}{" "}
                      need attention
                    </p>
                  </div>
                  <button
                    className="rc-button secondary"
                    disabled={!!p.busy || closed || !shop.products.length}
                    onClick={() =>
                      p.run("Gemini is reviewing source evidence", async () => {
                        setReview(
                          await p.api(`/incidents/${shop.id}/review`, {}),
                        );
                      })
                    }
                  >
                    <Sparkles size={16} />
                    Review with Gemini
                  </button>
                </div>
                {review && (
                  <div className="rc-ai-review">
                    <b>
                      {review.source === "gemini"
                        ? "Gemini review"
                        : "Test review"}
                      {review.cached ? " · saved answer" : ""}
                    </b>
                    <p>{review.summary}</p>
                    {review.questions.map((q: any, i: number) => (
                      <p key={i}>
                        <strong>{q.sku}:</strong> {q.text}
                      </p>
                    ))}
                    <small>
                      Suggestions below fill draft fields only. You confirm and
                      save each product.
                    </small>
                  </div>
                )}
                {!shop.products.length && !creating && (
                  <p>
                    Import your records to prepare products, or add one
                    manually.
                  </p>
                )}
                {shop.products.map((product: any) => {
                  const row = readiness?.products?.find(
                    (r: any) => r.sku === product.sku,
                  );
                  return (
                    <details
                      className="rc-seller-product"
                      key={`${shop.id}:${product.sku}:${shop.revision}`}
                      open={
                        row?.status !== "ready" && row?.status !== "excluded"
                      }
                    >
                      <summary>
                        <span>
                          <b>{product.name}</b>
                          <small>{product.sku}</small>
                        </span>
                        <span>
                          {product.price ? `$${product.price}` : "Price needed"}
                        </span>
                        <span className="rc-pill">
                          {row?.status === "ready"
                            ? "Ready"
                            : row?.status === "excluded"
                              ? "Excluded"
                              : "Needs attention"}
                        </span>
                      </summary>
                      <ProductForm
                        key={`${shop.revision}:${row?.count?.at || "loading"}`}
                        product={product}
                        row={row}
                        shop={shop}
                        review={review}
                        closed={closed}
                        p={p}
                        saved={async () => {
                          await refresh();
                          setMessage("Product saved.");
                        }}
                      />
                    </details>
                  );
                })}
                {creating && (
                  <ProductForm
                    key={`new:${shop.id}`}
                    product={{
                      sku: "",
                      name: "",
                      description: "",
                      price: "",
                      allocation: 0,
                      resolutionNote: "",
                    }}
                    shop={shop}
                    review={null}
                    closed={closed}
                    p={p}
                    create
                    saved={async () => {
                      setCreating(false);
                      await refresh();
                      setMessage("Product added.");
                    }}
                  />
                )}
                <button
                  className="rc-link"
                  disabled={!!p.busy || closed}
                  onClick={() => setCreating(!creating)}
                >
                  <Plus size={16} />
                  {creating ? "Cancel new product" : "Add product manually"}
                </button>
              </section>
              {contact && (
                <ShopDetails
                  key={shop.id}
                  p={p}
                  contact={contact}
                  saved={async () => {
                    await refresh();
                    setMessage(
                      "Shop details saved. Publish to update the public version.",
                    );
                  }}
                />
              )}
            </motion.div>
          )}
          {section === "Orders" && (
            <section className="rc-panel">
              <div className="rc-seller-sectionhead">
                <div>
                  <h2>Orders</h2>
                  <p>
                    Orders for <b>{shop.name}</b> only. Refreshes automatically
                    every 15 seconds.
                  </p>
                  <small>
                    Missing an order? Check the shop selected above and the
                    seller account that owns the published link.
                  </small>
                </div>
                <button
                  className="rc-button secondary"
                  disabled={!!p.busy}
                  onClick={() => p.run("Refreshing orders", refreshOrders)}
                >
                  <RefreshCw size={16} />
                  Refresh
                </button>
              </div>
              {shop.demoPrepared && (
                <details className="rc-panel">
                  <summary>
                    Example order statuses — simulated, no payments
                  </summary>
                  <p>
                    These examples are not real orders. They do not affect
                    stock, PayPal totals or recovery reports.
                  </p>
                  {[
                    {
                      state: "pending",
                      fulfillment: "not_ready",
                      refunded: 0,
                      name: "Payment checking",
                    },
                    {
                      state: "paid",
                      fulfillment: "not_ready",
                      refunded: 0,
                      name: "To prepare",
                    },
                    {
                      state: "paid",
                      fulfillment: "ready",
                      refunded: 0,
                      name: "Ready for pickup",
                    },
                    {
                      state: "paid",
                      fulfillment: "collected",
                      refunded: 0,
                      name: "Collected",
                    },
                    {
                      state: "canceled",
                      fulfillment: "not_ready",
                      refunded: 0,
                      name: "Canceled",
                    },
                    {
                      state: "paid",
                      fulfillment: "canceled",
                      refunded: 2000,
                      name: "Refunded",
                    },
                  ].map((example) => (
                    <article key={example.name}>
                      <b>Example: {example.name} · 1 × Blue mug · $20.00</b>
                      <OrderProgress order={example} />
                    </article>
                  ))}
                </details>
              )}
              <div className="rc-order-filters">
                {[
                  "All",
                  "Payment checking",
                  "To prepare",
                  "Ready for pickup",
                  "Collected",
                  "Canceled / refunded",
                ].map((f) => (
                  <button
                    key={f}
                    className={filter === f ? "active" : ""}
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {!orders.filter(matches).length ? (
                <p>
                  {orders.length
                    ? "No orders match this filter. Choose All to see every status."
                    : `No orders for ${shop.name}. Orders from another shop or seller account appear in that owner’s workspace.`}
                </p>
              ) : (
                orders
                  .filter(matches)
                  .map((o) => (
                    <SellerOrder
                      key={o.id}
                      order={o}
                      shop={shop}
                      p={p}
                      refreshed={refreshOrders}
                    />
                  ))
              )}
            </section>
          )}
          {section === "Recovery" && (
            <>
              <section className="rc-panel">
                <span className="rc-eyebrow">FINISH EMERGENCY SELLING</span>
                <h2>Return to your original shop.</h2>
                <ol className="rc-recovery-steps">
                  <li>
                    <h3>Stop accepting new orders</h3>
                    <p>Existing payments will continue to be checked.</p>
                    <button
                      className="rc-button secondary"
                      disabled={!!p.busy || shop.state !== "live"}
                      onClick={() =>
                        p.run("Stopping new orders", async () => {
                          await p.api(`/incidents/${shop.id}/close`, {});
                          await refresh();
                          setMessage(
                            "New orders stopped. Check outstanding payments before downloading the final report.",
                          );
                        })
                      }
                    >
                      {closed
                        ? "New orders stopped"
                        : shop.state === "draft"
                          ? "Shop is not published"
                          : "Stop new orders"}
                    </button>
                  </li>
                  <li>
                    <h3>Check unresolved payments</h3>
                    <p>
                      {pending.length
                        ? `${pending.length} orders need a payment or refund outcome.`
                        : "No unresolved payments."}
                    </p>
                    <button
                      className="rc-link"
                      onClick={() => {
                        setFilter("Payment checking");
                        setSection("Orders");
                      }}
                    >
                      Review payment issues →
                    </button>
                  </li>
                  <li>
                    <h3>Download your sales report</h3>
                    <p>
                      Orders, payments, refunds and stock movements recorded
                      during the outage.
                    </p>
                    <button
                      className="rc-button"
                      disabled={!!p.busy || !closed || pending.length > 0}
                      onClick={() =>
                        p.run("Preparing sales report", async () => {
                          const report = await p.api(
                            `/incidents/${shop.id}/exports`,
                            {},
                          );
                          await refresh();
                          location.assign(
                            `/api/restorecart/exports/${report.manifest.id}?file=report`,
                          );
                          setMessage(
                            "Sales report downloaded. Your original website has not been changed.",
                          );
                        })
                      }
                    >
                      <Download size={17} />
                      Download sales report
                    </button>
                  </li>
                </ol>
              </section>
              <details className="rc-panel">
                <summary>Optional: update original-store records</summary>
                <p>
                  Compare a fresh Original Store JSON v1 file with emergency
                  sales. This updates a local file, not Shopify or WooCommerce.
                </p>
                <RecoveryPanel
                  current={shop}
                  api={p.api}
                  run={p.run}
                  busy={p.busy}
                  dirty={false}
                  refresh={refresh}
                />
              </details>
            </>
          )}
        </>
      )}
      {preview && shop && (
        <div className="rc-modal-backdrop" onClick={() => setPreview(false)}>
          <section
            className="rc-modal rc-draft-preview"
            role="dialog"
            aria-modal="true"
            aria-label="Saved draft preview"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="rc-iconbutton rc-modal-close"
              aria-label="Close preview"
              onClick={() => setPreview(false)}
            >
              <X />
            </button>
            <span className="rc-eyebrow">
              SAVED DRAFT PREVIEW · NO CHECKOUT
            </span>
            <h2>{shop.name}</h2>
            <p>{contact?.status}</p>
            <p>{shop.pickup || "Add pickup instructions before publishing."}</p>
            <div className="rc-draft-products">
              {shop.products
                .filter((v: any) => !v.excluded)
                .map((v: any) => (
                  <article key={v.sku}>
                    {v.imageSourceId ? (
                      <img
                        src={`/api/restorecart/sources/${v.imageSourceId}`}
                        alt={v.name}
                      />
                    ) : (
                      <Package size={40} />
                    )}
                    <h3>{v.name}</h3>
                    <b>{v.price ? `$${v.price}` : "Price needed"}</b>
                    <p>{v.description}</p>
                    <small>{v.allocation} set aside</small>
                  </article>
                ))}
            </div>
            <p>
              Only saved changes appear here. Publish changes when you are ready
              for customers to see them.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
function ProductForm({
  product,
  row,
  shop,
  review,
  closed,
  p,
  saved,
  create = false,
}: any) {
  const [fields, setFields] = useState({
    ...product,
    quantity: row?.count?.quantity ?? product.allocation,
    confirm: false,
    imageSourceId: product.imageSourceId || "",
  });
  const change = (key: string, value: any) =>
    setFields((f: any) => ({ ...f, [key]: value }));
  const suggestions =
    review?.suggestions?.filter((s: any) => s.sku === product.sku) || [];
  return (
    <form
      className="rc-product-form"
      onSubmit={(e) => {
        e.preventDefault();
        p.run("Saving product", async () => {
          await p.api(`/incidents/${shop.id}/editor-product`, {
            revision: shop.revision,
            sku: fields.sku,
            name: fields.name,
            description: fields.description || "",
            price: fields.price ? Number(fields.price).toFixed(2) : "",
            quantity: Number(fields.quantity) || 0,
            allocation: Number(fields.allocation) || 0,
            excluded: !!fields.excluded,
            confirm: fields.confirm,
            resolutionNote: fields.resolutionNote || "",
            imageSourceId: fields.imageSourceId,
            create,
          });
          await saved();
        });
      }}
    >
      {row?.questions?.length > 0 && (
        <div className="rc-product-questions">
          {row.questions.map((q: string) => (
            <p key={q}>{q}</p>
          ))}
        </div>
      )}
      {suggestions.map((s: any, i: number) => (
        <div className="rc-ai-suggestion" key={i}>
          <b>Suggested {s.field === "imageSourceId" ? "photo" : s.field}</b>
          <p>
            {s.field === "imageSourceId"
              ? shop.sources.find((x: any) => x.id === s.value)?.name
              : s.value}
          </p>
          <p>{s.reason}</p>
          <small>
            {shop.sources.find((x: any) => x.id === s.sourceId)?.name}:{" "}
            {s.excerpt}
          </small>
          <button
            type="button"
            className="rc-link"
            onClick={() => change(s.field, s.value)}
          >
            Use suggestion in draft
          </button>
        </div>
      ))}
      <div className="rc-formgrid">
        <label>
          Product name
          <input
            required
            value={fields.name}
            onChange={(e) => change("name", e.target.value)}
            maxLength={160}
          />
        </label>
        <label>
          SKU / variant ID
          <input
            required
            value={fields.sku}
            readOnly={!create}
            maxLength={80}
            onChange={(e) => change("sku", e.target.value)}
          />
        </label>
        <label>
          Price (USD)
          <input
            required={!fields.excluded}
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{1,2})?"
            value={fields.price}
            onChange={(e) => change("price", e.target.value)}
          />
        </label>
        <label>
          Product photo
          <select
            value={fields.imageSourceId}
            onChange={(e) => change("imageSourceId", e.target.value)}
          >
            <option value="">Illustrative placeholder</option>
            {shop.sources
              .filter((s: any) => s.mime.startsWith("image/"))
              .map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Physical units counted
          <input
            type="number"
            min={0}
            max={10000}
            required
            value={fields.quantity}
            onChange={(e) => change("quantity", e.target.value)}
          />
        </label>
        <label>
          Set aside for this shop
          <input
            type="number"
            min={0}
            max={Number(fields.quantity) || 0}
            maxLength={5}
            required
            value={fields.allocation}
            onChange={(e) => change("allocation", e.target.value)}
          />
        </label>
      </div>
      {fields.imageSourceId && (
        <img
          className="rc-confirm-image"
          src={`/api/restorecart/sources/${fields.imageSourceId}`}
          alt={`Confirm photo for ${fields.name}`}
        />
      )}
      <label>
        Description
        <textarea
          maxLength={1000}
          value={fields.description || ""}
          onChange={(e) => change("description", e.target.value)}
        />
      </label>
      {new Set(
        product.candidates
          ?.filter((e: any) => e.field === "price")
          .map((e: any) => e.value),
      ).size > 1 && (
        <label>
          Which source confirms the current price?
          <input
            required={!fields.excluded}
            value={fields.resolutionNote}
            maxLength={1000}
            onChange={(e) => change("resolutionNote", e.target.value)}
          />
        </label>
      )}
      {product.candidates?.length > 0 && (
        <details className="rc-evidence-details">
          <summary>Source evidence</summary>
          {product.candidates.map((e: any, i: number) => (
            <p key={i}>
              <b>
                {e.field}: {e.value}
              </b>{" "}
              ·{" "}
              <a
                href={`/api/restorecart/sources/${e.sourceId}`}
                target="_blank"
                rel="noreferrer"
              >
                {shop.sources.find((s: any) => s.id === e.sourceId)?.name}
              </a>{" "}
              · {e.excerpt}
            </p>
          ))}
        </details>
      )}
      <div className="rc-product-confirm">
        <label>
          <input
            type="checkbox"
            checked={!!fields.excluded}
            onChange={(e) => change("excluded", e.target.checked)}
          />
          Hide this product from the shop
        </label>
        <small>
          Keep it in your records, but leave it out of the next published
          catalog. Save this product, then publish changes to update an existing
          shop.
        </small>
        <label>
          <input
            type="checkbox"
            required={!fields.excluded}
            checked={fields.confirm}
            onChange={(e) => change("confirm", e.target.checked)}
          />
          I checked the product, price and photo, counted the stock, and set
          these units aside.
        </label>
        <small>Keep set-aside units out of other selling channels.</small>
      </div>
      <button className="rc-button secondary" disabled={!!p.busy || closed}>
        Save product
      </button>
    </form>
  );
}
function ShopDetails({ p, contact, saved }: any) {
  const shop = p.current;
  return (
    <section className="rc-panel">
      <span className="rc-eyebrow">3 · SHOP DETAILS</span>
      <h2>How customers can reach you.</h2>
      <p>
        Enter these details yourself, then publish to update the customer
        version.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          p.run("Saving shop details", async () => {
            await p.api(`/incidents/${shop.id}/contact`, {
              contact: String(f.get("contact")),
              hours: String(f.get("hours")),
              status: String(f.get("status")),
            });
            await p.api(
              `/incidents/${shop.id}`,
              {
                revision: shop.revision,
                name: String(f.get("name")),
                pickup: String(f.get("pickup")),
                originalUrl: String(f.get("originalUrl")),
                products: shop.products.map(
                  ({ issues, available, ...product }: any) => product,
                ),
              },
              "PATCH",
            );
            await saved();
          });
        }}
      >
        <div className="rc-formgrid">
          <label>
            Shop name
            <input
              name="name"
              required
              defaultValue={shop.name}
              maxLength={80}
            />
          </label>
          <label>
            Public contact
            <input
              name="contact"
              defaultValue={contact.contact}
              maxLength={160}
            />
          </label>
          <label>
            Pickup hours
            <input name="hours" defaultValue={contact.hours} maxLength={160} />
          </label>
          <label>
            Original website (optional)
            <input
              name="originalUrl"
              type="url"
              pattern="https://.*"
              defaultValue={shop.originalUrl}
            />
          </label>
        </div>
        <label>
          Pickup instructions
          <textarea
            name="pickup"
            required
            defaultValue={shop.pickup}
            maxLength={1000}
          />
        </label>
        <label>
          Message for customers
          <textarea
            name="status"
            defaultValue={contact.status}
            maxLength={300}
          />
        </label>
        <button
          className="rc-button secondary"
          disabled={!!p.busy || !["draft", "live"].includes(shop.state)}
        >
          Save shop details
        </button>
      </form>
      {shop.published && (
        <div className="rc-published-link">
          <label>
            Published shop link
            <input readOnly value={`${location.origin}/s/${shop.slug}`} />
          </label>
          <button
            className="rc-link"
            onClick={async () => {
              await navigator.clipboard.writeText(
                `${shop.name}: ${location.origin}/s/${shop.slug}\n${contact.status}\n${shop.published.pickup}`,
              );
              p.run("Announcement copied", async () => {});
            }}
          >
            Copy customer announcement
          </button>
        </div>
      )}
    </section>
  );
}
function SellerOrder({ order: o, shop, p, refreshed }: any) {
  const [help, setHelp] = useState<any>(null),
    [confirmRefund, setConfirmRefund] = useState(false),
    [confirmStock, setConfirmStock] = useState(false);
  const blocked = o.refund?.state === "checking";
  return (
    <article className="rc-order">
      <div className="rc-orderhead">
        <h3>{money(o.amount)}</h3>
        <b>{o.state.replaceAll("_", " ")}</b>
        <span>{o.fulfillment.replaceAll("_", " ")}</span>
        <small>{o.id.slice(-8)}</small>
      </div>
      <p>
        {o.snapshot.lines
          .map((l: any) => `${l.quantity} × ${l.name}`)
          .join(" · ")}
      </p>
      {o.refunded > 0 && (
        <p>Refunded {money(o.refunded)}. Stock is restored separately.</p>
      )}
      {blocked && (
        <p>
          Refund outcome is being checked. Do not hand over or restock these
          items yet.
        </p>
      )}
      <div className="rc-buttonrow">
        <button
          className="rc-button secondary"
          disabled={!!p.busy}
          onClick={() =>
            p.run("Checking PayPal status", async () => {
              await p.api(`/orders/${o.id}/check`, {});
              setHelp(null);
              await refreshed();
            })
          }
        >
          Check PayPal again
        </button>
        <button
          className="rc-link"
          disabled={!!p.busy}
          onClick={() =>
            p.run("Gemini is explaining the recorded status", async () =>
              setHelp(
                await p.api(`/incidents/${shop.id}/payment-help`, {
                  orderId: o.id,
                }),
              ),
            )
          }
        >
          <Sparkles size={16} />
          Explain with Gemini
        </button>
        {o.state === "paid" &&
          !o.refunded &&
          !blocked &&
          o.fulfillment !== "collected" && (
            <button
              className="rc-button"
              disabled={!!p.busy}
              onClick={() =>
                p.run("Updating pickup", async () => {
                  await p.api(`/orders/${o.id}/fulfillment`, {
                    state: o.fulfillment === "ready" ? "collected" : "ready",
                  });
                  await refreshed();
                })
              }
            >
              {o.fulfillment === "ready"
                ? "Mark collected"
                : "Mark ready for pickup"}
            </button>
          )}
      </div>
      {help && (
        <div className="rc-ai-review">
          <b>
            Recorded status: {help.facts.state} ·{" "}
            {money(help.facts.amount - help.facts.refunded)} net
          </b>
          <p>{help.explanation}</p>
          <p>Suggested next step: {help.nextAction.replaceAll("_", " ")}</p>
          <small>
            {help.uncertainty} Gemini cannot change payment status or issue a
            refund.
          </small>
        </div>
      )}
      {o.state === "paid" && !o.refunded && (
        <details>
          <summary>Refund options</summary>
          <label>
            <input
              type="checkbox"
              checked={confirmRefund}
              onChange={(e) => setConfirmRefund(e.target.checked)}
            />
            I want to refund {money(o.amount)} through PayPal sandbox.
          </label>
          <button
            className="rc-button secondary"
            disabled={!confirmRefund || !!p.busy}
            onClick={() =>
              p.run("Requesting refund", async () => {
                await p.api(`/orders/${o.id}/refund`, {});
                await refreshed();
                setConfirmRefund(false);
              })
            }
          >
            Request full refund
          </button>
        </details>
      )}
      {o.refunded > 0 && !o.refund?.restocked && !blocked && (
        <details>
          <summary>Return items to stock</summary>
          <label>
            <input
              type="checkbox"
              checked={confirmStock}
              onChange={(e) => setConfirmStock(e.target.checked)}
            />
            These items are physically back and available to sell.
          </label>
          <button
            className="rc-button secondary"
            disabled={!confirmStock || !!p.busy}
            onClick={() =>
              p.run("Restoring returned stock", async () => {
                await p.api(`/orders/${o.id}/restock`, {});
                await refreshed();
                setConfirmStock(false);
              })
            }
          >
            Confirm restock
          </button>
        </details>
      )}
    </article>
  );
}
