import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  Minus,
  Sparkles,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  WandSparkles,
  Save,
  Download,
  Printer,
  Copy,
  Layers,
  Clock3,
  Lightbulb,
  LoaderCircle,
  LockKeyhole,
  CircleHelp,
  FileText,
  Upload,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { api, getConfig, send } from "./api";
import type { Config } from "./shared/types";
import {
  calculateQuote,
  currency,
  exampleBriefs,
  starterInput,
  starterExamples,
  studioDefinition,
  type ExpertTool,
  type QuoteInput,
  type ToolDefinition,
  type WorkedExample,
} from "./shared/expert";
import ToolCheckout from "./ToolCheckout";
import "./expert.css";
const LegacyApp = lazy(() => import("./LegacyApp"));
type Route =
  | { name: "home" }
  | { name: "tool"; id: string }
  | { name: "create"; id?: string }
  | { name: "workspace" }
  | { name: "quote"; id: string };
function readRoute(): Route {
  const p = location.pathname.split("/").filter(Boolean);
  return p[0] === "tools" && p[1]
    ? { name: "tool", id: p[1] }
    : p[0] === "quotes" && p[1]
      ? { name: "quote", id: p[1] }
      : p[0] === "create"
        ? { name: "create", id: p[1] }
        : p[0] === "workspace"
          ? { name: "workspace" }
          : { name: "home" };
}
function Brand() {
  return (
    <span className="ts-brand">
      <span className="ts-mark">
        <i />
        <i />
        <i />
      </span>
      taskslice<span>.</span>
    </span>
  );
}
function Busy() {
  return <LoaderCircle size={17} className="spin" />;
}
function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <div className="ts-error" role="alert">
      {message}
    </div>
  ) : null;
}
function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 10000,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="ts-field">
      <span>{label}</span>
      <div className="ts-number">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
        />
        {suffix && <span>{suffix}</span>}
      </div>
    </label>
  );
}
function AnimatedMoney({ value }: { value: string }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0.6, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {currency(value)}
    </motion.span>
  );
}
export default function App() {
  const [route, setRoute] = useState<Route>(readRoute),
    [config, setConfig] = useState<Config | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch((e) => setError(e.message));
    const pop = () => setRoute(readRoute());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function navigate(path: string) {
    history.pushState({}, "", path);
    setRoute(readRoute());
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const legacy = /^\/(lessons|tasks|learn|library)(\/|$)/.test(
    location.pathname,
  );
  if (legacy)
    return (
      <Suspense
        fallback={
          <div className="ts-loading">
            <Busy />
            Opening spreadsheet lessons…
          </div>
        }
      >
        <LegacyApp />
      </Suspense>
    );
  return (
    <MotionConfig reducedMotion="user">
      <div className="ts-app">
        <header className="ts-header">
          <button
            className="ts-brand-btn"
            onClick={() => navigate("/")}
            aria-label="TaskSlice home"
          >
            <Brand />
          </button>
          <nav aria-label="Main navigation">
            <button
              className={
                route.name === "home" || route.name === "tool" ? "active" : ""
              }
              onClick={() => navigate("/")}
            >
              Explore tools
            </button>
            <button
              className={route.name === "workspace" ? "active" : ""}
              onClick={() => navigate("/workspace")}
            >
              My workspace
            </button>
          </nav>
          <button
            className="ts-btn outline header-create"
            onClick={() => navigate("/create")}
          >
            <Plus size={17} />
            Create a tool
          </button>
        </header>
        <ErrorMessage message={error} />
        <main>
          {!config ? (
            <div className="ts-loading">
              <Busy />
              Getting your workspace ready…
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={
                  route.name + ("id" in route ? route.id : "") + location.search
                }
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
                {route.name === "home" ? (
                  <Home navigate={navigate} />
                ) : route.name === "create" ? (
                  <Creator
                    draftId={route.id}
                    navigate={navigate}
                    config={config}
                  />
                ) : route.name === "workspace" ? (
                  <Workspace navigate={navigate} />
                ) : (
                  <QuoteBuilder
                    id={route.id}
                    saved={route.name === "quote"}
                    copy={new URLSearchParams(location.search).has("copy")}
                    navigate={navigate}
                    config={config}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
        <footer className="ts-footer">
          <Brand />
          <span>A little know-how goes a long way.</span>
          <div>
            <span className="ts-sandbox-dot" />
            {config?.mode === "demo" ? "Demo workspace" : "PayPal sandbox"}
            <a href="/lessons">
              Spreadsheet lessons <ArrowUpRight size={13} />
            </a>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
function Home({ navigate }: { navigate: (path: string) => void }) {
  const [tools, setTools] = useState<ExpertTool[]>([]),
    [error, setError] = useState(""),
    [revisions, setRevisions] = useState(3),
    [showMethod, setShowMethod] = useState(false);
  useEffect(() => {
    api<ExpertTool[]>("/expert/tools")
      .then(setTools)
      .catch((e) => setError(e.message));
  }, []);
  const result = calculateQuote(studioDefinition, {
    ...starterInput(),
    revisions,
  });
  return (
    <>
      <section className="ts-hero">
        <div className="ts-hero-copy">
          <div className="ts-eyebrow">
            <span className="ts-star">✳</span> KNOW-HOW. NOW IN YOUR HANDS.
          </div>
          <h1>
            Good at something?
            <br />
            <span>Pass it on.</span>
          </h1>
          <p>
            Turn a thoughtful method into a tool someone else can use. Or borrow
            a little expertise to get your own work done.
          </p>
          <div className="ts-hero-actions">
            <button
              className="ts-btn"
              onClick={() => navigate("/tools/studio-quote")}
            >
              Find your next useful tool
              <ArrowUpRight size={18} />
            </button>
            <button className="ts-text-btn" onClick={() => navigate("/create")}>
              I have a method to share
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="ts-hero-proof">
            <span className="ts-overlap">
              <i>✦</i>
              <i>↗</i>
              <i>✳</i>
            </span>
            <span>
              Real methods. Your inputs.
              <br />
              <strong>Something useful to take away.</strong>
            </span>
          </div>
        </div>
        <div className="ts-hero-art">
          <div className="ts-paper-note">
            <Pencil size={16} />
            <span>
              A good quote has
              <br />
              room to do good work.
            </span>
          </div>
          <motion.div
            className="ts-demo-card"
            initial={{ rotate: 2, y: 20 }}
            animate={{ rotate: 0, y: 0 }}
            transition={{ type: "spring", duration: 0.8 }}
          >
            <div className="ts-demo-top">
              <span className="ts-square-icon">
                <SlidersHorizontal size={20} />
              </span>
              <span>
                THE THOUGHTFUL PROJECT QUOTE
                <small>A method by TaskSlice Studio</small>
              </span>
              <span className="ts-live-dot" />
            </div>
            <h3>
              Your expertise.
              <br />A little more interactive.
            </h3>
            <div className="ts-demo-total">
              <span>Project estimate</span>
              <strong>
                <AnimatedMoney value={result.total} />
              </strong>
            </div>
            <div className="ts-demo-slider">
              <div>
                <label htmlFor="hero-revisions">Revision rounds</label>
                <strong>{revisions}</strong>
              </div>
              <input
                id="hero-revisions"
                type="range"
                min="0"
                max="6"
                value={revisions}
                onChange={(e) => setRevisions(Number(e.target.value))}
              />
              <small>
                {revisions <= 2
                  ? "Two rounds are already included."
                  : `${revisions - 2} extra round${revisions > 3 ? "s" : ""} · ${result.extraHours} additional hours`}
              </small>
            </div>
            <button
              className="ts-demo-why"
              onClick={() => setShowMethod(!showMethod)}
              aria-expanded={showMethod}
            >
              <Lightbulb size={15} />
              {showMethod ? "Hide the thinking" : "What’s behind the number?"}
              <ChevronDown size={15} />
            </button>
            <AnimatePresence>
              {showMethod && (
                <motion.p
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="ts-demo-explanation"
                >
                  24 base hours at $65/hour. Extra revisions add 3 hours each,
                  then 10% labour contingency and $80 expenses.
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
          <div className="ts-floating-tag">
            <span>✳</span> Go on, move the slider.
          </div>
          <svg className="ts-loop" viewBox="0 0 180 85" aria-hidden="true">
            <path d="M5 40C30 5 100 0 115 30S70 80 60 53 120 28 165 57M155 44l11 14-18 2" />
          </svg>
        </div>
      </section>
      <section className="ts-catalog" id="tools">
        <div className="ts-section-top">
          <div>
            <span className="ts-eyebrow">
              LESS FIGURING IT OUT. MORE GETTING IT DONE.
            </span>
            <h2>A useful place to start.</h2>
          </div>
          <span className="ts-section-aside">
            Try the method.
            <br />
            Make it yours.
          </span>
        </div>
        <ErrorMessage message={error} />
        <div className="ts-tool-grid">
          {tools.map((tool, i) => (
            <motion.button
              className="ts-tool-card"
              key={tool.id}
              whileHover={{ y: -5 }}
              onClick={() => navigate(`/tools/${tool.id}`)}
            >
              <div className={`ts-tool-art art-${i % 3}`}>
                <span className="ts-art-lines">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="ts-art-symbol">{i === 0 ? "↗" : "✳"}</span>
                <span className="ts-art-mini">
                  {i === 0 ? "Good work. Fair quote." : "A little expertise."}
                </span>
                <span className="ts-art-stamp">
                  MAKE
                  <br />
                  IT WORK
                </span>
              </div>
              <div className="ts-tool-card-content">
                <span className="ts-eyebrow">
                  CREATIVE WORK · PROJECT QUOTING
                </span>
                <h3>{tool.definition.title}</h3>
                <p>{tool.definition.description}</p>
                <div className="ts-tool-meta">
                  <span>By {tool.definition.creator}</span>
                  <strong>
                    {tool.owned
                      ? "Yours to use"
                      : `${currency(tool.price / 100)} USD`}
                  </strong>
                </div>
                <span className="ts-card-arrow">
                  <ArrowUpRight size={20} />
                </span>
              </div>
            </motion.button>
          ))}
          <button
            className="ts-create-card"
            onClick={() => navigate("/create")}
          >
            <span className="ts-create-doodle">✳</span>
            <h3>
              That thing you do well?
              <br />
              It could be a tool.
            </h3>
            <p>Bring your method. Give someone else a head start.</p>
            <span className="ts-text-btn">
              Create something useful
              <ArrowRight size={17} />
            </span>
          </button>
        </div>
      </section>
      <section className="ts-how">
        <span className="ts-eyebrow">FROM “HOW?” TO “HERE YOU GO.”</span>
        <div>
          <h3>
            <span>01</span>Start with a real method.
          </h3>
          <p>Someone’s experience, distilled into a small, practical tool.</p>
        </div>
        <div>
          <h3>
            <span>02</span>Make it fit your work.
          </h3>
          <p>Bring your project. Adjust the details. See what changes.</p>
        </div>
        <div>
          <h3>
            <span>03</span>Take something useful away.
          </h3>
          <p>
            Save, reuse, and export your result. The thinking is there when you
            need it.
          </p>
        </div>
      </section>
    </>
  );
}

type SavedQuote = {
  id: string;
  revision: number;
  tool: ExpertTool;
  input: QuoteInput;
  brief: string;
  updatedAt: string;
  result: ReturnType<typeof calculateQuote>;
};
function QuoteBuilder({
  id,
  saved,
  copy,
  navigate,
  config,
}: {
  id: string;
  saved: boolean;
  copy: boolean;
  navigate: (path: string) => void;
  config: Config;
}) {
  const [tool, setTool] = useState<ExpertTool | null>(null),
    [input, setInput] = useState<QuoteInput>(starterInput),
    [brief, setBrief] = useState(""),
    [quote, setQuote] = useState<SavedQuote | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [assumptions, setAssumptions] = useState<string[]>([]),
    [clarification, setClarification] = useState(""),
    [checkout, setCheckout] = useState(false),
    [explanation, setExplanation] = useState<
      keyof ToolDefinition["explanations"] | null
    >(null),
    [question, setQuestion] = useState(""),
    [hint, setHint] = useState(""),
    [notice, setNotice] = useState("");
  const inputRef = useRef(input);
  inputRef.current = input;
  useEffect(() => {
    let active = true;
    (saved
      ? api<SavedQuote>(`/expert/quotes/${id}`)
      : api<ExpertTool>(`/expert/tools/${id}`)
    )
      .then((data) => {
        if (!active) return;
        if (saved) {
          const q = data as SavedQuote;
          setTool(q.tool);
          setInput(q.input);
          setBrief(q.brief);
          if (!copy) setQuote(q);
          else {
            setQuote(null);
            setNotice(
              "A fresh copy. Change the client and save it as a new quote.",
            );
          }
        } else {
          const t = data as ExpertTool;
          setTool(t);
          setInput({
            ...starterInput(),
            rate: t.definition.defaultRate,
            revisions: t.definition.includedRevisions,
          });
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [id, saved, copy]);
  const result = useMemo(() => {
    if (!tool) return null;
    try {
      return calculateQuote(tool.definition, input);
    } catch {
      return null;
    }
  }, [tool, input]);
  const dirty =
    !!quote &&
    (JSON.stringify(input) !== JSON.stringify(quote.input) ||
      brief !== quote.brief);
  const update = (change: Partial<QuoteInput>) => {
    setInput((old) => ({ ...old, ...change }));
    setNotice("");
  };
  async function interpret() {
    if (!tool) return;
    setBusy("interpret");
    setError("");
    try {
      const mapped = await send(`/expert/tools/${tool.id}/interpret`, {
        brief,
        version: tool.version,
      });
      setInput(mapped.input);
      setAssumptions(mapped.assumptions);
      setClarification(mapped.clarification || "");
      setNotice(
        "Your brief is mapped. Check the inputs before using the estimate.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function persist() {
    if (!tool) throw new Error("The tool is still loading.");
    const current = inputRef.current;
    const body = { input: current, brief };
    const data = quote
      ? await send(`/expert/quotes/${quote.id}/save`, {
          ...body,
          revision: quote.revision,
        })
      : await send("/expert/quotes", {
          ...body,
          toolId: tool.id,
          version: tool.version,
        });
    setQuote(data);
    history.replaceState({}, "", `/quotes/${data.id}`);
    setNotice("Quote saved in this browser’s workspace.");
    return data as SavedQuote;
  }
  async function save() {
    if (!tool) return;
    if (!tool.owned) {
      setCheckout(true);
      return;
    }
    setBusy("save");
    setError("");
    try {
      await persist();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function exportQuote(print = false) {
    if (!tool?.owned) {
      setCheckout(true);
      return;
    }
    setBusy(print ? "print" : "export");
    setError("");
    try {
      const current = quote && !dirty ? quote : await persist();
      if (print) {
        window.location.assign(`/api/expert/quotes/${current.id}/print`);
      } else {
        const response = await fetch(`/api/expert/quotes/${current.id}/export`);
        if (!response.ok)
          throw new Error(
            "The quote could not be exported. Reopen it and check your access.",
          );
        const url = URL.createObjectURL(await response.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = "taskslice-quote.csv";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice("Your quote CSV is ready.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function refreshAccess() {
    if (!tool) return;
    const fresh = await api<ExpertTool>(
      `/expert/tools/${tool.id}?version=${tool.version}`,
    );
    setTool(fresh);
    setCheckout(false);
    setNotice("The tool is yours. You can now save, reuse and export quotes.");
  }
  async function ask() {
    if (!tool) return;
    setBusy("hint");
    setError("");
    try {
      const reply = await send(`/expert/tools/${tool.id}/explain`, {
        question,
        version: tool.version,
        input,
      });
      setHint(reply.hint);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  if (!tool)
    return (
      <div className="ts-loading">
        {error ? (
          <ErrorMessage message={error} />
        ) : (
          <>
            <Busy />
            Opening your tool…
          </>
        )}
      </div>
    );
  return (
    <div className="ts-builder">
      <div className="ts-breadcrumb">
        <button onClick={() => navigate("/")}>
          <ArrowLeft size={15} />
          Explore tools
        </button>
        <span>/</span>
        <span>Project quoting</span>
        <span className="ts-version">
          v{tool.version}
          {tool.owned ? " · Yours to use" : ""}
        </span>
      </div>
      <div className="ts-builder-heading">
        <div>
          <span className="ts-eyebrow">
            A LITTLE EXPERTISE FOR YOUR NEXT PROJECT
          </span>
          <h1>{tool.definition.title}</h1>
          <p>{tool.definition.description}</p>
          <div className="ts-author">
            <span className="ts-avatar">✳</span>
            <span>
              A method by <strong>{tool.definition.creator}</strong>
            </span>
            <span>USD · editable estimates</span>
          </div>
        </div>
        <div className="ts-builder-tag">
          <span>↗</span>Your work.
          <br />A fair starting point.
        </div>
      </div>
      <ErrorMessage message={error} />
      <div className="ts-builder-layout">
        <div className="ts-builder-main">
          <section className="ts-panel ts-brief-panel">
            <div className="ts-panel-heading">
              <span className="ts-step">01</span>
              <h2>What are you working on?</h2>
              <span className="ts-small-pill">
                <Sparkles size={12} />
                {config.aiReady ? "Gemini" : "Manual input"}
              </span>
            </div>
            <label className="ts-sr" htmlFor="buyer-brief">
              Describe your project
            </label>
            <textarea
              id="buyer-brief"
              value={brief}
              maxLength={2500}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="A logo and packaging project, three revision rounds… Add your estimated hours and hourly rate."
            />
            <div className="ts-brief-actions">
              <div className="ts-chip-row">
                {exampleBriefs.map((b) => (
                  <button
                    className="ts-chip"
                    key={b.label}
                    onClick={() => setBrief(b.brief)}
                  >
                    {b.label}
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </div>
              <button
                className="ts-btn small"
                disabled={!!busy || brief.trim().length < 10 || !config.aiReady}
                onClick={() => void interpret()}
              >
                {busy === "interpret" ? <Busy /> : <WandSparkles size={16} />}
                Make it fit my project
              </button>
            </div>
            {!config.aiReady && (
              <p className="ts-fine">
                AI is not configured. Enter your details in the controls below.
              </p>
            )}
            <AnimatePresence>
              {(assumptions.length > 0 || clarification) && (
                <motion.div
                  className="ts-assumptions"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                >
                  <strong>
                    <CircleHelp size={15} />
                    Check these details
                  </strong>
                  {clarification && <p>{clarification}</p>}
                  {assumptions.map((a, i) => (
                    <p key={i}>• {a}</p>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
          <section className="ts-panel">
            <div className="ts-panel-heading">
              <span className="ts-step">02</span>
              <h2>Make the numbers yours.</h2>
            </div>
            <div className="ts-field-row">
              <label className="ts-field grow">
                <span>Project name</span>
                <input
                  value={input.project}
                  maxLength={160}
                  onChange={(e) => update({ project: e.target.value })}
                />
              </label>
              <label className="ts-field">
                <span>Client</span>
                <input
                  value={input.client}
                  maxLength={100}
                  placeholder="Client or business"
                  onChange={(e) => update({ client: e.target.value })}
                />
              </label>
            </div>
            <div className="ts-table-heading">
              <span>Deliverable</span>
              <button
                className="ts-why"
                onClick={() =>
                  setExplanation(explanation === "hours" ? null : "hours")
                }
              >
                <Lightbulb size={13} />
                Why break it down?
              </button>
              <span>Hours</span>
            </div>
            <div className="ts-deliverables">
              {input.items.map((item, i) => (
                <motion.div className="ts-deliverable" layout key={i}>
                  <span className="ts-line-index">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <input
                    aria-label={`Deliverable ${i + 1}`}
                    value={item.name}
                    maxLength={100}
                    onChange={(e) =>
                      update({
                        items: input.items.map((it, j) =>
                          i === j ? { ...it, name: e.target.value } : it,
                        ),
                      })
                    }
                  />
                  <input
                    aria-label={`Hours for deliverable ${i + 1}`}
                    type="number"
                    min="0"
                    max="1000"
                    step="0.5"
                    value={item.hours}
                    onChange={(e) =>
                      update({
                        items: input.items.map((it, j) =>
                          i === j
                            ? {
                                ...it,
                                hours: Math.min(
                                  1000,
                                  Math.max(0, Number(e.target.value) || 0),
                                ),
                              }
                            : it,
                        ),
                      })
                    }
                  />
                  <button
                    className="ts-icon"
                    aria-label={`Remove deliverable ${i + 1}`}
                    disabled={input.items.length === 1}
                    onClick={() =>
                      update({ items: input.items.filter((_, j) => j !== i) })
                    }
                  >
                    <X size={15} />
                  </button>
                </motion.div>
              ))}
            </div>
            <button
              className="ts-text-btn ts-add-row"
              disabled={input.items.length >= 20}
              onClick={() =>
                update({
                  items: [
                    ...input.items,
                    { name: "New deliverable", hours: 0 },
                  ],
                })
              }
            >
              <Plus size={16} />
              Add a deliverable
            </button>
            <div className="ts-input-divider" />
            <div className="ts-field-row">
              <NumberField
                label="Your hourly rate"
                value={input.rate}
                onChange={(rate) => update({ rate })}
                suffix="USD / hr"
                step={0.5}
              />
              <NumberField
                label="Direct expenses"
                value={input.expenses}
                onChange={(expenses) => update({ expenses })}
                suffix="USD"
                max={1000000}
                step={0.01}
              />
            </div>
            <div className="ts-revision-control">
              <div>
                <label htmlFor="revisions">Revision rounds</label>
                <button
                  className="ts-why"
                  onClick={() =>
                    setExplanation(
                      explanation === "revisions" ? null : "revisions",
                    )
                  }
                >
                  How does this work?
                  <CircleHelp size={13} />
                </button>
                <div className="ts-counter">
                  <button
                    className="ts-icon"
                    aria-label="Fewer revisions"
                    disabled={input.revisions === 0}
                    onClick={() => update({ revisions: input.revisions - 1 })}
                  >
                    <Minus size={14} />
                  </button>
                  <strong>{input.revisions}</strong>
                  <button
                    className="ts-icon"
                    aria-label="More revisions"
                    disabled={input.revisions >= 100}
                    onClick={() => update({ revisions: input.revisions + 1 })}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <input
                id="revisions"
                type="range"
                min="0"
                max={Math.max(8, input.revisions)}
                value={input.revisions}
                onChange={(e) => update({ revisions: Number(e.target.value) })}
              />
              <span className="ts-fine">
                {tool.definition.includedRevisions} rounds included · each extra
                round adds {tool.definition.revisionHours} hours
              </span>
            </div>
          </section>
          <section className="ts-method-panel">
            <div>
              <span className="ts-eyebrow">
                THE THINKING IS PART OF THE TOOL
              </span>
              <h2>Know what’s behind your quote.</h2>
            </div>
            <div className="ts-method-tabs">
              {(
                ["hours", "rate", "revisions", "expenses", "buffer"] as const
              ).map((key) => (
                <button
                  key={key}
                  className={explanation === key ? "active" : ""}
                  onClick={() =>
                    setExplanation(explanation === key ? null : key)
                  }
                >
                  {key === "buffer"
                    ? "Contingency"
                    : key[0].toUpperCase() + key.slice(1)}
                  <ChevronDown size={13} />
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              {explanation && (
                <motion.div
                  key={explanation}
                  className="ts-method-explanation"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <Lightbulb size={17} />
                  <p>{tool.definition.explanations[explanation]}</p>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="ts-ask">
              <label className="ts-sr" htmlFor="method-question">
                Ask about this method
              </label>
              <input
                id="method-question"
                placeholder="Ask a question about this method…"
                value={question}
                maxLength={500}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && question.trim().length >= 3 && !busy)
                    void ask();
                }}
              />
              <button
                className="ts-icon"
                aria-label="Ask about this method"
                disabled={!!busy || question.trim().length < 3}
                onClick={() => void ask()}
              >
                {busy === "hint" ? <Busy /> : <ArrowUpRight size={19} />}
              </button>
            </div>
            {hint && (
              <p className="ts-ai-hint" role="status">
                {hint}
              </p>
            )}
          </section>
        </div>
        <aside className="ts-quote-sidebar">
          <div className="ts-quote-summary">
            <div className="ts-summary-heading">
              <span className="ts-eyebrow">YOUR PROJECT, TAKING SHAPE</span>
              <span className="ts-live-dot" />
            </div>
            <div className="ts-quote-number">
              <span>Estimated project total</span>
              <strong>
                {result ? (
                  <AnimatedMoney value={result.total} />
                ) : (
                  "Check inputs"
                )}
              </strong>
              <span>USD · based on your inputs</span>
            </div>
            <div className="ts-cost-lines">
              {result?.lines.map((line, i) => (
                <div key={i}>
                  <span>{line.label}</span>
                  <strong>{currency(line.amount)}</strong>
                </div>
              ))}
              <div>
                <button onClick={() => setExplanation("buffer")}>
                  Contingency · {tool.definition.bufferPercent}%
                  <CircleHelp size={12} />
                </button>
                <strong>{currency(result?.buffer || 0)}</strong>
              </div>
              <div>
                <span>Direct expenses</span>
                <strong>{currency(input.expenses)}</strong>
              </div>
            </div>
            <div className="ts-cost-total">
              <span>Estimated total</span>
              <strong>{currency(result?.total || 0)}</strong>
            </div>
            <p className="ts-fine">
              {result?.baseHours || 0} base hours
              {Number(result?.extraHours) > 0
                ? ` + ${result?.extraHours} revision hours`
                : ""}
              . No taxes calculated.
            </p>
            <div className="ts-save-area">
              {tool.owned ? (
                <>
                  <span className="ts-owned">
                    <CheckCircle2 size={14} />
                    {tool.source === "creator"
                      ? "Your published tool"
                      : tool.source === "demo"
                        ? "Demo access"
                        : "This tool is yours"}
                  </span>
                  <button
                    className="ts-btn full"
                    disabled={!!busy || !result}
                    onClick={() => void save()}
                  >
                    {busy === "save" ? <Busy /> : <Save size={16} />}Save{" "}
                    {quote ? "changes" : "this quote"}
                  </button>
                  <div className="ts-export-row">
                    <button
                      className="ts-btn outline"
                      disabled={!!busy || !result}
                      onClick={() => void exportQuote()}
                    >
                      <Download size={15} />
                      CSV
                    </button>
                    <button
                      className="ts-btn outline"
                      disabled={!!busy || !result}
                      onClick={() => void exportQuote(true)}
                    >
                      <Printer size={15} />
                      Print / PDF
                    </button>
                  </div>
                  {quote && (
                    <button
                      className="ts-text-btn"
                      onClick={() => navigate(`/quotes/${quote.id}?copy=1`)}
                    >
                      <Copy size={14} />
                      Use for another project
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="ts-purchase-intro">
                    <strong>Good fit? Make it yours.</strong>
                    <p>Save, reuse and export your quotes.</p>
                  </div>
                  <button
                    className="ts-btn full"
                    onClick={() => setCheckout(true)}
                  >
                    <LockKeyhole size={16} />
                    Get this tool · {currency(tool.price / 100)}
                    <ArrowUpRight size={16} />
                  </button>
                  <span className="ts-fine">
                    One-time purchase · PayPal sandbox
                  </span>
                  {config.mode === "demo" && (
                    <button
                      className="ts-text-btn"
                      onClick={async () => {
                        try {
                          await send(
                            `/expert/tools/${tool.id}/demo-access`,
                            {},
                          );
                          await refreshAccess();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Try with demo access
                      <ArrowRight size={14} />
                    </button>
                  )}
                </>
              )}
              {(notice || dirty) && (
                <p className="ts-saved-notice" role="status">
                  {dirty ? "You have unsaved changes." : notice}
                </p>
              )}
            </div>
          </div>
          <div className="ts-handwritten">
            <span>✳</span>A starting point,
            <br />
            shaped by you.
          </div>
          <p className="ts-sidebar-fine">
            Preview freely. Review all estimates before sharing. Purchased tools
            and quotes are saved in this browser; clearing cookies removes
            access.
          </p>
        </aside>
      </div>
      {checkout && (
        <ToolCheckout
          tool={tool}
          config={config}
          onClose={() => setCheckout(false)}
          onSuccess={() =>
            void refreshAccess().catch((e) => setError(e.message))
          }
        />
      )}
    </div>
  );
}

type DraftContent = {
  definition: ToolDefinition;
  method: string;
  examples: WorkedExample[];
};
type Draft = DraftContent & {
  id: string;
  revision: number;
  publishedVersion?: number;
};
const initialMethod =
  "Estimate each deliverable in hours at my hourly rate, default $65. Include 2 revision rounds in the base hours; every extra revision adds 3 hours. Add a 10% contingency to labour only, then add direct expenses at cost. No tax or discounts.";
function Creator({
  draftId,
  navigate,
  config,
}: {
  draftId?: string;
  navigate: (path: string) => void;
  config: Config;
}) {
  const [content, setContent] = useState<DraftContent>({
      definition: { ...studioDefinition, creator: "Your studio" },
      method: initialMethod,
      examples: starterExamples(),
    }),
    [draft, setDraft] = useState<Draft | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(""),
    [checks, setChecks] = useState<
      | { name: string; actual: string; expected: string; passed: boolean }[]
      | null
    >(null),
    [openSection, setOpenSection] = useState("method"),
    [previewRevisions, setPreviewRevisions] = useState(3);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (draftId)
      api<Draft>(`/expert/drafts/${draftId}`)
        .then((d) => {
          setDraft(d);
          setContent({
            definition: d.definition,
            method: d.method,
            examples: d.examples,
          });
        })
        .catch((e) => setError(e.message));
  }, [draftId]);
  function change(changes: Partial<DraftContent>) {
    setContent((c) => ({ ...c, ...changes }));
    setChecks(null);
    setNotice("");
  }
  function definition(changes: Partial<ToolDefinition>) {
    change({ definition: { ...content.definition, ...changes } });
  }
  async function persist() {
    const result = draft
      ? await send(`/expert/drafts/${draft.id}/save`, {
          ...content,
          revision: draft.revision,
        })
      : await send("/expert/drafts", content);
    setDraft(result);
    history.replaceState({}, "", `/create/${result.id}`);
    return result as Draft;
  }
  async function save() {
    setBusy("save");
    setError("");
    try {
      await persist();
      setNotice("Draft saved. Find it in My workspace.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function generateTool() {
    setBusy("generate");
    setError("");
    try {
      const generated = await send("/expert/draft-from-method", {
        method: content.method,
        creator: content.definition.creator,
      });
      change({ definition: generated.definition });
      setNotice(
        "Gemini drafted your tool. Review the rules and check your examples.",
      );
      setOpenSection("rules");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function validate() {
    setBusy("validate");
    setError("");
    try {
      const results = await send("/expert/validate", content);
      setChecks(results.checks);
      setNotice(
        results.passed
          ? "Both examples match. Your tool is ready to publish."
          : "Some totals do not match. Check the rules or expected amounts.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function publish() {
    setBusy("publish");
    setError("");
    try {
      const current = await persist();
      const tool = await send(`/expert/drafts/${current.id}/publish`, {
        revision: current.revision,
      });
      navigate(`/tools/${tool.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function importExamples(file: File) {
    setError("");
    try {
      if (!file.name.toLowerCase().endsWith(".csv") || file.size > 100000)
        throw new Error("Use a CSV smaller than 100 KB.");
      const Papa = await import("papaparse");
      const parsed = Papa.default.parse<Record<string, string>>(
        await file.text(),
        { header: true, skipEmptyLines: true },
      );
      if (parsed.errors.length)
        throw new Error("Check the CSV formatting before importing.");
      if (parsed.data.length < 2 || parsed.data.length > 8)
        throw new Error("Import between 2 and 8 worked examples.");
      const required = [
        "name",
        "hours",
        "rate",
        "revisions",
        "expenses",
        "expectedTotal",
      ];
      if (!required.every((k) => parsed.meta.fields?.includes(k)))
        throw new Error(
          "CSV headers must be: name,hours,rate,revisions,expenses,expectedTotal",
        );
      const examples = parsed.data.map((row) => {
        for (const key of required.slice(1))
          if (!row[key]?.trim() || !Number.isFinite(Number(row[key])))
            throw new Error(
              "Every example needs numeric hours, rate, revisions, expenses and expectedTotal.",
            );
        return {
          name: row.name,
          input: {
            project: row.name,
            client: "Example client",
            rate: Number(row.rate),
            revisions: Number(row.revisions),
            expenses: Number(row.expenses),
            items: [{ name: "Project work", hours: Number(row.hours) }],
          },
          expectedTotal: row.expectedTotal,
        };
      });
      change({ examples });
      setOpenSection("examples");
      setNotice(
        "Examples imported. Check them against your method before publishing.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function sampleCSV() {
    const blob = new Blob(
      [
        "name,hours,rate,revisions,expenses,expectedTotal\r\nBrand project,24,65,3,80,2010.50\r\nLogo refresh,10,50,2,25,575.00",
      ],
      { type: "text/csv" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "taskslice-examples.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const previewInput = {
    ...starterInput(),
    rate: content.definition.defaultRate,
    revisions: previewRevisions,
  };
  let result: ReturnType<typeof calculateQuote> | null = null;
  try {
    result = calculateQuote(content.definition, previewInput);
  } catch {}
  const allPass =
    !!checks && checks.length >= 2 && checks.every((c) => c.passed);
  function exampleChange(
    i: number,
    field: "hours" | "rate" | "revisions" | "expenses" | "expectedTotal",
    value: string,
  ) {
    change({
      examples: content.examples.map((example, j) => {
        if (i !== j) return example;
        if (field === "expectedTotal")
          return { ...example, expectedTotal: value };
        if (field === "hours")
          return {
            ...example,
            input: {
              ...example.input,
              items: [
                { name: "Example project work", hours: Number(value) || 0 },
              ],
            },
          };
        return {
          ...example,
          input: { ...example.input, [field]: Number(value) || 0 },
        };
      }),
    });
  }
  function section(
    name: string,
    number: string,
    title: string,
    summary: string,
    children: React.ReactNode,
  ) {
    return (
      <section
        className={`ts-editor-section ${openSection === name ? "open" : ""}`}
      >
        <button
          className="ts-editor-toggle"
          onClick={() => setOpenSection(openSection === name ? "" : name)}
          aria-expanded={openSection === name}
        >
          <span className="ts-step">{number}</span>
          <span>
            <strong>{title}</strong>
            <small>{summary}</small>
          </span>
          <ChevronDown size={19} />
        </button>
        {openSection === name && (
          <motion.div
            className="ts-editor-body"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {children}
          </motion.div>
        )}
      </section>
    );
  }
  return (
    <div className="ts-creator">
      <div className="ts-breadcrumb">
        <button onClick={() => navigate("/")}>
          <ArrowLeft size={15} />
          Explore tools
        </button>
        <span>/</span>
        <span>Create a tool</span>
      </div>
      <div className="ts-creator-heading">
        <div>
          <span className="ts-eyebrow">
            YOUR METHOD. SOMEONE ELSE’S HEAD START.
          </span>
          <h1>Make your know-how useful.</h1>
          <p>
            Start with a pricing method. Shape it into a tool. Let someone else
            put it to work.
          </p>
        </div>
        <button
          className="ts-btn outline"
          disabled={!!busy}
          onClick={() => void save()}
        >
          {busy === "save" ? <Busy /> : <Save size={16} />}Save draft
        </button>
      </div>
      <ErrorMessage message={error} />
      <div className="ts-creator-layout">
        <div className="ts-editor">
          {section(
            "method",
            "01",
            "Bring your method.",
            "Explain the way you price a project.",
            <>
              <label className="ts-field">
                <span>Your name or studio</span>
                <input
                  value={content.definition.creator}
                  maxLength={60}
                  onChange={(e) => definition({ creator: e.target.value })}
                />
              </label>
              <label className="ts-field">
                <span>How does your method work?</span>
                <textarea
                  rows={6}
                  value={content.method}
                  minLength={20}
                  maxLength={6000}
                  onChange={(e) => change({ method: e.target.value })}
                />
              </label>
              <div className="ts-supported">
                <span className="ts-small-pill">Supported in this version</span>
                <p>
                  Hours × rate, extra revision hours, labour contingency, and
                  direct expenses. USD only. No taxes, discounts, or custom
                  formulas.
                </p>
              </div>
              <button
                className="ts-btn"
                disabled={
                  !!busy ||
                  !config.aiReady ||
                  content.method.trim().length < 20 ||
                  content.definition.creator.trim().length < 2
                }
                onClick={() => void generateTool()}
              >
                {busy === "generate" ? <Busy /> : <WandSparkles size={17} />}
                Turn my method into a tool
                <ArrowRight size={16} />
              </button>
              <span className="ts-fine">
                Or edit the example directly in the next step. Gemini never
                publishes for you.
              </span>
            </>,
          )}
          {section(
            "rules",
            "02",
            "Give it a little shape.",
            "Name your tool and check the pricing rules.",
            <>
              <label className="ts-field">
                <span>Tool title</span>
                <input
                  value={content.definition.title}
                  maxLength={90}
                  onChange={(e) => definition({ title: e.target.value })}
                />
              </label>
              <label className="ts-field">
                <span>What does it help someone do?</span>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={content.definition.description}
                  onChange={(e) => definition({ description: e.target.value })}
                />
              </label>
              <div className="ts-field-row">
                <NumberField
                  label="Default hourly rate"
                  value={content.definition.defaultRate}
                  min={1}
                  suffix="USD / hr"
                  onChange={(defaultRate) => definition({ defaultRate })}
                />
                <NumberField
                  label="Included revision rounds"
                  value={content.definition.includedRevisions}
                  max={100}
                  onChange={(includedRevisions) =>
                    definition({
                      includedRevisions: Math.round(includedRevisions),
                    })
                  }
                />
              </div>
              <div className="ts-field-row">
                <NumberField
                  label="Hours per extra revision"
                  value={content.definition.revisionHours}
                  max={100}
                  step={0.5}
                  suffix="hours"
                  onChange={(revisionHours) => definition({ revisionHours })}
                />
                <NumberField
                  label="Labour contingency"
                  value={content.definition.bufferPercent}
                  max={100}
                  step={0.5}
                  suffix="%"
                  onChange={(bufferPercent) => definition({ bufferPercent })}
                />
              </div>
              <div className="ts-formula">
                <Layers size={17} />
                <p>
                  <strong>Your calculation</strong>
                  <br />
                  (Deliverable hours + extra revision hours) × rate
                  <br />+ {content.definition.bufferPercent}% labour contingency
                  + expenses
                </p>
              </div>
            </>,
          )}
          {section(
            "explanations",
            "03",
            "Leave the thinking in.",
            "Help someone understand the choices behind the numbers.",
            <>
              {(
                ["hours", "rate", "revisions", "expenses", "buffer"] as const
              ).map((key) => (
                <label className="ts-field" key={key}>
                  <span>
                    {key === "buffer"
                      ? "Contingency"
                      : key[0].toUpperCase() + key.slice(1)}
                  </span>
                  <textarea
                    rows={2}
                    maxLength={600}
                    value={content.definition.explanations[key]}
                    onChange={(e) =>
                      definition({
                        explanations: {
                          ...content.definition.explanations,
                          [key]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
              <p className="ts-fine">
                If you change a numeric rule, update its explanation too.
              </p>
            </>,
          )}
          {section(
            "examples",
            "04",
            "Show that it adds up.",
            "Check at least two different examples before publishing.",
            <>
              <div className="ts-example-toolbar">
                <button
                  className="ts-text-btn"
                  onClick={() => upload.current?.click()}
                >
                  <Upload size={15} />
                  Import examples CSV
                </button>
                <button className="ts-text-btn" onClick={sampleCSV}>
                  <Download size={15} />
                  Sample CSV
                </button>
                <input
                  className="ts-sr"
                  type="file"
                  accept=".csv,text/csv"
                  ref={upload}
                  onChange={(e) => {
                    if (e.target.files?.[0])
                      void importExamples(e.target.files[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              {content.examples.map((example, i) => (
                <div className="ts-example" key={i}>
                  <div className="ts-example-heading">
                    <label className="ts-field">
                      <span>Example {i + 1}</span>
                      <input
                        value={example.name}
                        aria-label={`Example ${i + 1} name`}
                        maxLength={100}
                        onChange={(e) =>
                          change({
                            examples: content.examples.map((item, j) =>
                              j === i
                                ? { ...item, name: e.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                    {content.examples.length > 2 && (
                      <button
                        className="ts-icon"
                        aria-label={`Remove example ${i + 1}`}
                        onClick={() =>
                          change({
                            examples: content.examples.filter(
                              (_, j) => i !== j,
                            ),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <div className="ts-example-fields">
                    {(
                      [
                        "hours",
                        "rate",
                        "revisions",
                        "expenses",
                        "expectedTotal",
                      ] as const
                    ).map((field) => (
                      <label className="ts-field" key={field}>
                        <span>
                          {field === "expectedTotal"
                            ? "Expected total"
                            : field[0].toUpperCase() + field.slice(1)}
                        </span>
                        <input
                          type="number"
                          aria-label={`Example ${i + 1} ${field}`}
                          min="0"
                          step={field === "revisions" ? 1 : 0.01}
                          value={
                            field === "hours"
                              ? example.input.items.reduce(
                                  (n, it) => n + it.hours,
                                  0,
                                )
                              : field === "expectedTotal"
                                ? example.expectedTotal
                                : example.input[field]
                          }
                          onChange={(e) =>
                            exampleChange(i, field, e.target.value)
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {checks?.[i] && (
                    <div
                      className={`ts-example-result ${checks[i].passed ? "passed" : "failed"}`}
                    >
                      {checks[i].passed ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <X size={16} />
                      )}
                      Calculated {currency(checks[i].actual)} · expected{" "}
                      {currency(checks[i].expected)}
                    </div>
                  )}
                </div>
              ))}
              {content.examples.length < 8 && (
                <button
                  className="ts-text-btn"
                  onClick={() =>
                    change({
                      examples: [
                        ...content.examples,
                        {
                          ...starterExamples()[1],
                          name: `Worked example ${content.examples.length + 1}`,
                        },
                      ],
                    })
                  }
                >
                  <Plus size={15} />
                  Add another example
                </button>
              )}
              <button
                className="ts-btn outline full"
                disabled={!!busy}
                onClick={() => void validate()}
              >
                {busy === "validate" ? <Busy /> : <CheckCircle2 size={17} />}
                Check my examples
              </button>
            </>,
          )}
          <div className="ts-publish-bar">
            <div>
              <strong>
                {allPass
                  ? "Your examples match. Ready when you are."
                  : "A useful tool starts with numbers that match."}
              </strong>
              <p>
                {allPass
                  ? "Publish a version others can try. Saved quotes keep their original rules."
                  : "Check your examples before publishing your tool."}
              </p>
            </div>
            <button
              className="ts-btn"
              disabled={!!busy || !allPass}
              onClick={() => void publish()}
            >
              {busy === "publish" ? <Busy /> : <ArrowUpRight size={17} />}
              Publish tool
            </button>
          </div>
          {notice && (
            <p className="ts-saved-notice" role="status">
              {notice}
            </p>
          )}
          <p className="ts-fine">
            Tools cost $2.00 USD in this sandbox demo. Purchases go to the
            configured seller account. Creator payouts are not part of this
            version.
          </p>
        </div>
        <aside className="ts-creator-preview">
          <div className="ts-preview-label">
            <span className="ts-live-dot" /> LIVE PREVIEW
            <span>What your buyer will use</span>
          </div>
          <div className="ts-mini-tool">
            <span className="ts-square-icon">
              <SlidersHorizontal size={22} />
            </span>
            <h2>{content.definition.title || "Your next useful tool"}</h2>
            <p>{content.definition.description}</p>
            <span className="ts-mini-author">
              By {content.definition.creator || "your studio"}
            </span>
            <div className="ts-mini-total">
              <span>Example project estimate</span>
              <strong>
                {result ? (
                  <AnimatedMoney value={result.total} />
                ) : (
                  "Check your rules"
                )}
              </strong>
            </div>
            <div className="ts-demo-slider">
              <div>
                <label htmlFor="creator-preview-revisions">
                  Revision rounds
                </label>
                <strong>{previewRevisions}</strong>
              </div>
              <input
                id="creator-preview-revisions"
                type="range"
                min="0"
                max="8"
                value={previewRevisions}
                onChange={(e) => setPreviewRevisions(Number(e.target.value))}
              />
              <small>
                {content.definition.includedRevisions} rounds included ·{" "}
                {content.definition.revisionHours}h per extra round
              </small>
            </div>
            <div className="ts-preview-method">
              <Lightbulb size={16} />
              <p>
                24 sample hours × {currency(content.definition.defaultRate)}/hr,
                plus revision time, {content.definition.bufferPercent}% labour
                contingency, and $80 expenses.
              </p>
            </div>
          </div>
          <div className="ts-creator-note">
            <span>✳</span>
            <p>
              Build the thing you
              <br />
              wish you’d had.
            </p>
          </div>
          <p className="ts-fine">
            Preview uses sample inputs. Your worked examples are checked
            separately against the calculation engine.
          </p>
        </aside>
      </div>
    </div>
  );
}
function Workspace({ navigate }: { navigate: (path: string) => void }) {
  const [data, setData] = useState<{
      drafts: Draft[];
      quotes: SavedQuote[];
      tools: ExpertTool[];
    } | null>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("quotes");
  useEffect(() => {
    api("/expert/workspace")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="ts-workspace">
      <span className="ts-eyebrow">A PLACE FOR YOUR USEFUL THINGS</span>
      <div className="ts-workspace-heading">
        <div>
          <h1>Your little head start.</h1>
          <p>Pick up a project. Reuse a method. Make something new.</p>
        </div>
        <button className="ts-btn outline" onClick={() => navigate("/create")}>
          <Plus size={16} />
          Create a tool
        </button>
      </div>
      <div className="ts-workspace-tabs">
        {[
          ["quotes", "My quotes", data?.quotes.length],
          ["tools", "My tools", data?.tools.length],
          ["drafts", "Creator drafts", data?.drafts.length],
        ].map(([key, label, count]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(String(key))}
          >
            {label}
            <span>{count || 0}</span>
          </button>
        ))}
      </div>
      <ErrorMessage message={error} />
      {!data ? (
        <div className="ts-loading">
          <Busy />
          Finding your projects…
        </div>
      ) : tab === "quotes" ? (
        data.quotes.length ? (
          <div className="ts-workspace-list">
            {data.quotes.map((q) => (
              <div className="ts-project-row" key={q.id}>
                <span className="ts-project-icon">
                  <FileText size={23} />
                </span>
                <button
                  className="ts-project-title"
                  onClick={() => navigate(`/quotes/${q.id}`)}
                >
                  <h3>{q.input.project}</h3>
                  <p>
                    {q.input.client || "No client added"} ·{" "}
                    {q.tool.definition.title} · v{q.tool.version}
                  </p>
                </button>
                <strong>{currency(q.result.total)}</strong>
                <button
                  className="ts-icon"
                  aria-label={`Duplicate ${q.input.project}`}
                  onClick={() => navigate(`/quotes/${q.id}?copy=1`)}
                >
                  <Copy size={17} />
                </button>
                <button
                  className="ts-icon"
                  aria-label={`Open ${q.input.project}`}
                  onClick={() => navigate(`/quotes/${q.id}`)}
                >
                  <ArrowUpRight size={20} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            icon={<FileText size={30} />}
            title="Your next project starts here."
            text="Try a tool, make it fit your project, and save your first quote."
            action="Try the quoting tool"
            onClick={() => navigate("/tools/studio-quote")}
          />
        )
      ) : tab === "tools" ? (
        data.tools.length ? (
          <div className="ts-workspace-list">
            {data.tools.map((t) => (
              <button
                className="ts-project-row"
                key={t.id}
                onClick={() => navigate(`/tools/${t.id}`)}
              >
                <span className="ts-project-icon">
                  <SlidersHorizontal size={23} />
                </span>
                <div className="ts-project-title">
                  <h3>{t.definition.title}</h3>
                  <p>
                    By {t.definition.creator} · version {t.version}
                  </p>
                </div>
                <span className="ts-owned">
                  <Check size={15} />
                  {t.source === "creator"
                    ? "Created by you"
                    : t.source === "demo"
                      ? "Demo access"
                      : "Purchased"}
                </span>
                <ArrowUpRight size={20} />
              </button>
            ))}
          </div>
        ) : (
          <Empty
            icon={<Layers size={30} />}
            title="A little expertise, ready to borrow."
            text="Purchased and published tools will live here, ready for your next project."
            action="Explore tools"
            onClick={() => navigate("/")}
          />
        )
      ) : data.drafts.length ? (
        <div className="ts-workspace-list">
          {data.drafts.map((d) => (
            <button
              className="ts-project-row"
              key={d.id}
              onClick={() => navigate(`/create/${d.id}`)}
            >
              <span className="ts-project-icon">
                <Pencil size={22} />
              </span>
              <div className="ts-project-title">
                <h3>{d.definition.title}</h3>
                <p>
                  Last saved{" "}
                  {new Date((d as any).updatedAt).toLocaleDateString()} ·{" "}
                  {d.publishedVersion
                    ? `Published v${d.publishedVersion}`
                    : "Unpublished draft"}
                </p>
              </div>
              <span className="ts-small-pill">Continue editing</span>
              <ArrowUpRight size={20} />
            </button>
          ))}
        </div>
      ) : (
        <Empty
          icon={<Pencil size={30} />}
          title="What do you do a little differently?"
          text="Turn your pricing method into a tool someone else can put to work."
          action="Create your first tool"
          onClick={() => navigate("/create")}
        />
      )}
      <p className="ts-workspace-footnote">
        <LockKeyhole size={14} />
        This workspace belongs to this browser. Keep your cookies to return to
        your tools and quotes.
      </p>
    </section>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="ts-empty">
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="ts-btn" onClick={onClick}>
        {action}
        <ArrowUpRight size={17} />
      </button>
    </div>
  );
}
