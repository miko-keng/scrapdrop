import { useEffect, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Archive,
  Download,
  ArrowRight,
  Clock,
  Copy,
} from "lucide-react";
import "./continuity.css";
type Props = {
  current: any;
  api: (path: string, body?: unknown, method?: string) => Promise<any>;
  run: (name: string, fn: () => Promise<any>) => Promise<void>;
  busy: string;
  dirty: boolean;
  refresh: () => Promise<any>;
  open?: (id: string) => Promise<any>;
};
const money = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    c / 100,
  );
const date = (value: any) =>
  value ? new Date(value).toLocaleString() : "Not recorded";
export function MappingPanel(p: Props) {
  const [files, setFiles] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    p.api(`/incidents/${p.current.id}/mappings`)
      .then((v) => {
        if (alive) setFiles(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [p.current.id, p.current.revision]);
  if (error) return <p role="alert">{error}</p>;
  if (!files.length) return null;
  return (
    <section className="rc-panel rc-continuity">
      <h2>Make your spreadsheet readable.</h2>
      <p>
        Match your column names once. Original files remain unchanged. Then run
        reconstruction again.
      </p>
      {files.map((f) => (
        <details key={f.id} className="rc-cont-details">
          <summary>
            {f.name} <span>{f.recognizedProducts} recognized products</span>
          </summary>
          <p>
            Uploaded {date(f.settings.uploadedAt)} · Source date{" "}
            {date(f.settings.observedAt)}. A source date is not a stock count.
          </p>
          <div className="rc-table-scroll">
            <table>
              <thead>
                <tr>
                  {f.headers.map((h: string, index: number) => (
                    <th key={index}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {f.sample.map((row: string[], index: number) => (
                  <tr key={index}>
                    {row.map((cell, j) => (
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget),
                mapping = Object.fromEntries(
                  [
                    "sku",
                    "name",
                    "price",
                    "currency",
                    "stock",
                    "description",
                  ].map((k) => [k, String(data.get(k) || "")]),
                );
              p.run("Saving column mapping", async () => {
                await p.api(`/incidents/${p.current.id}/mappings`, {
                  sourceId: f.id,
                  mapping,
                  observedAt: data.get("observedAt")
                    ? new Date(String(data.get("observedAt"))).toISOString()
                    : "",
                });
                await p.refresh();
              });
            }}
          >
            <div className="rc-formgrid">
              {["sku", "name", "price", "currency", "stock", "description"].map(
                (k) => (
                  <label key={k}>
                    {k === "sku"
                      ? "SKU / variant ID"
                      : k === "name"
                        ? "Product name"
                        : k}
                    <select
                      name={k}
                      defaultValue={
                        f.settings.mapping?.[k] ||
                        f.headers.find((h: string) => h.toLowerCase() === k) ||
                        ""
                      }
                      required={k === "sku" || k === "name"}
                    >
                      <option value="">Not supplied</option>
                      {f.headers.map((h: string, index: number) => (
                        <option key={index} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ),
              )}
              <label>
                Record date (optional)
                <input
                  name="observedAt"
                  type="datetime-local"
                  defaultValue={
                    f.settings.observedAt
                      ? new Date(
                          Date.parse(f.settings.observedAt) -
                            new Date().getTimezoneOffset() * 60000,
                        )
                          .toISOString()
                          .slice(0, 16)
                      : ""
                  }
                />
              </label>
            </div>
            <button
              className="rc-button secondary"
              disabled={!!p.busy || p.dirty}
            >
              Save column mapping
            </button>
          </form>
        </details>
      ))}
      {p.dirty && <p>Save catalog edits before changing the mapping.</p>}
    </section>
  );
}
export function ReadinessPanel(p: Props) {
  const [simulation, setSimulation] = useState<any>(null);
  const [report, setReport] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    p.api(`/incidents/${p.current.id}/readiness`)
      .then((v) => {
        if (alive) setReport(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [p.current.id, p.current.revision]);
  if (error) return <p role="alert">{error}</p>;
  if (!report || !p.current.products.length) return null;
  const closed = !["draft", "live"].includes(p.current.state);
  return (
    <section className="rc-panel rc-continuity">
      <div className="rc-cont-heading">
        <CheckCircle2 />
        <h2>What can we recover?</h2>
      </div>
      <p>
        Ready means confirmed product details, a physical stock count and a
        reserved allocation. These checks do not certify the product itself.
      </p>
      {report.rehearsal && (
        <div className="rc-return-preview">
          <h3>Isolated rehearsal · Payments disabled</h3>
          <p>
            This restored draft cannot publish. The original shop and its orders
            are unchanged.
          </p>
          <button
            className="rc-button secondary"
            disabled={!!p.busy}
            onClick={() =>
              p.run("Testing the return process", async () =>
                setSimulation(
                  await p.api(`/incidents/${p.current.id}/rehearse-return`, {}),
                ),
              )
            }
          >
            Run isolated return simulation
          </button>
          {simulation && (
            <p role="status">
              {simulation.passed ? "Passed" : "Needs attention"}:{" "}
              {simulation.firstChanges} first-run changes,{" "}
              {simulation.repeatChanges} repeat changes. {simulation.message}
            </p>
          )}
        </div>
      )}
      <div className="rc-readiness-totals" aria-live="polite">
        <span>{report.ready} Ready</span>
        <span>{report.needsInformation} Need information</span>
        <span>{report.excluded} Excluded</span>
      </div>
      {p.dirty && (
        <p className="rc-notice">
          Save your catalog edits first; the questions below describe the saved
          version.
        </p>
      )}
      {report.products.map((row: any) => {
        const product = p.current.products.find((v: any) => v.sku === row.sku);
        return (
          <details
            className="rc-cont-details"
            key={`${row.sku}-${p.current.revision}`}
            open={row.status === "needs-information"}
          >
            <summary>
              <span>
                {row.name} · {row.sku}
              </span>
              <strong className={`rc-ready-${row.status}`}>
                {row.status === "needs-information"
                  ? "Needs information"
                  : row.status === "ready"
                    ? "Ready"
                    : "Excluded"}
              </strong>
            </summary>
            <ul>
              {row.questions.map((q: string) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            <p className="rc-count-summary">
              <Clock size={15} /> Counted {date(row.count?.at)} ·{" "}
              {row.count?.quantity ?? "—"} physically counted ·{" "}
              {product.allocation} reserved · {row.available} sellable
              {row.stale
                ? " · Count is over seven days old: recount recommended"
                : ""}
            </p>
            {row.status !== "excluded" && !closed && (
              <>
                {row.questions.some(
                  (q: string) =>
                    !q.includes("physical") && !q.startsWith("Reserve"),
                ) && (
                  <form
                    className="rc-answer-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      p.run("Saving your answer", async () => {
                        await p.api(`/incidents/${p.current.id}/answer`, {
                          revision: p.current.revision,
                          sku: product.sku,
                          name: String(f.get("name")),
                          price: Number(f.get("price")).toFixed(2),
                          currency: "USD",
                          resolutionNote: String(f.get("note")),
                          imageSourceId: String(f.get("image") || ""),
                          confirm: true,
                        });
                        await p.refresh();
                      });
                    }}
                  >
                    <div className="rc-formgrid">
                      <label>
                        Confirmed product name
                        <input
                          name="name"
                          required
                          defaultValue={product.name}
                        />
                      </label>
                      <label>
                        Which price is current? (USD)
                        <input
                          name="price"
                          required
                          inputMode="decimal"
                          pattern="[0-9]+([.][0-9]{1,2})?"
                          title="Enter a price such as 20 or 20.00"
                          defaultValue={product.price}
                          placeholder="20.00"
                        />
                      </label>
                      <label>
                        Why is this price correct?
                        <input
                          name="note"
                          required={row.priceCandidates.length > 1}
                          defaultValue={product.resolutionNote}
                          placeholder="Current stock sheet confirms this price"
                        />
                      </label>
                      <label>
                        Confirm this variant’s photo
                        <select
                          name="image"
                          defaultValue={product.imageSourceId || ""}
                        >
                          <option value="">
                            Use an illustrative placeholder
                          </option>
                          {p.current.sources
                            .filter((s: any) => s.mime.startsWith("image/"))
                            .map((s: any) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    {product.imageSourceId && (
                      <img
                        className="rc-confirm-photo"
                        src={`/api/restorecart/sources/${product.imageSourceId}`}
                        alt={`Suggested photo for ${product.name}; confirm the exact variant`}
                      />
                    )}
                    <label className="rc-cont-check">
                      <input type="checkbox" required /> I checked the identity,
                      price, USD currency and photo for this exact variant.
                    </label>
                    <button
                      className="rc-button secondary"
                      disabled={!!p.busy || p.dirty}
                    >
                      Confirm product answer
                    </button>
                  </form>
                )}
                <form
                  className="rc-count-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    p.run("Recording physical stock", async () => {
                      await p.api(`/incidents/${p.current.id}/count`, {
                        revision: p.current.revision,
                        sku: product.sku,
                        quantity: Number(f.get("quantity")),
                        allocation: Number(f.get("allocation")),
                      });
                      await p.refresh();
                    });
                  }}
                >
                  <div className="rc-formgrid">
                    <label>
                      Physical units counted
                      <input
                        name="quantity"
                        required
                        type="number"
                        min="0"
                        max="10000"
                        defaultValue={row.count?.quantity ?? product.allocation}
                      />
                    </label>
                    <label>
                      Reserve for this rescue shop
                      <input
                        name="allocation"
                        required
                        type="number"
                        min="0"
                        max="10000"
                        defaultValue={product.allocation}
                      />
                    </label>
                  </div>
                  <p>
                    Keep reserved units out of other sales channels. Existing
                    paid sales remain recorded when you recount.
                  </p>
                  <button
                    className="rc-button secondary"
                    disabled={!!p.busy || p.dirty}
                  >
                    Confirm physical count
                  </button>
                </form>
              </>
            )}
          </details>
        );
      })}
    </section>
  );
}
export function CustomerPanel(p: Props) {
  const [value, setValue] = useState<any>(null),
    [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    p.api(`/incidents/${p.current.id}/contact`)
      .then((v) => {
        if (alive) setValue(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [p.current.id]);
  if (error) return <p role="alert">{error}</p>;
  if (!value) return null;
  const message = `${value.status}\n${p.current.name}: ${location.origin}/s/${p.current.slug}\n${p.current.pickup}${value.hours ? `\nHours: ${value.hours}` : ""}${value.contact ? `\nContact: ${value.contact}` : ""}`;
  return (
    <section className="rc-panel rc-continuity">
      <h2>Help customers find you.</h2>
      <p>
        Save these details, then publish to update the public shop. Copying an
        announcement does not send it.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          p.run("Saving customer information", () =>
            p.api(`/incidents/${p.current.id}/contact`, value),
          );
        }}
      >
        <div className="rc-formgrid">
          <label>
            Public contact
            <input
              maxLength={160}
              value={value.contact}
              onChange={(e) => setValue({ ...value, contact: e.target.value })}
              placeholder="Shop email or business phone"
            />
          </label>
          <label>
            Opening / pickup hours
            <input
              maxLength={160}
              value={value.hours}
              onChange={(e) => setValue({ ...value, hours: e.target.value })}
            />
          </label>
        </div>
        <label>
          Temporary shop status
          <textarea
            maxLength={300}
            value={value.status}
            onChange={(e) => setValue({ ...value, status: e.target.value })}
          />
        </label>
        <button
          className="rc-button secondary"
          disabled={!!p.busy || !["draft", "live"].includes(p.current.state)}
        >
          Save customer information
        </button>
      </form>
      {p.current.published && (
        <>
          <label>
            Ready-to-copy announcement
            <textarea readOnly rows={5} value={message} />
          </label>
          <button
            className="rc-link"
            onClick={() =>
              p.run("Copying announcement", async () => {
                await navigator.clipboard.writeText(message);
                setCopied(true);
              })
            }
          >
            <Copy size={16} />
            {copied ? "Copied" : "Copy announcement"}
          </button>
        </>
      )}
    </section>
  );
}
export function RecoveryPanel(p: Props) {
  const [input, setInput] = useState(""),
    [comparison, setComparison] = useState<any>(null),
    [applied, setApplied] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    p.api(`/incidents/${p.current.id}/return-state`)
      .then((saved) => {
        if (alive && saved?.original)
          setInput(JSON.stringify(saved.original, null, 2));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [p.current.id]);
  const closed = ["closing", "closed"].includes(p.current.state);
  return (
    <section className="rc-panel rc-continuity">
      <h2>Return your emergency sales.</h2>
      <p>
        Supported destination: <b>Original Store JSON v1</b>. This updates a
        local destination file, not a Shopify/WooCommerce website. Payments are
        never charged again.
      </p>
      <div className="rc-buttonrow">
        <label className="rc-button secondary">
          Upload fresh original-store JSON
          <input
            className="rc-sr"
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                p.run("Reading original-store export", async () => {
                  if (f.size > 5_000_000)
                    throw Error("Choose a JSON export under 5 MB.");
                  setInput(await f.text());
                  setComparison(null);
                  setApplied(null);
                });
              e.target.value = "";
            }}
          />
        </label>
        <button
          className="rc-link"
          onClick={() =>
            p.run("Loading practice destination", async () => {
              setInput(
                JSON.stringify(
                  await p.api(`/incidents/${p.current.id}/original-example`),
                  null,
                  2,
                ),
              );
              setComparison(null);
              setApplied(null);
            })
          }
        >
          Use practice original-store export
        </button>
      </div>
      <label>
        Original-store export
        <textarea
          rows={6}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setComparison(null);
            setApplied(null);
          }}
          placeholder="Upload or paste Original Store JSON v1"
        />
      </label>
      {!closed && (
        <p>Close new checkouts using the controls above before comparing.</p>
      )}
      <button
        className="rc-button"
        disabled={!closed || !input || !!p.busy}
        onClick={() =>
          p.run("Comparing emergency records", async () => {
            setComparison(
              await p.api(`/incidents/${p.current.id}/compare`, {
                original: JSON.parse(input),
              }),
            );
            setApplied(null);
          })
        }
      >
        Compare return changes <ArrowRight size={16} />
      </button>
      {comparison && (
        <div className="rc-return-preview">
          <h3>
            {comparison.changes.length} changes · {comparison.alreadyRecorded}{" "}
            orders already recorded
          </h3>
          <p>
            Captured {money(comparison.totals.captured)} · Refunded{" "}
            {money(comparison.totals.refunded)} · Net{" "}
            {money(comparison.totals.captured - comparison.totals.refunded)}
          </p>
          {!!comparison.conflicts.length && (
            <div role="alert">
              <h4>Resolve these conflicts first</h4>
              <ul>
                {comparison.conflicts.map((c: string) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <ul>
            {comparison.changes.map((c: any, index: number) => (
              <li key={index}>
                {c.kind === "inventory"
                  ? `${c.sku}: ${c.units > 0 ? "+" : ""}${c.units} units`
                  : `${c.action} order ${c.reference}: captured ${money(c.amount)}, refunded ${money(c.refunded)}, ${c.fulfillment}`}
              </li>
            ))}
          </ul>
          <p>
            Resulting inventory:{" "}
            {comparison.inventory
              .map((s: any) => `${s.sku}: ${s.quantity}`)
              .join(" · ")}
          </p>
          <button
            className="rc-button secondary"
            disabled={!comparison.canApply || !!p.busy || !!applied}
            onClick={() =>
              p.run("Applying local recovery changes", async () => {
                const result = await p.api(`/incidents/${p.current.id}/apply`, {
                  previewId: comparison.previewId,
                });
                setApplied(result);
                setInput(JSON.stringify(result.output, null, 2));
              })
            }
          >
            Apply to local destination
          </button>
        </div>
      )}
      {applied && (
        <div className="rc-notice" role="status">
          <div>
            <b>{applied.changesApplied} local changes applied.</b>
            <p>{applied.scope}</p>
            <a
              className="rc-link"
              href={`/api/restorecart/destinations/${encodeURIComponent(applied.storeId)}`}
            >
              <Download size={16} />
              Download updated original-store file
            </a>
            <p>Compare again to verify zero duplicate changes.</p>
          </div>
        </div>
      )}
    </section>
  );
}
export function KitPanel(p: Props) {
  const [kits, setKits] = useState<any[]>([]),
    [result, setResult] = useState<any>(null),
    [error, setError] = useState("");
  const reload = () => p.api(`/kits`).then(setKits);
  useEffect(() => {
    let alive = true;
    p.api(`/kits`)
      .then((v) => {
        if (alive) setKits(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [p.current.id]);
  return (
    <section className="rc-panel rc-continuity">
      <div className="rc-cont-heading">
        <Archive />
        <h2>Prepare your next comeback.</h2>
      </div>
      <p>
        A versioned kit includes saved products, original source files and
        images, pickup and public contact details. It excludes orders, sessions,
        credentials and payment records. Restoring always starts an unpublished
        shop with zero allocation and no copied stock count.
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        className="rc-button"
        disabled={!!p.busy || p.dirty || !p.current.products.length}
        onClick={() =>
          p.run("Saving rescue kit", async () => {
            const kit = await p.api(`/incidents/${p.current.id}/kits`, {});
            setResult({
              message: `Kit version ${kit.version} ${kit.duplicate ? "already exists; reused unchanged version" : "saved"}.`,
            });
            await reload();
          })
        }
      >
        <Archive size={17} />
        Save versioned rescue kit
      </button>
      {p.dirty && <p>Save catalog edits first so the kit includes them.</p>}
      <label className="rc-button secondary" style={{ marginTop: 15 }}>
        Import downloaded rescue kit
        <input
          className="rc-sr"
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f)
              p.run("Importing rescue kit", async () => {
                if (f.size > 28_000_000)
                  throw Error("Choose a kit under 28 MB.");
                const imported = await p.api("/kits/import", {
                  kit: JSON.parse(await f.text()),
                });
                setResult({
                  message: `Kit version ${imported.version} imported. Choose Rehearse or Restore below.`,
                });
                await reload();
              });
            e.target.value = "";
          }}
        />
      </label>
      <p>
        Saved kits from all your shops. Restored operational drafts still
        require new physical counts and confirmation before publishing.
      </p>
      {kits.map((k) => (
        <article className="rc-kit-row" key={k.id}>
          <div>
            <h3>
              Version {k.version} · {k.name}
            </h3>
            <p>
              {date(k.createdAt)} · Integrity {k.digest.slice(0, 12)}
            </p>
          </div>
          <div className="rc-buttonrow">
            <a className="rc-link" href={`/api/restorecart/kits/${k.id}`}>
              <Download size={16} />
              Download kit
            </a>
            <button
              className="rc-button secondary"
              disabled={!!p.busy}
              onClick={() =>
                p.run("Restoring operational draft", async () => {
                  const restored = await p.api(`/kits/${k.id}/restore`, {
                    mode: "operational",
                  });
                  setResult({ ...restored.report, id: restored.incident.id });
                })
              }
            >
              Restore operational draft
            </button>
            <button
              className="rc-button secondary"
              disabled={!!p.busy}
              onClick={() =>
                p.run("Rehearsing recovery", async () => {
                  const restored = await p.api(`/kits/${k.id}/restore`, {});
                  setResult({ ...restored.report, id: restored.incident.id });
                })
              }
            >
              Rehearse this kit
            </button>
          </div>
        </article>
      ))}
      {result && (
        <div className="rc-return-preview" role="status">
          <h3>{result.message}</h3>
          {result.id && (
            <>
              <p>
                {result.products} products · {result.images} images · Source
                hashes verified. Stock allocation reset. The original shop is
                unchanged.
              </p>
              <button
                className="rc-button secondary"
                onClick={() =>
                  p.run("Opening isolated rehearsal", () => p.open!(result.id))
                }
              >
                Open restored draft
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
