import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Plus,
  Trash2,
  Scissors,
  Check,
  RotateCcw,
  Printer,
} from "lucide-react";
import { api, send } from "../api";
import {
  defaultConfig,
  money,
  templates,
  type Kit,
  type KitConfig,
  type Material,
} from "./model";
import { type BatchInput, type OwnedMaterial, type Allocation } from "./batch";
import { Art, CutDiagram } from "./ProjectArt";
import "./batch.css";
const Viewer = lazy(() => import("./KitViewer"));
export function BatchGuide({
  kit,
  operator = false,
}: {
  kit: Kit;
  operator?: boolean;
}) {
  if (!kit.batch) return null;
  const p = kit.batch.plan;
  return (
    <section className="sd-batch-guide">
      <span className="sd-kicker">
        {operator
          ? "PACK ONLY THE PURCHASED SHORTFALL"
          : "YOUR BATCH PRODUCTION PLAN"}
      </span>
      <h2>{p.quantity} projects. Every piece accounted for.</h2>
      <p>
        Finished size: {kit.config.width} × {kit.config.depth} ×{" "}
        {kit.config.height} mm.{" "}
        {kit.batch.input.mixColors
          ? "Mixed colors allowed; the 3D preview shows the selected reference colors."
          : "Use the selected reference colors."}{" "}
        Buyer-owned materials are self-reported, not verified or supplied by the
        shop.
      </p>
      {operator && (
        <p className="sd-batch-callout">
          Supply only the shop items below.{" "}
          {kit.preparation
            ? "Cut the purchased sheets using this layout; include the remaining material. Do not cut buyer-owned stock."
            : "Supply whole sheets / ribbon segments; the buyer does the cutting."}
        </p>
      )}
      {!operator && (
        <button className="sd-text" onClick={() => window.print()}>
          <Printer size={15} />
          Print / save production plan
        </button>
      )}
      <div className="sd-batch-cuts">
        {p.allocations
          .filter((a) => !operator || a.source === "shop")
          .map((a) => (
            <CutSheet key={a.source + a.itemId} allocation={a} />
          ))}
      </div>
      <details>
        <summary>Project blank: measured cut and fold instructions</summary>
        <CutDiagram kit={kit} />
        <ol>
          {kit.template.guide.map((s) => (
            <li key={s}>{s.replaceAll("supplied", "allocated")}</li>
          ))}
        </ol>
      </details>
      <div className="sd-batch-sequence">
        <h3>Make the batch in stages</h3>
        <ol>
          <li>
            Check each material's dimensions and condition before cutting. Label
            your stacks by color and size.
          </li>
          <li>
            Cut the project blanks on each layout. Use the blank's cutting/fold
            diagram inside every rectangle; rotated blanks rotate the entire
            diagram.
          </li>
          <li>
            Group the same fold, glue and finishing steps across the batch.
            Allow drying time separately.
          </li>
          <li>
            Keep labeled offcuts. This planner subtracts whole used sheets and
            segments; offcuts can be measured and added as new materials.
          </li>
        </ol>
      </div>
      <p>
        <b>Time allowance:</b> {p.estimatedMinutes} hands-on minutes at the
        template pace, including 10 minutes setup; drying, travel and pickup are
        extra. Target: {kit.batch.input.deadline}.
      </p>
      <p>
        Measured cutting layout · 2 mm edge margins · 3 mm between blanks/cuts.
        Offcut area includes gaps and margins; it is not a promise of reusable
        sheet area. Check your measurements before cutting.
      </p>
    </section>
  );
}
function CutSheet({ allocation: a }: { allocation: Allocation }) {
  const whole = Math.floor(a.projects / a.yieldPerUnit),
    partial = a.projects % a.yieldPerUnit;
  return (
    <article className="sd-cut-sheet">
      <div>
        <span className={"sd-source " + a.source}>
          {a.source === "owned" ? "YOURS" : "BUY"}
        </span>
        <h3>{a.name}</h3>
        <p>
          {a.units} {a.type === "ribbon" ? "segments" : "sheets"} · {a.width} ×{" "}
          {a.length} mm → {a.projects} projects
        </p>
      </div>
      {a.type !== "ribbon" ? (
        <svg
          viewBox={`-5 -5 ${a.width + 10} ${a.length + 10}`}
          role="img"
          aria-label={`${a.name}: ${a.placements.length} project blanks on a full sheet, with margins and cutting gaps`}
        >
          <rect
            width={a.width}
            height={a.length}
            fill={a.color}
            fillOpacity=".15"
            stroke="currentColor"
          />
          {a.placements.map((r, i) => (
            <g key={i}>
              <rect
                {...{ x: r.x, y: r.y, width: r.width, height: r.height }}
                fill={a.color}
                fillOpacity=".65"
                stroke="#fff"
                strokeWidth="1"
              />
              <text
                x={r.x + r.width / 2}
                y={r.y + r.height / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={Math.min(r.width, r.height) * 0.14}
                fill="#152d25"
              >
                {i + 1}
                {r.rotated ? " ↻" : ""}
              </text>
            </g>
          ))}
        </svg>
      ) : (
        <div className="sd-ribbon-layout" style={{ borderColor: a.color }}>
          <Scissors size={20} />
          <b>{a.ribbonCut} mm per cut</b>
          <span>Up to {a.yieldPerUnit} cuts per segment</span>
        </div>
      )}
      <p>
        {whole
          ? `${whole} full ${a.type === "ribbon" ? "segments" : "sheets"} × ${a.yieldPerUnit} projects. `
          : ""}
        {partial
          ? `Last ${a.type === "ribbon" ? "segment" : "sheet"}: use only the first ${partial} cuts.`
          : ""}
      </p>
      <small>
        {a.source === "owned"
          ? `${a.remainingWholeUnits} untouched whole units remain. `
          : ""}
        {a.type === "ribbon"
          ? `${a.remainingLength} mm remains across used segments, including cutting allowances.`
          : `${Math.round(a.remainingArea / 100)} cm² outside project blanks across used sheets, including margins.`}
      </small>
    </article>
  );
}
const futureDate = () =>
  new Date(Date.now() + 8 * 3600000 + 3 * 86400000).toISOString().slice(0, 10);
export default function BatchPlanner({
  inventory,
  slots,
  accountId,
  initial,
  requireAccount,
  checkout,
}: {
  inventory: Material[];
  slots: { id: string; label: string; available: number; ends?: number }[];
  accountId: string | null;
  initial: KitConfig | null;
  requireAccount: () => boolean;
  checkout: (quote: any, close: () => void) => ReactNode;
}) {
  const [input, setInput] = useState<BatchInput>(() => ({
    config: {
      ...(initial || defaultConfig("giftbox", inventory)),
      quantity: 1,
    },
    quantity: 4,
    owned: [],
    ownedRevision: 0,
    mixColors: true,
    cuttingService: false,
    availableMinutes: 120,
    deadline: futureDate(),
    tools: ["scissors", "ruler", "glue", "hole punch"],
  }));
  const [revision, setRevision] = useState(0),
    [alternatives, setAlternatives] = useState<
      { id: string; label: string; kit: Kit }[]
    >([]),
    [chosen, setChosen] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [quote, setQuote] = useState<any>(null),
    [jobs, setJobs] = useState<any[]>([]),
    [slot, setSlot] = useState(slots[0]?.id || ""),
    [exploded, setExploded] = useState(false);
  const dirty = useRef(false),
    previousOwner = useRef(accountId),
    generation = useRef(0);
  const selected = alternatives[chosen]?.kit;
  const availableSlots = slots.filter(
    (s) =>
      s.available > 0 &&
      (!s.ends ||
        s.ends <=
          Date.parse(
            (selected?.batch?.input.deadline || input.deadline) +
              "T23:59:59+08:00",
          )),
  );
  const selectedSlot = availableSlots.some((s) => s.id === slot)
    ? slot
    : availableSlots[0]?.id || "";
  useEffect(() => {
    if (alternatives.length)
      document
        .getElementById("sd-batch-results")
        ?.scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "start",
        });
  }, [alternatives]);
  async function load() {
    if (!accountId) return;
    const [saved, j] = await Promise.all([
      api("/scrapdrop/owned"),
      api("/scrapdrop/batch/jobs"),
    ]);
    setRevision(saved.revision);
    setJobs(j);
    if (!dirty.current)
      setInput((v) => ({
        ...v,
        owned: saved.materials,
        ownedRevision: saved.revision,
      }));
  }
  useEffect(() => {
    let gone = false;
    if (previousOwner.current && previousOwner.current !== accountId) {
      dirty.current = false;
      setInput((v) => ({ ...v, owned: [], ownedRevision: 0 }));
      setAlternatives([]);
      setJobs([]);
    }
    previousOwner.current = accountId;
    if (accountId)
      void Promise.all([api("/scrapdrop/owned"), api("/scrapdrop/batch/jobs")])
        .then(([saved, j]) => {
          if (gone) return;
          setRevision(saved.revision);
          setJobs(j);
          if (!dirty.current)
            setInput((v) => ({
              ...v,
              owned: saved.materials,
              ownedRevision: saved.revision,
            }));
        })
        .catch((e) => {
          if (!gone) setError(e.message);
        });
    return () => {
      gone = true;
    };
  }, [accountId]);
  function change(patch: Partial<BatchInput>) {
    generation.current++;
    setInput((v) => ({ ...v, ...patch }));
    setAlternatives([]);
    setError("");
    setNotice("");
  }
  function ownChange(owned: OwnedMaterial[]) {
    dirty.current = true;
    change({ owned });
  }
  function sample(kind: "four" | "thirty") {
    const cfg = defaultConfig(
        kind === "four" ? "giftbox" : "bookmark",
        inventory,
      ),
      m = inventory.find((m) => m.id === cfg.materialId)!,
      r = inventory.find((m) => m.id === cfg.ribbonId)!;
    ownChange([
      {
        id: "example-card",
        name: "My measured card sheets",
        type: "card",
        width: kind === "four" ? 200 : 300,
        length: kind === "four" ? 300 : 420,
        thickness: m.thickness,
        quantity: 3,
        color: m.color,
      },
      {
        id: "example-ribbon",
        name: "My cream ribbon",
        type: "ribbon",
        width: r.width,
        length: kind === "four" ? 2600 : 3000,
        thickness: r.thickness,
        quantity: kind === "four" ? 1 : 2,
        color: r.color,
      },
    ]);
    change({
      config: cfg,
      quantity: kind === "four" ? 4 : 30,
      availableMinutes: kind === "four" ? 120 : 480,
      mixColors: true,
    });
  }
  async function saveMaterials() {
    const saved = await api("/scrapdrop/owned", {
      method: "PUT",
      body: JSON.stringify({ revision, materials: input.owned }),
    });
    dirty.current = false;
    setRevision(saved.revision);
    setInput((v) => ({ ...v, ownedRevision: saved.revision }));
    return saved;
  }
  async function calculate() {
    const gen = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await send("/scrapdrop/batch/plan", {
        ...input,
        ownedRevision: revision,
      });
      if (gen === generation.current) {
        setAlternatives(r.alternatives);
        setChosen(0);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function review() {
    if (!selected || !requireAccount()) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveMaterials(),
        next = {
          ...selected.batch!.input,
          owned: saved.materials,
          ownedRevision: saved.revision,
        };
      if (selected.total) {
        setQuote(
          await send("/scrapdrop/batch/quotes", {
            input: next,
            pickupSlotId: selectedSlot,
          }),
        );
      } else {
        await send("/scrapdrop/batch/jobs", next);
        setNotice(
          "Making plan saved. No purchase needed. Mark it made below when you actually use the materials.",
        );
        await load();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="sd-page sd-batch-page">
      <header className="sd-batch-heading">
        <span className="sd-kicker">
          USE WHAT YOU HAVE. BUY THE DIFFERENCE.
        </span>
        <h1>
          More made.
          <br />
          <em>Less bought.</em>
        </h1>
        <p>
          Plan a batch from your own materials. Check the cuts, compare a
          smaller design, and buy only the missing sheets or ribbon.
        </p>
        <div className="sd-batch-examples">
          <span>Try a worked example</span>
          <button onClick={() => sample("four")}>
            3 sheets → 4 gift boxes <ArrowRight size={14} />
          </button>
          <button onClick={() => sample("thirty")}>
            30 event bookmarks <ArrowRight size={14} />
          </button>
        </div>
      </header>
      <div className="sd-batch-inputs">
        <section>
          <span className="sd-kicker">01 / WHAT YOU'RE MAKING</span>
          <div className="sd-batch-form-grid">
            <label>
              Project
              <select
                value={input.config.templateId}
                onChange={(e) =>
                  change({
                    config: defaultConfig(e.target.value as any, inventory),
                  })
                }
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Finished quantity
              <input
                type="number"
                min={1}
                max={100}
                value={input.quantity}
                onChange={(e) => change({ quantity: Number(e.target.value) })}
              />
            </label>
            {(["width", "depth", "height"] as const).map((k, i) => (
              <label key={k}>
                {
                  templates.find((t) => t.id === input.config.templateId)!
                    .labels[i]
                }{" "}
                (mm)
                <input
                  type="number"
                  min={k === "height" ? 0.1 : k === "width" ? 25 : 30}
                  max={k === "height" ? 80 : k === "width" ? 200 : 240}
                  disabled={
                    input.config.templateId === "bookmark" && k === "height"
                  }
                  value={input.config[k]}
                  onChange={(e) =>
                    change({
                      config: { ...input.config, [k]: Number(e.target.value) },
                    })
                  }
                />
              </label>
            ))}
            <label>
              Needed by
              <input
                type="date"
                value={input.deadline}
                onChange={(e) => change({ deadline: e.target.value })}
              />
            </label>
            <label>
              Hands-on minutes available
              <input
                type="number"
                min={5}
                max={100000}
                value={input.availableMinutes}
                onChange={(e) =>
                  change({ availableMinutes: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <fieldset className="sd-batch-tools">
            <legend>Tools I have</legend>
            {["scissors", "ruler", "glue", "hole punch"].map((tool) => (
              <label key={tool}>
                <input
                  type="checkbox"
                  checked={input.tools.includes(tool as any)}
                  onChange={(e) =>
                    change({
                      tools: (e.target.checked
                        ? [...input.tools, tool]
                        : input.tools.filter((t) => t !== tool)) as any,
                    })
                  }
                />
                {tool}
              </label>
            ))}
          </fieldset>
        </section>
        <section>
          <div className="sd-batch-section-title">
            <div>
              <span className="sd-kicker">
                02 / MATERIALS ALREADY ON YOUR SHELF
              </span>
              <h2>Start with yours.</h2>
            </div>
            <button
              className="sd-text"
              disabled={input.owned.length >= 20}
              onClick={() =>
                ownChange([
                  ...input.owned,
                  {
                    id: crypto.randomUUID(),
                    name: "My card",
                    type: "card",
                    width: 300,
                    length: 420,
                    thickness: 1,
                    quantity: 1,
                    color: "#829568",
                  },
                ])
              }
            >
              <Plus size={16} />
              Add material
            </button>
          </div>
          <p>
            Measure usable rectangles and unbroken ribbon lengths in
            millimeters. Quantity means identical whole sheets or segments. No
            photos or AI calls are needed.
          </p>
          {!input.owned.length && (
            <div className="sd-batch-empty">
              Have three sheets already? Add them here—or try a worked example
              above.
            </div>
          )}
          <div className="sd-owned-list">
            {input.owned.map((m, i) => {
              const edit = (p: Partial<OwnedMaterial>) =>
                ownChange(
                  input.owned.map((n, j) => (j === i ? { ...n, ...p } : n)),
                );
              return (
                <article key={m.id}>
                  <div className="sd-owned-title">
                    <label>
                      Material name
                      <input
                        value={m.name}
                        maxLength={80}
                        onChange={(e) => edit({ name: e.target.value })}
                      />
                    </label>
                    <button
                      className="sd-icon"
                      aria-label={"Remove " + m.name}
                      onClick={() =>
                        ownChange(input.owned.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="sd-batch-form-grid">
                    <label>
                      Type
                      <select
                        value={m.type}
                        onChange={(e) =>
                          edit({
                            type: e.target.value as any,
                            width: e.target.value === "ribbon" ? 15 : 300,
                          })
                        }
                      >
                        <option value="card">Card</option>
                        <option value="fabric">Fabric</option>
                        <option value="ribbon">Ribbon</option>
                      </select>
                    </label>
                    {(
                      ["width", "length", "thickness", "quantity"] as const
                    ).map((k) => (
                      <label key={k}>
                        {k === "quantity" ? "Whole units" : k + " (mm)"}
                        <input
                          type="number"
                          min={
                            k === "quantity" ? 0 : k === "thickness" ? 0.1 : 1
                          }
                          max={
                            k === "quantity"
                              ? 1000
                              : k === "thickness"
                                ? 2
                                : 3000
                          }
                          step={k === "thickness" ? 0.1 : 1}
                          value={m[k]}
                          onChange={(e) =>
                            edit({ [k]: Number(e.target.value) })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      Color
                      <input
                        type="color"
                        value={m.color}
                        onChange={(e) => edit({ color: e.target.value })}
                      />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
          <label className="sd-check">
            <input
              type="checkbox"
              checked={input.mixColors}
              onChange={(e) => change({ mixColors: e.target.checked })}
            />
            Allow mixed owned colors. Sheet and ribbon thickness must match the
            selected shop reference.
          </label>
          <button
            className="sd-text"
            disabled={busy}
            onClick={async () => {
              if (!requireAccount()) return;
              setBusy(true);
              try {
                await saveMaterials();
                setNotice("Your material inventory is saved to your account.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Check size={15} />
            Save my materials
          </button>
        </section>
        <section>
          <span className="sd-kicker">03 / IF YOU NEED A TOP-UP</span>
          <div className="sd-batch-form-grid">
            <label>
              Sheet color to buy
              <select
                value={input.config.materialId}
                onChange={(e) =>
                  change({
                    config: { ...input.config, materialId: e.target.value },
                  })
                }
              >
                {inventory
                  .filter(
                    (m) =>
                      m.type ===
                      templates.find((t) => t.id === input.config.templateId)!
                        .type,
                  )
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.shade} · {money(m.price)} / sheet
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Ribbon to buy
              <select
                value={input.config.ribbonId}
                onChange={(e) =>
                  change({
                    config: { ...input.config, ribbonId: e.target.value },
                  })
                }
              >
                {inventory
                  .filter((m) => m.type === "ribbon")
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.shade} · {money(m.price)} / segment
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label className="sd-check">
            <input
              type="checkbox"
              checked={input.cuttingService}
              onChange={(e) => change({ cuttingService: e.target.checked })}
            />
            Cut my purchased sheets to the plan · optional $2.50 per order.
            Buyer-owned stock stays uncut by the shop.
          </label>
          <button className="sd-btn" disabled={busy} onClick={calculate}>
            {busy ? "Calculating…" : "Calculate my batch"}
            <ArrowRight size={17} />
          </button>
        </section>
      </div>
      {error && (
        <p className="sd-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="sd-batch-callout" role="status">
          {notice}
        </p>
      )}
      {!!alternatives.length && (
        <section className="sd-batch-results" id="sd-batch-results">
          <div className="sd-section-heading">
            <div>
              <span className="sd-kicker">
                04 / COMPARE THE WORKABLE ROUTES
              </span>
              <h2>Your materials go further.</h2>
            </div>
          </div>
          <div className="sd-batch-alternatives">
            {alternatives.map((a, i) => (
              <button
                key={a.id}
                className={i === chosen ? "selected" : ""}
                onClick={() => {
                  setChosen(i);
                  setExploded(false);
                }}
                aria-pressed={i === chosen}
              >
                <span>{a.label}</span>
                <b>{money(a.kit.total)}</b>
                <small>
                  {a.kit.config.width} × {a.kit.config.depth} ×{" "}
                  {a.kit.config.height} mm ·{" "}
                  {a.kit.batch!.plan.ready
                    ? "Materials and time fit"
                    : "Needs adjustment"}
                </small>
                <small>{a.kit.batch!.plan.purchaseUnits} units to buy</small>
              </button>
            ))}
          </div>
          {selected && (
            <>
              <div className="sd-batch-output">
                <div
                  className={"sd-studio-stage sd-scene-" + selected.template.id}
                >
                  <Suspense fallback={<Art kit={selected} />}>
                    <Viewer kit={selected} exploded={exploded} />
                  </Suspense>
                  <div className="sd-stage-toolbar">
                    <button
                      className="sd-btn small outline"
                      onClick={() => setExploded((v) => !v)}
                    >
                      {exploded ? "Show assembled" : "Inspect the parts"}
                    </button>
                    <small>Reference colors · mixed batches may vary</small>
                  </div>
                </div>
                <section className="sd-batch-basket">
                  <span className="sd-kicker">ONLY THE MISSING MATERIALS</span>
                  <h2>
                    {selected.lines.length
                      ? "Your top-up basket."
                      : "You have what you need."}
                  </h2>
                  <p>
                    {selected.batch!.plan.ownedSheetProjects} / {input.quantity}{" "}
                    sheet blanks and {selected.batch!.plan.ownedRibbonProjects}{" "}
                    / {input.quantity} ribbon cuts come from your shelf.
                  </p>
                  {selected.lines.map((l) => (
                    <p className="sd-receipt-line" key={l.itemId}>
                      <span>
                        {l.units} × {l.name}
                      </span>
                      <strong>{money(l.total)}</strong>
                    </p>
                  ))}
                  <p className="sd-receipt-line">
                    <span>Optional cutting service</span>
                    <strong>{money(selected.preparation)}</strong>
                  </p>
                  <p className="sd-total sd-receipt-line">
                    <b>Total · USD</b>
                    <strong>{money(selected.total)}</strong>
                  </p>
                  {selected.batch!.plan.comparisonAvailable && (
                    <p className="sd-batch-saving">
                      {money(selected.batch!.plan.materialSavings)} less in new
                      materials than buying all new materials at the selected
                      shop unit prices (availability not assumed). Cutting
                      service excluded from comparison.
                    </p>
                  )}
                  {selected.warnings.map((w) => (
                    <p className="sd-batch-warning" key={w}>
                      {w}
                    </p>
                  ))}
                  {selected.total > 0 && !selectedSlot && (
                    <p className="sd-batch-warning">
                      No collection window fits your deadline. Choose a later
                      date and calculate again.
                    </p>
                  )}
                  {selected.total > 0 && (
                    <label>
                      Collection window
                      <select
                        value={selectedSlot}
                        onChange={(e) => setSlot(e.target.value)}
                      >
                        {availableSlots.map((s) => (
                          <option
                            disabled={!s.available}
                            key={s.id}
                            value={s.id}
                          >
                            {s.label} · {s.available} places
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    className="sd-btn"
                    disabled={
                      busy ||
                      !selected.batch!.plan.ready ||
                      (selected.total > 0 && !selectedSlot)
                    }
                    onClick={review}
                  >
                    {selected.total
                      ? "Review top-up with PayPal"
                      : "Save my making plan"}
                    <ArrowRight size={17} />
                  </button>
                  <small>
                    {selected.total
                      ? "Only purchased stock is reserved at checkout. Your owned materials remain a self-reported planning balance until you mark the batch made."
                      : "No payment or collection needed. Your materials are updated only after you mark the batch made."}
                  </small>
                </section>
              </div>
              <BatchGuide kit={selected} />
            </>
          )}
        </section>
      )}
      {!!jobs.length && (
        <section className="sd-batch-jobs">
          <h2>Saved making plans</h2>
          {jobs.map((j) => (
            <article key={j.id}>
              <div>
                <b>
                  {j.kit.config.quantity} × {j.kit.template.title}
                </b>
                <small>
                  {j.made
                    ? "Made · inventory updated"
                    : "Materials already owned · ready to make"}
                </small>
              </div>
              <details>
                <summary>Open instructions</summary>
                <BatchGuide kit={j.kit} />
              </details>
              <button
                className="sd-btn small outline"
                disabled={busy || j.made}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await send("/scrapdrop/batch/" + j.id + "/made", {});
                    dirty.current = false;
                    await load();
                    setAlternatives([]);
                    setNotice(
                      "Batch marked made. Used whole units were subtracted once; measure offcuts before adding them as new stock.",
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {j.made ? <Check size={15} /> : <Scissors size={15} />}
                {j.made ? "Made" : "Mark batch made"}
              </button>
            </article>
          ))}
        </section>
      )}
      {quote && checkout(quote, () => setQuote(null))}
    </main>
  );
}

export function BatchCompletion({ order }: { order: any }) {
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  if (!order.kit.batch) return null;
  return (
    <div className="sd-batch-complete">
      <p>
        After making the batch, subtract its used whole sheets and ribbon
        segments from your saved materials. Offcuts stay in the cutting plan
        until you measure and add them separately.
      </p>
      <button
        className="sd-btn outline"
        disabled={busy || order.fulfillment !== "collected"}
        onClick={async () => {
          setBusy(true);
          try {
            await send("/scrapdrop/batch/" + order.id + "/made", {});
            setNotice(
              "Batch marked made. Your material balance was updated once.",
            );
          } catch (e) {
            setNotice((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Check size={16} />
        Mark batch made
      </button>
      {order.fulfillment !== "collected" && (
        <small>Available after collection.</small>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
