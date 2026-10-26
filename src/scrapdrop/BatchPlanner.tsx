import { PreviewBoundary } from "./PreviewBoundary";
import { LearnButton } from "./Tutorial";
import { BatchEconomics, ProductionResults } from "./MakingRecords";
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
  Sparkles,
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
import {
  toolUse,
  type BatchInput,
  type OwnedMaterial,
  type Allocation,
} from "./batch";
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
          : p.stockReady
            ? "YOUR PRODUCTION PLAN"
            : "DRAFT · MATERIALS INCOMPLETE"}
      </span>
      <h2>
        {p.quantity} {p.quantity === 1 ? "project" : "projects"}.{" "}
        {p.stockReady
          ? "Every piece accounted for."
          : "Materials still missing."}
      </h2>
      <p>
        Finished size: {kit.config.width} × {kit.config.depth} ×{" "}
        {kit.config.height} mm.{" "}
        {kit.batch.input.mixColors
          ? "Mixed colors allowed; the 3D preview shows the selected reference colors."
          : "Use the selected reference colors."}{" "}
        Buyer-owned materials are self-reported, not verified or supplied by the
        shop.
      </p>
      {!p.stockReady && (
        <p className="sd-batch-warning">
          Draft only: some required pieces cannot be supplied. Resolve the
          material shortfall before making; the allocations below are
          incomplete.
        </p>
      )}
      {operator && (
        <p className="sd-batch-callout">
          Supply only the shop items below.{" "}
          {kit.preparation
            ? "Cut the purchased outer sheet blanks using this layout; include remaining material. Buyer completes detailed cuts, folds, holes, gluing and ribbon trimming. Do not cut buyer-owned stock."
            : "Supply whole sheets / ribbon segments; the buyer does the cutting."}
        </p>
      )}
      {!operator && (
        <button className="sd-text" onClick={() => window.print()}>
          <Printer size={15} />
          {p.stockReady
            ? "Print / save production plan"
            : "Print / save draft plan"}
        </button>
      )}
      <p>
        <b>Tools required:</b>{" "}
        {(p.requiredTools || kit.template.tools).join(", ")}.{" "}
        {(p.toolsToGet || []).length > 0
          ? "You agreed to arrange: " +
            p.toolsToGet.join(", ") +
            " before making."
          : ""}
      </p>
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
        <h3>
          {p.quantity === 1 ? "Make it in stages" : "Make the batch in stages"}
        </h3>
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
  initialBrief = "",
  aiMode = "fixture",
}: {
  initialBrief?: string;
  aiMode?: string;
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
    quantity: initial?.quantity || 1,
    owned: [],
    ownedRevision: 0,
    mixColors: true,
    cuttingService: false,
    availableMinutes: 120,
    deadline: futureDate(),
    tools: [],
    toolsToGet: [],
    budget: null,
    allowedMaterialIds: [],
    allowedRibbonIds: [],
  }));
  const [revision, setRevision] = useState(0),
    [alternatives, setAlternatives] = useState<
      { id: string; label: string; reason?: string; kit: Kit }[]
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
  const [brief, setBrief] = useState(initialBrief),
    [intent, setIntent] = useState<any>(null),
    [intentBusy, setIntentBusy] = useState(false);
  const intentGeneration = useRef(0);
  const selected = alternatives[chosen]?.kit;
  const noSupply =
    !!selected && !selected.batch!.plan.stockReady && !selected.lines.length;
  const template = templates.find((t) => t.id === input.config.templateId)!;
  const flex = input.flexibility || {
    resize: false,
    minWidth: input.config.width,
    minDepth: input.config.depth,
    minHeight: input.config.height,
  };
  async function interpret() {
    const seq = ++intentGeneration.current;
    setIntentBusy(true);
    setError("");
    try {
      const r = await send("/scrapdrop/planner/interpret", { text: brief });
      if (seq === intentGeneration.current) setIntent(r);
    } catch (e) {
      if (seq === intentGeneration.current)
        setError(
          (e as Error).message + " You can fill the planner manually below.",
        );
    } finally {
      if (seq === intentGeneration.current) setIntentBusy(false);
    }
  }
  function applyIntent() {
    const d = intent?.draft;
    if (!d?.supported || !d.templateId) return;
    const cfg = defaultConfig(d.templateId, inventory);
    for (const key of ["width", "depth", "height"] as const)
      if (d[key] !== null) cfg[key] = d[key];
    const minWidth = d.minWidth ?? cfg.width,
      minDepth = d.minDepth ?? cfg.depth,
      minHeight = d.minHeight ?? cfg.height;
    cfg.width = Math.max(cfg.width, minWidth);
    cfg.depth = Math.max(cfg.depth, minDepth);
    if (d.templateId !== "bookmark")
      cfg.height = Math.max(cfg.height, minHeight);
    const colors = d.colors.map((c: string) => c.toLowerCase());
    const matches = inventory.filter(
      (m) =>
        m.type === templates.find((t) => t.id === d.templateId)!.type &&
        colors.includes(m.shade.toLowerCase()),
    );
    const ribbons = inventory.filter(
      (m) => m.type === "ribbon" && colors.includes(m.shade.toLowerCase()),
    );
    if (matches[0]) cfg.materialId = matches[0].id;
    if (ribbons[0]) cfg.ribbonId = ribbons[0].id;
    change({
      config: cfg,
      ...(d.quantity !== null ? { quantity: d.quantity } : {}),
      ...(d.budget !== null ? { budget: d.budget } : {}),
      ...(d.deadline !== null ? { deadline: d.deadline } : {}),
      ...(d.availableMinutes !== null
        ? { availableMinutes: d.availableMinutes }
        : {}),
      ...(d.tools !== null ? { tools: d.tools, toolsToGet: [] } : {}),
      ...(d.mixedColors !== null ? { mixColors: d.mixedColors } : {}),
      flexibility: {
        resize:
          d.minWidth !== null || d.minDepth !== null || d.minHeight !== null,
        minWidth,
        minDepth,
        minHeight,
      },
      allowedMaterialIds: (d.mixedColors === true
        ? inventory.filter(
            (m) =>
              m.type === templates.find((t) => t.id === d.templateId)!.type,
          )
        : matches
      )
        .map((m) => m.id)
        .filter((id: string) => id !== cfg.materialId)
        .slice(0, 8),
      allowedRibbonIds: (d.mixedColors === true
        ? inventory.filter((m) => m.type === "ribbon")
        : ribbons
      )
        .map((m) => m.id)
        .filter((id: string) => id !== cfg.ribbonId)
        .slice(0, 8),
    });
    setIntent(null);
    setNotice(
      "Draft applied. Review the details below, then compare your options.",
    );
    document.getElementById("sd-project-requirements")?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }
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
      document.getElementById("sd-batch-results")?.scrollIntoView({
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
  function sample(kind: "four" | "thirty" | "three") {
    const box = kind !== "thirty";
    const cfg = defaultConfig(box ? "giftbox" : "bookmark", inventory),
      m = inventory.find((m) => m.id === cfg.materialId)!,
      r = inventory.find((m) => m.id === cfg.ribbonId)!;
    ownChange([
      {
        id: "example-card",
        name: "My measured card sheets",
        type: "card",
        width: box ? 200 : 300,
        length: box ? 300 : 420,
        thickness: m.thickness,
        quantity: 3,
        color: m.color,
      },
      {
        id: "example-ribbon",
        name: "My cream ribbon",
        type: "ribbon",
        width: r.width,
        length: box ? 2600 : 3000,
        thickness: r.thickness,
        quantity: box ? 1 : 2,
        color: r.color,
      },
    ]);
    change({
      config: cfg,
      quantity: box ? (kind === "three" ? 3 : 4) : 30,
      availableMinutes: box ? 120 : 480,
      mixColors: true,
      tools: ["scissors", "ruler", "glue", "hole punch"],
      toolsToGet: [],
      cuttingService: false,
      budget: null,
      allowedMaterialIds: [],
      allowedRibbonIds: [],
      deadline: futureDate(),
      flexibility: {
        resize: true,
        minWidth: box ? 76 : 34,
        minDepth: box ? 51 : 119,
        minHeight: box ? 29 : 2,
      },
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
    if (busy) return;
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
        setNotice(r.notice || "");
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
        document.getElementById("sd-saved-making-plans")?.scrollIntoView({
          block: "start",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
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
          Make one project or a whole batch. Use your materials first, compare
          options within your limits, and buy only what is missing.
        </p>
        <div className="sd-batch-examples">
          <span>Try a worked example</span>
          <button onClick={() => sample("four")}>
            3 sheets → 4 gift boxes <ArrowRight size={14} />
          </button>
          <button onClick={() => sample("three")}>
            3 gift boxes · no purchase <ArrowRight size={14} />
          </button>
          <button onClick={() => sample("thirty")}>
            30 event bookmarks <ArrowRight size={14} />
          </button>
        </div>
      </header>
      <section className="sd-intent-panel">
        <div>
          <span className="sd-kicker">
            START WITH YOUR IDEA · OR FILL THE DETAILS BELOW
          </span>
          <h2>What are we making?</h2>
          <p>
            Try “30 bookmarks under $10 by Friday. Minimum size 34 × 119 mm.
            Mixed colors are fine.”
          </p>
        </div>
        <label>
          Your project brief
          <textarea
            value={brief}
            maxLength={1500}
            placeholder="Tell us the project, quantity and any limits…"
            onChange={(e) => {
              setBrief(e.target.value);
              intentGeneration.current++;
              setIntent(null);
              setIntentBusy(false);
            }}
          />
        </label>
        <button
          className="sd-btn"
          disabled={intentBusy || brief.trim().length < 5}
          onClick={interpret}
        >
          <Sparkles size={16} />
          {intentBusy ? "Reading your idea…" : "Fill my plan from this idea"}
          <ArrowRight size={16} />
        </button>
        <small>
          {aiMode === "fixture"
            ? "Example interpretation · no live AI request."
            : "Interprets your brief only when you press this button. Measurements and prices are checked separately."}
        </small>
        {intent && (
          <div className="sd-intent-draft" role="status">
            <span className="sd-source">
              {intent.source === "ai"
                ? "Gemini draft"
                : intent.source === "fixture"
                  ? "Local example draft"
                  : "Local draft"}
            </span>
            <h3>Check what we understood.</h3>
            <dl>
              <dt>Project</dt>
              <dd>
                {intent.draft.templateId
                  ? templates.find((t) => t.id === intent.draft.templateId)
                      ?.title
                  : "Unsupported / not specified"}
              </dd>
              <dt>Quantity</dt>
              <dd>{intent.draft.quantity ?? "Not specified"}</dd>
              <dt>Materials/service budget</dt>
              <dd>
                {intent.draft.budget === null
                  ? "Not specified"
                  : money(intent.draft.budget)}
              </dd>
              <dt>Deadline</dt>
              <dd>{intent.draft.deadline ?? "Not specified"}</dd>
              <dt>Hands-on time</dt>
              <dd>
                {intent.draft.availableMinutes === null
                  ? "Not specified"
                  : intent.draft.availableMinutes + " minutes"}
              </dd>
              <dt>Allowed colors</dt>
              <dd>
                {intent.draft.mixedColors === true
                  ? "Mixed colors allowed"
                  : intent.draft.colors.join(", ") || "Not specified"}
              </dd>
            </dl>
            <p>{intent.draft.explanation}</p>
            <ul>
              {intent.questions.map((q: string) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            {intent.draft.supported && (
              <button className="sd-btn small" onClick={applyIntent}>
                Apply these details <Check size={15} />
              </button>
            )}
          </div>
        )}
      </section>
      <div className="sd-batch-inputs">
        <section id="sd-project-requirements">
          <span className="sd-kicker">01 / WHAT YOU'RE MAKING</span>
          <div className="sd-batch-form-grid">
            <label>
              Project
              <select
                value={input.config.templateId}
                onChange={(e) =>
                  change({
                    config: defaultConfig(e.target.value as any, inventory),
                    flexibility: undefined,
                    allowedMaterialIds: [],
                    allowedRibbonIds: [],
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
              Materials + service budget (USD, optional)
              <input
                type="number"
                min={0}
                max={100000}
                step="0.01"
                placeholder="No limit"
                value={input.budget === null ? "" : input.budget / 100}
                onChange={(e) =>
                  change({
                    budget:
                      e.target.value === ""
                        ? null
                        : Math.round(Number(e.target.value) * 100),
                  })
                }
              />
            </label>
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
            <legend>Tools for this project</legend>
            <p>
              Tools are not sold here. Tell us what you have, or explicitly
              arrange it before making. Cutting service does not include glue,
              scoring, hole punching or ribbon trimming.
            </p>
            {template.tools.map((tool) => (
              <div className="sd-tool-choice" key={tool}>
                <label>
                  <input
                    type="checkbox"
                    checked={input.tools.includes(tool)}
                    onChange={(e) =>
                      change({
                        tools: e.target.checked
                          ? [...input.tools, tool]
                          : input.tools.filter((t) => t !== tool),
                        toolsToGet: input.toolsToGet.filter((t) => t !== tool),
                      })
                    }
                  />
                  I have {tool}
                </label>
                <small>{toolUse[tool]}</small>
                {!input.tools.includes(tool) && (
                  <label className="sd-tool-arrange">
                    <input
                      type="checkbox"
                      checked={input.toolsToGet.includes(tool)}
                      onChange={(e) =>
                        change({
                          toolsToGet: e.target.checked
                            ? [...input.toolsToGet, tool]
                            : input.toolsToGet.filter((t) => t !== tool),
                        })
                      }
                    />
                    I'll obtain {tool} before making · not included in this
                    order
                  </label>
                )}
              </div>
            ))}
          </fieldset>
          <div className="sd-flexibility">
            <span className="sd-kicker">WHAT MAY CHANGE?</span>
            <label className="sd-check">
              <input
                type="checkbox"
                checked={flex.resize}
                onChange={(e) =>
                  change({ flexibility: { ...flex, resize: e.target.checked } })
                }
              />
              Compare smaller sizes within my minimum dimensions
            </label>
            {flex.resize && (
              <div className="sd-batch-form-grid">
                {(["minWidth", "minDepth", "minHeight"] as const).map(
                  (key, i) => (
                    <label key={key}>
                      Minimum {template.labels[i].toLowerCase()} (mm)
                      <input
                        type="number"
                        min={
                          i === 0
                            ? 25
                            : i === 1
                              ? 30
                              : input.config.templateId === "giftbox"
                                ? 20
                                : input.config.templateId === "wrap"
                                  ? 5
                                  : 0.1
                        }
                        max={
                          i === 0
                            ? input.config.width
                            : i === 1
                              ? input.config.depth
                              : input.config.height
                        }
                        step={i === 2 ? 0.1 : 1}
                        disabled={
                          input.config.templateId === "bookmark" && i === 2
                        }
                        value={flex[key]}
                        onChange={(e) =>
                          change({
                            flexibility: {
                              ...flex,
                              [key]: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  ),
                )}
              </div>
            )}
            <small>
              Quantity and deadline stay fixed. Only the selected extra shades
              below may be substituted. Leave resizing off to keep exact
              dimensions.
            </small>
          </div>
        </section>
        <section>
          <div className="sd-batch-section-title">
            <div>
              <span className="sd-kicker">
                02 / MATERIALS YOU ALREADY HAVE · OPTIONAL
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
          <span className="sd-kicker">03 / MATERIALS AND PREPARATION</span>
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
          <fieldset className="sd-allowed-shades">
            <legend>Extra shop shades I can accept in alternatives</legend>
            {inventory
              .filter(
                (m) =>
                  (m.type === template.type &&
                    m.id !== input.config.materialId) ||
                  (m.type === "ribbon" && m.id !== input.config.ribbonId),
              )
              .map((m) => {
                const field =
                  m.type === "ribbon"
                    ? "allowedRibbonIds"
                    : "allowedMaterialIds";
                return (
                  <label key={m.id}>
                    <input
                      type="checkbox"
                      checked={input[field].includes(m.id)}
                      onChange={(e) =>
                        change({
                          [field]: e.target.checked
                            ? [...input[field], m.id]
                            : input[field].filter((id) => id !== m.id),
                        })
                      }
                    />
                    <i style={{ background: m.color }} />
                    {m.shade} {m.type}
                  </label>
                );
              })}
          </fieldset>
          <label className="sd-check">
            <input
              type="checkbox"
              checked={input.cuttingService}
              onChange={(e) => change({ cuttingService: e.target.checked })}
            />
            Have the shop cut my new sheets — $2.50 per order. Includes planned
            outer blanks and remaining material; your own sheets, detailed cuts,
            ribbon trimming, folding and assembly are yours.
          </label>
          <p id="sd-compare-help">
            Comparison is free. Missing tools, time or budget issues appear in
            the results. If your materials cover the plan, you can save it
            without checkout.
          </p>
          <button
            className="sd-btn"
            disabled={busy}
            aria-describedby="sd-compare-help"
            onClick={calculate}
          >
            {busy ? "Please wait…" : "Compare my options"}
            <ArrowRight size={17} />
          </button>
        </section>
      </div>
      {error && (
        <p className="sd-error" role="alert">
          {error}
        </p>
      )}
      {notice && !notice.startsWith("Making plan saved.") && (
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
                <b>
                  {!a.kit.batch!.plan.stockReady && !a.kit.lines.length
                    ? "Unavailable"
                    : money(a.kit.total)}
                </b>
                <small>
                  {a.kit.config.width} × {a.kit.config.depth} ×{" "}
                  {a.kit.config.height} mm ·{" "}
                  {a.kit.batch!.plan.ready
                    ? "Requirements fit"
                    : "Needs adjustment"}
                </small>
                <small>{a.kit.batch!.plan.purchaseUnits} units to buy</small>
                {a.reason && <small>{a.reason}</small>}
              </button>
            ))}
          </div>
          {selected && (
            <>
              <div className="sd-batch-output">
                <div
                  className={"sd-studio-stage sd-scene-" + selected.template.id}
                >
                  <PreviewBoundary fallback={<Art kit={selected} />}>
                    <Suspense fallback={<Art kit={selected} />}>
                      <Viewer kit={selected} exploded={exploded} />
                    </Suspense>
                  </PreviewBoundary>
                  <div className="sd-stage-toolbar">
                    <LearnButton kit={selected} />
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
                    {noSupply
                      ? "No fitting material plan yet."
                      : selected.lines.length
                        ? "Your top-up basket."
                        : "Your materials are covered."}
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
                    <b>{noSupply ? "Total unavailable" : "Total · USD"}</b>
                    <strong>{noSupply ? "—" : money(selected.total)}</strong>
                  </p>
                  {selected.batch!.plan.comparisonAvailable &&
                    selected.batch!.plan.materialSavings > 0 && (
                      <p className="sd-batch-saving">
                        {money(selected.batch!.plan.materialSavings)} less in
                        new materials than buying all new materials at the
                        selected shop unit prices (availability not assumed).
                        Cutting service excluded from comparison.
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
                    {noSupply
                      ? "Adjust materials or dimensions"
                      : selected.total
                        ? "Review top-up with PayPal"
                        : "Save my making plan"}
                    <ArrowRight size={17} />
                  </button>
                  {selected.total > 0 && (
                    <p>
                      You still need shop materials. <b>Save my making plan</b>{" "}
                      becomes available when the selected option needs no
                      purchase. Try the no-purchase example above to test
                      saving.
                    </p>
                  )}
                  <small>
                    {noSupply
                      ? "Some required pieces cannot be supplied. Change the dimensions or add compatible owned materials, then compare again. This is not a free making plan."
                      : selected.total
                        ? "Only purchased stock is reserved at checkout. Your owned materials remain a self-reported planning balance until you mark the batch made."
                        : "No payment or collection needed. Your materials are updated only after you mark the batch made."}
                  </small>
                </section>
              </div>
              <BatchEconomics kit={selected} />
              <BatchGuide kit={selected} />
            </>
          )}
        </section>
      )}
      <section className="sd-batch-jobs" id="sd-saved-making-plans">
        <h2>Saved making plans</h2>
        {notice.startsWith("Making plan saved.") && (
          <p role="status">{notice}</p>
        )}
        {!jobs.length && (
          <p>
            No making plans saved yet. After comparing, choose a $0 option and
            click <b>Save my making plan</b>. Plans needing shop materials use
            PayPal checkout instead. Sign in to keep your plans.
          </p>
        )}
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
            <LearnButton kit={j.kit} target={{ kind: "job", id: j.id }} />
            <details>
              <summary>Open instructions</summary>
              <BatchGuide kit={j.kit} />
            </details>
            <ProductionResults
              kit={j.kit}
              target={{ kind: "job", id: j.id }}
              onSaved={() => void load()}
            />
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
