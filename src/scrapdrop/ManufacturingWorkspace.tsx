import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { api, send } from "../api";
import { money, type Material } from "./model";
import {
  capabilities,
  exampleJob,
  type Job,
  type Plan,
  type Product,
} from "./manufacturing/engine";
import { ManufacturingGuide, SheetDiagrams } from "./manufacturing/RecipeGuide";
import { PreviewBoundary } from "./PreviewBoundary";
import "./manufacturing/style.css";
const ProductionPanel = lazy(() => import("./manufacturing/ProductionPanel"));
export type SavedJob = {
  id: string;
  plan: Plan;
  revision: number;
  progress: { product: number; step: number };
  results: any;
  orderId: string | null;
  created: number;
};
export default function ManufacturingWorkspace({
  inventory,
  accountId,
  operator,
  slots,
  requireAccount,
  checkout,
}: {
  inventory: Material[];
  accountId: string | null;
  operator: boolean;
  slots: { id: string; label: string; available: number }[];
  requireAccount: () => boolean;
  checkout: (q: any, close: () => void) => ReactNode;
}) {
  const [job, setJob] = useState<Job>(() => ({ ...exampleJob(), owned: [] })),
    [plan, setPlan] = useState<Plan | null>(null),
    [saved, setSaved] = useState<SavedJob | null>(null),
    [jobs, setJobs] = useState<SavedJob[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [brief, setBrief] = useState(""),
    [trace, setTrace] = useState<any[]>([]),
    [quote, setQuote] = useState<any>(null),
    [slot, setSlot] = useState(""),
    [tab, setTab] = useState("plan");
  async function load() {
    if (accountId) {
      const [owned, list] = await Promise.all([
        api("/scrapdrop/owned"),
        api<SavedJob[]>("/scrapdrop/manufacturing/jobs"),
      ]);
      setJob((j) => ({
        ...j,
        owned: owned.materials,
        ownedRevision: owned.revision,
      }));
      setJobs(list);
    }
  }
  useEffect(() => {
    setSaved(null);
    setPlan(null);
    setTrace([]);
    setMessage("");
    if (accountId) void load().catch((e) => setError(e.message));
    else {
      setJob((j) => ({ ...j, owned: [], ownedRevision: 0 }));
      setJobs([]);
    }
  }, [accountId]);
  const edit = (next: Job) => {
    setJob(next);
    setPlan(null);
    setSaved(null);
    setError("");
    setTrace([]);
    setMessage("Inputs changed. Compare again to calculate a fresh plan.");
  };
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const changeProduct = (i: number, patch: Partial<Product>) =>
    edit({
      ...job,
      products: job.products.map((p, n) => (n === i ? { ...p, ...patch } : p)),
    });
  async function save() {
    if (!requireAccount()) return;
    await action(async () => {
      const owned = await api("/scrapdrop/owned", {
        method: "PUT",
        body: JSON.stringify({
          revision: job.ownedRevision,
          materials: job.owned,
        }),
      });
      const next = {
        ...job,
        ownedRevision: owned.revision,
        owned: owned.materials,
      };
      setJob(next);
      const s = await send("/scrapdrop/manufacturing/jobs", next);
      setSaved(s);
      setPlan(s.plan);
      setJobs((list) => [s, ...list]);
      setMessage("Shelf and making plan saved. Resume it below.");
    });
  }
  return (
    <main className="mfg-workspace">
      <div className="mfg-heading">
        <div>
          <span className="sd-kicker">FROM LEFTOVERS TO A WORKABLE BATCH</span>
          <h1>Make the whole set.</h1>
          <p>One job. Shared sheets. Only the missing materials to buy.</p>
        </div>
        <span className="sd-sample">
          Paper & card · prototype constructions
        </span>
      </div>
      <div
        className="mfg-tabs"
        role="tablist"
        aria-label="Production workspace"
      >
        <button
          role="tab"
          aria-selected={tab === "plan"}
          onClick={() => setTab("plan")}
        >
          Plan & make
        </button>
        {operator && (
          <button
            role="tab"
            aria-selected={tab === "production"}
            onClick={() => setTab("production")}
          >
            Production & insights
          </button>
        )}
      </div>
      {error && (
        <p className="sd-error" role="alert">
          {error}
        </p>
      )}
      <p className="mfg-notice" role="status">
        {message}
      </p>
      {tab === "production" ? (
        <PreviewBoundary
          fallback={
            <p>
              Production panels could not load. Your plans and checkout remain
              available.
            </p>
          }
        >
          <Suspense fallback={<p>Opening production…</p>}>
            <ProductionPanel />
          </Suspense>
        </PreviewBoundary>
      ) : (
        <>
          <section className="mfg-card">
            <div className="mfg-section-head">
              <div>
                <span className="sd-kicker">01 · DEFINE THE JOB</span>
                <h2>What are we making?</h2>
              </div>
              <button
                className="sd-btn small outline"
                onClick={() => {
                  const ex = exampleJob();
                  edit({ ...ex, ownedRevision: job.ownedRevision });
                }}
              >
                Load retail-set example
              </button>
            </div>
            <label>
              Job name
              <input
                value={job.title}
                onChange={(e) => edit({ ...job, title: e.target.value })}
                maxLength={100}
              />
            </label>
            <div className="mfg-product-list">
              {job.products.map((p, i) => (
                <article className="mfg-product" key={p.id}>
                  <div className="mfg-product-heading">
                    <strong>Product {i + 1}</strong>
                    <button
                      className="sd-text"
                      disabled={job.products.length === 1}
                      onClick={() =>
                        edit({
                          ...job,
                          products: job.products.filter((_, n) => i !== n),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mfg-fields">
                    <label>
                      Product {i + 1} name
                      <input
                        value={p.name}
                        onChange={(e) =>
                          changeProduct(i, { name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Product {i + 1} construction
                      <select
                        value={p.family}
                        onChange={(e) =>
                          changeProduct(i, {
                            family: e.target.value as Product["family"],
                          })
                        }
                      >
                        <option value="flat">Flat part / tag</option>
                        <option value="folded">
                          Folded display / table tent
                        </option>
                        <option value="sleeve">Glued sleeve / band</option>
                      </select>
                    </label>
                    <NumberField
                      label={`Product ${i + 1} quantity`}
                      value={p.quantity}
                      min={1}
                      max={100}
                      onChange={(quantity) => changeProduct(i, { quantity })}
                    />
                    <NumberField
                      label={`Product ${i + 1} width (mm)`}
                      value={p.width}
                      min={20}
                      max={500}
                      onChange={(width) => changeProduct(i, { width })}
                    />
                    <NumberField
                      label={`Product ${i + 1} ${p.family === "sleeve" ? "product face height" : "panel length"} (mm)`}
                      value={p.length}
                      min={20}
                      max={700}
                      onChange={(length) => changeProduct(i, { length })}
                    />
                    {p.family === "sleeve" && (
                      <NumberField
                        label={`Product ${i + 1} product depth (mm)`}
                        value={p.depth}
                        min={5}
                        max={200}
                        onChange={(depth) => changeProduct(i, { depth })}
                      />
                    )}
                  </div>
                  {p.family === "flat" && (
                    <label className="mfg-check">
                      <input
                        type="checkbox"
                        checked={p.hole}
                        onChange={(e) =>
                          changeProduct(i, { hole: e.target.checked })
                        }
                      />
                      Punch a 4 mm hanging hole
                    </label>
                  )}
                  <small>
                    {capabilities.find((c) => c.family === p.family)?.limits}
                  </small>
                </article>
              ))}
            </div>
            <button
              className="sd-text"
              disabled={job.products.length >= 8}
              onClick={() =>
                edit({
                  ...job,
                  products: [
                    ...job.products,
                    {
                      id: "part-" + crypto.randomUUID().slice(0, 8),
                      name: "New flat part",
                      family: "flat",
                      width: 50,
                      length: 80,
                      depth: 10,
                      quantity: 12,
                      hole: false,
                    },
                  ],
                })
              }
            >
              + Add a product
            </button>
            <details>
              <summary>
                Describe a new request · agent-assisted planning
              </summary>
              <p>
                Give product type, dimensions and quantity. Supported: flat
                parts, A-fold displays and glued sleeves. The agent uses the
                same calculation tools through MCP. New constructions outside
                these rules require clarification.
              </p>
              <label>
                Your manufacturing brief
                <textarea
                  value={brief}
                  maxLength={1500}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="12 flat tags, 35 × 60 mm, with a hanging hole…"
                />
              </label>
              <button
                className="sd-btn outline"
                disabled={busy || brief.trim().length < 5}
                onClick={() => {
                  if (requireAccount())
                    void action(async () => {
                      const r = await send("/scrapdrop/manufacturing/agent", {
                        job,
                        text: brief,
                      });
                      setPlan(r.plan);
                      setJob(r.plan.input);
                      setSaved(null);
                      setTrace(r.trace);
                      setMessage(
                        `${r.source === "gemini" ? "Gemini" : "Fixture demonstration"}${r.cached ? " · cached" : ""}: ${r.message}`,
                      );
                    });
                }}
              >
                Plan with manufacturing tools
              </button>
            </details>
          </section>
          <section className="mfg-card">
            <span className="sd-kicker">02 · MATERIALS & LIMITS</span>
            <h2>Start with your shelf.</h2>
            <p>
              Measure usable rectangles. Your saved shelf is shared with
              existing making plans. Saving replaces it with the rows below.
            </p>
            {job.owned.map((m, i) => (
              <article key={m.id} className="mfg-material">
                <div className="mfg-fields">
                  <label>
                    Material {i + 1} name
                    <input
                      value={m.name}
                      onChange={(e) =>
                        edit({
                          ...job,
                          owned: job.owned.map((s, n) =>
                            i === n ? { ...s, name: e.target.value } : s,
                          ),
                        })
                      }
                    />
                  </label>
                  {(["width", "length", "quantity", "thickness"] as const).map(
                    (k) => (
                      <NumberField
                        key={k}
                        label={`Material ${i + 1} ${k}${k === "quantity" ? "" : " (mm)"}`}
                        value={m[k]}
                        min={k === "quantity" ? 0 : k === "thickness" ? 0.1 : 1}
                        max={
                          k === "quantity" ? 1000 : k === "thickness" ? 2 : 3000
                        }
                        step={k === "thickness" ? 0.1 : 1}
                        onChange={(v) =>
                          edit({
                            ...job,
                            owned: job.owned.map((s, n) =>
                              i === n ? { ...s, [k]: v } : s,
                            ),
                          })
                        }
                      />
                    ),
                  )}
                  <label>
                    Material {i + 1} color
                    <input
                      type="color"
                      value={m.color}
                      onChange={(e) =>
                        edit({
                          ...job,
                          owned: job.owned.map((s, n) =>
                            i === n ? { ...s, color: e.target.value } : s,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
                <button
                  className="sd-text"
                  onClick={() =>
                    edit({ ...job, owned: job.owned.filter((_, n) => n !== i) })
                  }
                >
                  Remove material
                </button>
                <small>
                  {m.type} lot · {m.id}
                </small>
              </article>
            ))}
            <button
              className="sd-text"
              disabled={job.owned.length >= 20}
              onClick={() =>
                edit({
                  ...job,
                  owned: [
                    ...job.owned,
                    {
                      id: "card-" + crypto.randomUUID().slice(0, 8),
                      name: "My card",
                      type: "card",
                      width: 200,
                      length: 300,
                      thickness: job.thickness,
                      quantity: 1,
                      color: job.color,
                    },
                  ],
                })
              }
            >
              + Add measured card
            </button>
            <div className="mfg-fields">
              <NumberField
                label="Required card thickness (mm)"
                value={job.thickness}
                min={0.2}
                max={1.5}
                step={0.1}
                onChange={(thickness) => edit({ ...job, thickness })}
              />
              <NumberField
                label="Purchase budget (USD)"
                value={job.budget / 100}
                min={0}
                max={100000}
                step={0.01}
                onChange={(v) => edit({ ...job, budget: Math.round(v * 100) })}
              />
              <NumberField
                label="Hands-on time available (minutes)"
                value={job.availableMinutes}
                min={1}
                max={100000}
                onChange={(availableMinutes) =>
                  edit({ ...job, availableMinutes })
                }
              />
              <label>
                Required color
                <input
                  type="color"
                  value={job.color}
                  onChange={(e) => edit({ ...job, color: e.target.value })}
                />
              </label>
            </div>
            <div className="mfg-checks">
              {["scissors", "ruler", "glue", "hole punch"].map((t) => (
                <label key={t} className="mfg-check">
                  <input
                    type="checkbox"
                    checked={job.tools.includes(t as any)}
                    onChange={(e) =>
                      edit({
                        ...job,
                        tools: e.target.checked
                          ? [...job.tools, t as any]
                          : job.tools.filter((s) => s !== t),
                      })
                    }
                  />
                  {t}
                </label>
              ))}
            </div>
            <label className="mfg-check">
              <input
                type="checkbox"
                checked={job.mixColors}
                onChange={(e) => edit({ ...job, mixColors: e.target.checked })}
              />
              Allow different available colors
            </label>
            <label className="mfg-check">
              <input
                type="checkbox"
                checked={job.rotate}
                onChange={(e) => edit({ ...job, rotate: e.target.checked })}
              />
              Allow 90° rotation (no directional print/grain requirement)
            </label>
            <button
              className="sd-btn"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  setSaved(null);
                  setTrace([]);
                  const p = await send("/scrapdrop/manufacturing/plan", job);
                  setPlan(p);
                  setMessage(
                    p.ready
                      ? "A feasible material and hands-on plan is ready. Physical trial and drying time remain to be checked."
                      : "Some constraints need attention; see the calculated blockers.",
                  );
                })
              }
            >
              {busy ? "Calculating…" : "Compare my production plan"}
            </button>
          </section>
          {plan && (
            <motion.section
              className="mfg-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span className="sd-kicker">03 · CALCULATED, NOT GUESSED</span>
              <h2>
                {plan.ready
                  ? "A plan that fits your inputs."
                  : "Here is what needs to change."}
              </h2>
              <div className="mfg-metrics">
                <Metric
                  title="Owned sheets used"
                  value={String(plan.usedOwned)}
                />
                <Metric
                  title="Additional sheets"
                  value={String(plan.usedShop)}
                />
                <Metric title="Purchase amount" value={money(plan.total)} />
                <Metric
                  title="Hands-on estimate"
                  value={`${plan.minutes} min`}
                />
              </div>
              {plan.violations.length > 0 && (
                <ul className="sd-error" aria-label="Plan blockers">
                  {plan.violations.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              )}
              <p>
                Blank area utilization: {Math.round(plan.utilization * 100)}%
                (whole-sheet area, including margins).{" "}
                {plan.baseline
                  ? `Shop-only material cost: ${money(plan.baseline.shopCents)}. Cash avoided: ${money(plan.cashAvoided || 0)}. Separate-product shop layouts use ${plan.baseline.separateSheets} sheets.`
                  : "A complete shop-only comparison is unavailable."}{" "}
                Cash avoided is not profit.
              </p>
              <ul className="mfg-warnings">
                {plan.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <details>
                <summary>
                  Inspect shared cutting sheets · {plan.sheets.length} sheets
                </summary>
                <SheetDiagrams plan={plan} />
              </details>
              <details>
                <summary>Grouped production operations</summary>
                <ol>
                  {plan.schedule.map((o) => (
                    <li key={o.id}>
                      {o.name}: {o.start}–{o.end} min ·{" "}
                      {o.resources.join(" + ")}
                    </li>
                  ))}
                </ol>
                <small>
                  One maker and one cutter; relative hands-on timeline, without
                  a promised collection/deadline appointment.
                </small>
              </details>
              <div className="mfg-actions">
                <button
                  className="sd-btn"
                  disabled={!plan.ready || busy}
                  onClick={() => void save()}
                >
                  {saved ? "Save as a new making plan" : "Save my making plan"}
                </button>
                <a className="sd-text" href="#mfg-learn">
                  Learn to make this ↓
                </a>
              </div>
              {saved && plan.total > 0 && !saved.orderId && (
                <div className="mfg-purchase">
                  <label>
                    Collection window
                    <select
                      value={slot || slots[0]?.id || ""}
                      onChange={(e) => setSlot(e.target.value)}
                    >
                      {slots
                        .filter((s) => s.available > 0)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className="sd-btn"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        setQuote(
                          await send(
                            `/scrapdrop/manufacturing/jobs/${saved.id}/quote`,
                            { pickupSlotId: slot || slots[0]?.id },
                          ),
                        );
                      })
                    }
                  >
                    Buy only the shortfall · {money(plan.total)}
                  </button>
                </div>
              )}
              {saved && plan.total === 0 && (
                <p className="mfg-notice">
                  You have the materials. No purchase required.
                </p>
              )}
              {saved?.orderId && (
                <a href={`/orders/${saved.orderId}`}>
                  Open the existing purchase
                </a>
              )}
              {trace.length > 0 && (
                <details>
                  <summary>
                    What the manufacturing tools checked · {trace.length} calls
                  </summary>
                  <ol>
                    {trace.map((t, i) => (
                      <li key={i}>
                        {t.tool}
                        <pre>
                          {JSON.stringify(t.result, null, 2).slice(0, 2200)}
                        </pre>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              <div id="mfg-learn">
                <ManufacturingGuide
                  key={saved?.id || JSON.stringify(plan.input)}
                  plan={plan}
                  jobId={saved?.id}
                  initial={saved?.progress}
                  save={
                    saved
                      ? async (progress) => {
                          const next = await api(
                            `/scrapdrop/manufacturing/jobs/${saved.id}/progress`,
                            {
                              method: "PUT",
                              body: JSON.stringify({
                                ...progress,
                                revision: saved.revision,
                              }),
                            },
                          );
                          setSaved(next);
                        }
                      : undefined
                  }
                />
              </div>
              {saved && (
                <ManufacturingResults
                  key={saved.id}
                  saved={saved}
                  onSaved={(next) => {
                    setSaved(next);
                    void load();
                  }}
                />
              )}
            </motion.section>
          )}
          <section className="mfg-card">
            <h2>Saved production jobs</h2>
            {!accountId ? (
              <p>Sign in to save and resume.</p>
            ) : !jobs.length ? (
              <p>Your first saved production job will appear here.</p>
            ) : (
              <div className="mfg-saved">
                {jobs.map((j) => (
                  <button
                    className="mfg-saved-job"
                    key={j.id}
                    onClick={() =>
                      void action(async () => {
                        const s = await api<SavedJob>(
                          `/scrapdrop/manufacturing/jobs/${j.id}`,
                        );
                        setSaved(s);
                        setPlan(s.plan);
                        setJob(s.plan.input);
                        setMessage(
                          "Frozen recipe and progress loaded. Edit inputs to begin a new revision.",
                        );
                      })
                    }
                  >
                    <strong>{j.plan.input.title}</strong>
                    <span>
                      {j.plan.recipes.length} products ·{" "}
                      {j.results
                        ? "Results recorded"
                        : j.orderId
                          ? "Purchase started"
                          : "Making plan"}{" "}
                      · Resume →
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      {quote && checkout(quote, () => setQuote(null))}
    </main>
  );
}
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </label>
  );
}
function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}
export function ManufacturingResults({
  saved,
  onSaved,
}: {
  saved: SavedJob;
  onSaved: (j: SavedJob) => void;
}) {
  const [minutes, setMinutes] = useState(saved.plan.minutes),
    [price, setPrice] = useState(0),
    [labor, setLabor] = useState(0),
    [owned, setOwned] = useState(0),
    [consumables, setConsumables] = useState(0),
    [fees, setFees] = useState(0),
    [counts, setCounts] = useState(
      saved.plan.input.products.map((p) => ({
        id: p.id,
        good: p.quantity,
        spoiled: 0,
      })),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [offcuts, setOffcuts] = useState<
      { sheetId: string; width: number; length: number }[]
    >([]);
  if (saved.results)
    return (
      <section className="mfg-results">
        <h3>Production results recorded</h3>
        <p>
          {saved.results.good} good units · {saved.results.input.minutes} actual
          minutes · batch contribution {money(saved.results.contribution)} after
          entered costs.
        </p>
        <p>
          Cash avoided:{" "}
          {saved.results.cashAvoided === null
            ? "Unavailable"
            : money(saved.results.cashAvoided)}
          . This is separate from contribution. Measured offcuts have been
          credited once.
        </p>
      </section>
    );
  return (
    <details className="mfg-results">
      <summary>Record actual production & economics</summary>
      <p>
        For purchased supplies, collect the paid order first. Finalizing
        consumes the owned sheets and credits only the measured offcuts entered
        below. Enter your actual costs; zero means you are assigning zero cost.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            onSaved(
              await send(`/scrapdrop/manufacturing/jobs/${saved.id}/results`, {
                revision: saved.revision,
                products: counts,
                minutes,
                sellingPrice: Math.round(price * 100),
                laborRate: Math.round(labor * 100),
                ownedCost: Math.round(owned * 100),
                consumables: Math.round(consumables * 100),
                fees: Math.round(fees * 100),
                offcuts,
              }),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {counts.map((p, i) => (
          <div className="mfg-fields" key={p.id}>
            <NumberField
              label={`${saved.plan.input.products[i].name} good`}
              value={p.good}
              min={0}
              max={saved.plan.input.products[i].quantity}
              onChange={(good) =>
                setCounts((c) =>
                  c.map((v, n) => (n === i ? { ...v, good } : v)),
                )
              }
            />
            <NumberField
              label={`${saved.plan.input.products[i].name} spoiled`}
              value={p.spoiled}
              min={0}
              max={saved.plan.input.products[i].quantity}
              onChange={(spoiled) =>
                setCounts((c) =>
                  c.map((v, n) => (n === i ? { ...v, spoiled } : v)),
                )
              }
            />
          </div>
        ))}
        <div className="mfg-fields">
          <NumberField
            label="Actual hands-on minutes"
            value={minutes}
            min={0}
            max={100000}
            onChange={setMinutes}
          />
          <NumberField
            label="Selling price per good unit (USD)"
            value={price}
            min={0}
            max={100000}
            step={0.01}
            onChange={setPrice}
          />
          <NumberField
            label="Labor per hour (USD)"
            value={labor}
            min={0}
            max={1000}
            step={0.01}
            onChange={setLabor}
          />
          <NumberField
            label="Owned material value (USD)"
            value={owned}
            min={0}
            max={100000}
            step={0.01}
            onChange={setOwned}
          />
          <NumberField
            label="Consumables cost (USD)"
            value={consumables}
            min={0}
            max={100000}
            step={0.01}
            onChange={setConsumables}
          />
          <NumberField
            label="Fees / other costs (USD)"
            value={fees}
            min={0}
            max={100000}
            step={0.01}
            onChange={setFees}
          />
        </div>
        <small>
          For mixed prices, use the average realized selling price per good
          unit; revenue = total good units × that average.
        </small>
        <h4>Measured reusable offcuts</h4>
        {offcuts.map((o, i) => (
          <div className="mfg-fields" key={i}>
            <label>
              Source sheet
              <select
                value={o.sheetId}
                onChange={(e) =>
                  setOffcuts((a) =>
                    a.map((v, n) =>
                      n === i ? { ...v, sheetId: e.target.value } : v,
                    ),
                  )
                }
              >
                {saved.plan.sheets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.id}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label={`Offcut ${i + 1} width (mm)`}
              value={o.width}
              min={10}
              max={3000}
              onChange={(width) =>
                setOffcuts((a) =>
                  a.map((v, n) => (n === i ? { ...v, width } : v)),
                )
              }
            />
            <NumberField
              label={`Offcut ${i + 1} length (mm)`}
              value={o.length}
              min={10}
              max={3000}
              onChange={(length) =>
                setOffcuts((a) =>
                  a.map((v, n) => (n === i ? { ...v, length } : v)),
                )
              }
            />
            <button
              type="button"
              className="sd-text"
              onClick={() => setOffcuts((a) => a.filter((_, n) => n !== i))}
            >
              Remove offcut
            </button>
          </div>
        ))}
        <button
          type="button"
          className="sd-text"
          onClick={() =>
            setOffcuts((a) => [
              ...a,
              {
                sheetId: saved.plan.sheets[0]?.id || "",
                width: 10,
                length: 10,
              },
            ])
          }
        >
          + Add a measured offcut
        </button>
        {error && (
          <p className="sd-error" role="alert">
            {error}
          </p>
        )}
        <button className="sd-btn" disabled={busy}>
          Finalize actual results
        </button>
      </form>
    </details>
  );
}
