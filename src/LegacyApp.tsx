import { useState, useEffect, useRef, useMemo } from "react";
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useReducedMotion,
} from "motion/react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  Upload,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Layers,
  Link2,
  ScanLine,
  Sparkles,
  X,
  Download,
  Lightbulb,
  CheckCircle2,
  LoaderCircle,
  Play,
  BookOpen,
  Clock3,
  RotateCcw,
  AlertCircle,
  ExternalLink,
  LockKeyhole,
  ShieldCheck,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import type {
  Config,
  Dataset,
  Exercise,
  Lesson,
  LessonKey,
  Result,
  Settings,
  Task,
} from "./shared/types";
import { catalog, examples, getLesson } from "./shared/catalog";
import { sampleDatasets } from "./shared/data";
import { compute } from "./shared/engine";
import { api, getConfig, send } from "./api";

type View =
  | { name: "home" }
  | { name: "library" }
  | { name: "task"; id: string }
  | { name: "learn"; id: string };
const readView = (): View => {
  const p = location.pathname.split("/").filter(Boolean);
  return p[0] === "learn" && p[1]
    ? { name: "learn", id: p[1] }
    : p[0] === "tasks" && p[1]
      ? { name: "task", id: p[1] }
      : p[0] === "library"
        ? { name: "library" }
        : { name: "home" };
};
const money = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    v / 100,
  );
const iconFor = (k: LessonKey) =>
  k === "summarise-sales" ? Layers : k === "match-records" ? Link2 : ScanLine;
function Brand() {
  return (
    <span className="brand">
      <span className="brand-icon">
        <i />
        <i />
        <i />
      </span>
      taskslice<span className="brand-dot">.</span>
    </span>
  );
}
function Spin() {
  return <LoaderCircle className="spin" size={18} />;
}
function ErrorNote({ message }: { message: string }) {
  return message ? (
    <div className="error-note" role="alert">
      <AlertCircle size={17} />
      <span>{message}</span>
    </div>
  ) : null;
}
function LessonArt({
  kind,
  small = false,
}: {
  kind: LessonKey;
  small?: boolean;
}) {
  return (
    <div
      className={`lesson-art ${kind} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      {kind === "summarise-sales" ? (
        <>
          <div className="mini-table">
            {[0, 1, 2, 3].map((n) => (
              <div key={n}>
                <i />
                <span />
                <b />
              </div>
            ))}
          </div>
          <div className="art-arrow">→</div>
          <div className="mini-bars">
            {[48, 83, 63].map((h, i) => (
              <motion.i
                key={i}
                initial={{ height: 12 }}
                whileInView={{ height: h }}
                transition={{ duration: 0.7, delay: i * 0.13 }}
              />
            ))}
          </div>
        </>
      ) : kind === "match-records" ? (
        <>
          <div className="connect-table">
            {[0, 1, 2].map((n) => (
              <div key={n}>
                <b>{["A1", "A2", "A3"][n]}</b>
                <span />
              </div>
            ))}
          </div>
          <svg viewBox="0 0 55 100">
            <path d="M0 18 C28 18,25 78,55 78M0 50H55M0 82 C28 82,25 20,55 20" />
          </svg>
          <div className="connect-table right">
            {[0, 1, 2].map((n) => (
              <div key={n}>
                <i />
                <span />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flag-table">
            {[0, 1, 2, 3].map((n) => (
              <motion.div
                key={n}
                className={n === 1 || n === 3 ? "active" : ""}
                initial={{ opacity: 0.4, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: n * 0.12 }}
              >
                <span />
                <b>{[12, 3, 8, 2][n]}</b>
                <i>{n === 1 || n === 3 ? "!" : "✓"}</i>
              </motion.div>
            ))}
          </div>
          <span className="rule-bubble">
            below 5 <Check size={12} />
          </span>
        </>
      )}
    </div>
  );
}
function Transformation() {
  const [summary, setSummary] = useState(false);
  return (
    <div className="transformation">
      <div className="preview-top">
        <span>
          <i className="live-dot" /> Little Studio / sales.csv
        </span>
        <MoreHorizontal size={18} />
      </div>
      <div className="preview-caption">
        <span>
          {summary ? "THE PATTERN, FOUND" : "A LITTLE DATA. A BIG QUESTION."}
        </span>
        <AnimatePresence mode="wait">
          <motion.h3
            key={String(summary)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {summary
              ? "Oh, there’s the big picture."
              : "Which products sold the most?"}
          </motion.h3>
        </AnimatePresence>
      </div>
      <div className="preview-board">
        <AnimatePresence mode="wait">
          {!summary ? (
            <motion.div
              key="raw"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="preview-raw"
            >
              <div className="preview-tr head">
                <span>Product</span>
                <span>Qty</span>
                <span>Sales</span>
              </div>
              {[
                ["Notebook", "2", "$24.00"],
                ["Canvas tote", "1", "$28.00"],
                ["Ceramic mug", "2", "$36.00"],
                ["Notebook", "3", "$36.00"],
                ["Canvas tote", "2", "$56.00"],
              ].map((r, i) => (
                <motion.div
                  key={i}
                  className="preview-tr"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.055 }}
                >
                  <span>
                    <i className={`product-dot p${i % 3}`} />
                    {r[0]}
                  </span>
                  <span>{r[1]}</span>
                  <span>{r[2]}</span>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="summary"
              className="preview-summary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {[
                { name: "Canvas tote", v: 84, p: 92 },
                { name: "Notebook", v: 60, p: 67 },
                { name: "Ceramic mug", v: 36, p: 43 },
              ].map((r, i) => (
                <div className="summary-row" key={r.name}>
                  <div>
                    <span>{r.name}</span>
                    <b>${r.v}.00</b>
                  </div>
                  <div className="bar-track">
                    <motion.span
                      initial={{ width: 0 }}
                      animate={{ width: r.p + "%" }}
                      transition={{
                        duration: 0.65,
                        delay: i * 0.12,
                        ease: "easeOut",
                      }}
                    />
                  </div>
                </div>
              ))}
              <div className="summary-foot">
                <CheckCircle2 size={15} /> Five rows. Three clear totals.
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="preview-bottom">
        <span>
          {summary
            ? "One useful skill, unlocked."
            : "One small skill makes it click."}
        </span>
        <button
          className="preview-toggle"
          onClick={() => setSummary(!summary)}
          aria-label={summary ? "Show original rows" : "See the sales summary"}
        >
          {summary ? (
            <RotateCcw size={15} />
          ) : (
            <Play size={13} fill="currentColor" />
          )}
          {summary ? "Replay" : "See it click"}
        </button>
      </div>
      <div className="floating-label">
        <Sparkles size={15} /> less searching, more doing
      </div>
    </div>
  );
}
export default function App() {
  const [view, setView] = useState<View>(readView);
  const [config, setConfig] = useState<Config | null>(null);
  const [toast, setToast] = useState("");
  const [about, setAbout] = useState(false);
  const [bootError, setBootError] = useState("");
  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch((e) => setBootError(e.message));
    const fn = () => setView(readView());
    addEventListener("popstate", fn);
    return () => removeEventListener("popstate", fn);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  function nav(next: View) {
    const url =
      next.name === "home"
        ? "/lessons"
        : next.name === "library"
          ? "/library"
          : `/${next.name === "task" ? "tasks" : "learn"}/${next.id}`;
    history.pushState({}, "", url);
    setView(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <header className="header">
          <button
            className="brand-link"
            onClick={() => nav({ name: "home" })}
            aria-label="TaskSlice home"
          >
            <Brand />
          </button>
          <nav aria-label="Main navigation">
            <button
              className={
                view.name === "home" || view.name === "task"
                  ? "nav-link active"
                  : "nav-link"
              }
              onClick={() => nav({ name: "home" })}
            >
              Find a skill
            </button>
            <button
              className={
                view.name === "library" ? "nav-link active" : "nav-link"
              }
              onClick={() => nav({ name: "library" })}
            >
              My learning
            </button>
          </nav>
          <button className="session-badge" onClick={() => setAbout(true)}>
            <span className="status-dot" />
            {config?.paypalReady ? "Sandbox workspace" : "Local workspace"}
            <ChevronDown size={13} />
          </button>
        </header>
        <main id="main">
          <ErrorNote message={bootError} />
          <AnimatePresence mode="wait">
            <motion.div
              key={
                view.name === "task" || view.name === "learn"
                  ? view.id
                  : view.name
              }
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
            >
              {view.name === "home" ? (
                <Home config={config} navigate={nav} />
              ) : view.name === "task" ? (
                <Recommendation
                  taskId={view.id}
                  config={config}
                  navigate={nav}
                  notify={setToast}
                />
              ) : view.name === "learn" ? (
                <Workspace
                  exerciseId={view.id}
                  navigate={nav}
                  notify={setToast}
                />
              ) : (
                <Library navigate={nav} notify={setToast} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
        <footer>
          <Brand />
          <span>A small step. A skill that stays.</span>
          <button onClick={() => setAbout(true)}>
            About this workspace <ArrowUpRight size={13} />
          </button>
        </footer>
        <AnimatePresence>
          {toast && (
            <motion.div
              className="toast"
              role="status"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <CheckCircle2 size={18} />
              {toast}
            </motion.div>
          )}
          {about && (
            <Modal
              close={() => setAbout(false)}
              title="Your little learning space"
            >
              <div className="about-icon">
                <BookOpen size={28} />
              </div>
              <p>
                TaskSlice turns a task you’re stuck on into a short, hands-on
                lesson. Your progress stays in this browser.
              </p>
              <div className="connection-list">
                <div>
                  <span>Task matching</span>
                  <b>
                    {config?.aiReady
                      ? "Gemini configured"
                      : "Guided sample mode"}
                  </b>
                </div>
                <div>
                  <span>Payments</span>
                  <b>
                    {config?.paypalReady
                      ? "PayPal sandbox connected"
                      : "Not configured"}
                  </b>
                </div>
                <div>
                  <span>Data storage</span>
                  <b>On this computer</b>
                </div>
              </div>
              <p className="fine-print">
                This is a development workspace. Demo access is free and is
                never recorded as a PayPal purchase. Clearing cookies removes
                access to this browser’s guest session.
              </p>
              <button
                className="button primary full"
                onClick={() => setAbout(false)}
              >
                Got it <Check size={17} />
              </button>
            </Modal>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
function Home({
  config,
  navigate,
}: {
  config: Config | null;
  navigate: (v: View) => void;
}) {
  const [goal, setGoal] = useState("");
  const [selected, setSelected] = useState<LessonKey | null>(null);
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [sharing, setSharing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  async function chooseFiles(list: FileList | null) {
    if (!list) return;
    setError("");
    const next = [...list];
    if (next.length + files.length > 2) {
      setError("Use up to two CSV files.");
      return;
    }
    for (const f of next)
      if (f.size > 2 * 1024 * 1024 || !f.name.toLowerCase().endsWith(".csv")) {
        setError("Choose a CSV file smaller than 2 MB.");
        return;
      }
    setFiles([
      ...files,
      ...(await Promise.all(
        next.map(async (f) => ({ name: f.name, text: await f.text() })),
      )),
    ]);
    setSelected(null);
  }
  async function find(key?: LessonKey) {
    setError("");
    const text = key ? examples.find((e) => e.key === key)!.goal : goal.trim();
    if (text.length < 5) {
      setError("Tell us a little about what you want to get done.");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const task = await send("/tasks", {
        goal: text,
        ...((key || selected) && !files.length
          ? { sampleKey: key || selected }
          : {}),
        ...(files.length ? { files } : {}),
        shareSamples: sharing,
      });
      navigate({ name: "task", id: task.id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="home-page">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="tiny-spark">✳</span> A SMALLER WAY TO LEARN
          </div>
          <h1>
            A little learning.
            <br />A lot of{" "}
            <span className="heading-word">
              doing.
              <svg viewBox="0 0 230 12" preserveAspectRatio="none">
                <path d="M4 8 Q110 -3 226 6" />
              </svg>
            </span>
          </h1>
          <p className="hero-description">
            You don’t need a whole course.
            <br />
            Just the next skill to get your task done.
          </p>
          <div className="hero-proof">
            <span className="little-check">
              <Check size={13} />
            </span>{" "}
            Your task. Your data. One useful lesson.
          </div>
        </div>
        <Transformation />
      </section>
      <section className="task-section" aria-labelledby="task-heading">
        <div className="task-card">
          <div className="task-card-heading">
            <span className="small-round">
              <Sparkles size={17} />
            </span>
            <h2 id="task-heading">What are you working on?</h2>
            <span className="subtle-label">Start where you are.</span>
          </div>
          <textarea
            ref={inputRef}
            aria-label="Describe your spreadsheet task"
            placeholder="I have a sales sheet. How do I find my best-selling products?"
            value={goal}
            maxLength={2000}
            onChange={(e) => {
              setGoal(e.target.value);
              setSelected(null);
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void find();
            }}
          />
          <div className="task-actions">
            <div className="upload-area">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                multiple
                hidden
                onChange={(e) => {
                  void chooseFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                className="upload-button"
                onClick={() => fileRef.current?.click()}
              >
                <Plus size={16} /> Add your CSV
              </button>
              <span className="file-note">or try sample data</span>
            </div>
            <button
              className="button primary find-button"
              onClick={() => void find()}
              disabled={busy || !config}
            >
              {busy ? (
                <>
                  <Spin />
                  Finding your next step
                </>
              ) : (
                <>
                  Find my next step <ArrowUpRight size={18} />
                </>
              )}
            </button>
          </div>
          {files.length > 0 && (
            <div className="upload-details">
              {files.map((f, i) => (
                <span className="file-chip" key={f.name}>
                  <FileSpreadsheet size={14} />
                  {f.name}
                  <button
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles(files.filter((_, n) => n !== i))}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
              <label className="privacy-toggle">
                <input
                  type="checkbox"
                  checked={sharing}
                  onChange={(e) => setSharing(e.target.checked)}
                />{" "}
                Share column names and up to 5 sample rows with{" "}
                {config?.aiReady ? "AI" : "the guided matcher"}
              </label>
            </div>
          )}
          <ErrorNote message={error} />
        </div>
        <div className="suggestions">
          <span>A little inspiration</span>
          {examples.map((e) => (
            <button
              disabled={busy}
              key={e.key}
              onClick={() => {
                setGoal(e.goal);
                setSelected(e.key);
                inputRef.current?.focus();
              }}
            >
              {e.label}
              <ArrowUpRight size={12} />
            </button>
          ))}
        </div>
      </section>
      <section className="catalog-section" aria-labelledby="catalog-heading">
        <div className="section-heading">
          <div>
            <div className="eyebrow muted">LESS COURSE. MORE CLICK.</div>
            <h2 id="catalog-heading">Small lessons. Useful outcomes.</h2>
          </div>
          <p>
            Pick a starting point.
            <br />
            Make something work.
          </p>
        </div>
        <div className="lesson-grid">
          {catalog.map((l, i) => {
            const Icon = iconFor(l.key);
            return (
              <motion.button
                key={l.key}
                className={`lesson-card ${l.color}`}
                onClick={() => void find(l.key)}
                disabled={busy || !config}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <div className="lesson-card-top">
                  <span className="lesson-category">
                    <Icon size={14} />
                    {l.tag}
                  </span>
                  <span className="card-link">
                    <ArrowUpRight size={17} />
                  </span>
                </div>
                <LessonArt kind={l.key} />
                <div className="lesson-card-copy">
                  <h3>{l.title}</h3>
                  <p>{l.description}</p>
                </div>
                <div className="lesson-card-bottom">
                  <span>
                    <Clock3 size={13} />
                    {l.minutes} min lesson
                  </span>
                  <span>
                    {money(l.price)}
                    <span className="currency"> USD</span>
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>
      <div className="quiet-note">
        <span className="note-spark">✳</span>
        <p>
          Not another thing on your to-do list.
          <br />
          <b>A little help getting through it.</b>
        </p>
        <span className="drawn-arrow">↗</span>
      </div>
    </div>
  );
}
function Modal({
  close,
  title,
  children,
}: {
  close: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const root = ref.current;
    root?.querySelector<HTMLElement>("button")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && root) {
        const nodes = [
          ...root.querySelectorAll<HTMLElement>(
            'button,a,input,select,textarea,[tabindex="0"]',
          ),
        ].filter((x) => !x.hasAttribute("disabled"));
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
    document.addEventListener("keydown", handler);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={close}
    >
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
function Recommendation({
  taskId,
  config,
  navigate,
  notify,
}: {
  taskId: string;
  config: Config | null;
  navigate: (v: View) => void;
  notify: (s: string) => void;
}) {
  const [task, setTask] = useState<(Task & { owned: boolean }) | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [hint, setHint] = useState("");
  useEffect(() => {
    api("/tasks/" + taskId)
      .then(setTask)
      .catch((e) => setError(e.message));
  }, [taskId]);
  async function open(demo = false) {
    setBusy(true);
    setError("");
    try {
      if (demo) await send("/demo-access", { taskId });
      const ex = await send("/exercises", { taskId });
      navigate({ name: "learn", id: ex.id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!task)
    return (
      <div className="loading-page">
        <Spin />
        <span>{error || "A small step is coming together…"}</span>
      </div>
    );
  const lesson = getLesson(task.lessonKey)!;
  const Icon = iconFor(lesson.key);
  if (task.unsupported || task.clarification)
    return (
      <div className="narrow-page">
        <button
          className="back-link"
          onClick={() => navigate({ name: "home" })}
        >
          <ArrowLeft size={16} /> Back to your task
        </button>
        <div className="empty-card">
          <div className="empty-icon">
            <Lightbulb size={30} />
          </div>
          <h1>
            {task.unsupported
              ? "A little outside our toolkit."
              : "One small question first."}
          </h1>
          <p>
            {task.clarification ||
              "We currently teach summaries, table matching, and numeric rules. Try a task in one of those areas—there’s no purchase to make here."}
          </p>
          <button
            className="button primary"
            onClick={() => navigate({ name: "home" })}
          >
            Refine my task <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  return (
    <div className="recommendation-page">
      <button className="back-link" onClick={() => navigate({ name: "home" })}>
        <ArrowLeft size={16} /> Back to your task
      </button>
      <div className="recommendation-intro">
        <div className="eyebrow">
          <span className="tiny-spark">✳</span> YOUR NEXT LITTLE BREAKTHROUGH
        </div>
        <h1>There’s a skill for that.</h1>
        <p>
          You asked: <span>“{task.goal}”</span>
        </p>
      </div>
      <div className="recommendation-layout">
        <div className="recommended-main">
          <div className={`recommendation-art ${lesson.color}`}>
            <LessonArt kind={lesson.key} />
            <span className="matched-badge">
              <Check size={13} />
              {task.source === "ai"
                ? "Matched to your task"
                : "Guided lesson match"}
            </span>
          </div>
          <div className="recommended-copy">
            <span className="lesson-category">
              <Icon size={15} />
              {lesson.tag}
            </span>
            <h2>{lesson.title}</h2>
            <p>{task.rationale}</p>
            <div className="outcome-box">
              <span className="small-round">
                <Check size={17} />
              </span>
              <div>
                <b>Your small win</b>
                <p>{lesson.outcome}</p>
              </div>
            </div>
            <h3>Three steps. Something you can actually use.</h3>
            <div className="lesson-outline">
              {lesson.steps.map((s, i) => (
                <div key={i}>
                  <span>0{i + 1}</span>
                  <div>
                    <b>{s.title}</b>
                    <p>
                      {i === 0
                        ? "Understand the idea with your own columns."
                        : i === 1
                          ? "Try the controls and watch your data change."
                          : "Check your understanding and take your result."}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <aside className="purchase-card">
          <span className="eyebrow muted">ONE SKILL. YOURS TO REUSE.</span>
          <div className="purchase-price">
            {task.owned ? "Already yours" : money(lesson.price)}
            {!task.owned && <span> USD</span>}
          </div>
          <p>A hands-on lesson built around the task you’re doing.</p>
          <div className="purchase-features">
            <span>
              <Clock3 size={16} />
              {lesson.minutes} minutes, at your pace
            </span>
            <span>
              <FileSpreadsheet size={16} />
              Work with your own data
            </span>
            <span>
              <RotateCcw size={16} />
              Return and practise again
            </span>
            <span>
              <Download size={16} />A result you can take with you
            </span>
          </div>
          {task.owned ? (
            <button
              className="button primary full"
              onClick={() => void open()}
              disabled={busy}
            >
              {busy ? (
                <Spin />
              ) : (
                <>
                  Continue lesson <ArrowRight size={17} />
                </>
              )}
            </button>
          ) : config?.paypalReady ? (
            <button
              className="button paypal full"
              onClick={() => setCheckout(true)}
            >
              Get this lesson with <b>PayPal</b>
              <ArrowUpRight size={15} />
            </button>
          ) : (
            <div className="connection-note">
              <LockKeyhole size={16} />
              <span>
                PayPal sandbox will be available after your credentials are
                configured.
              </span>
            </div>
          )}
          {!task.owned && config?.mode === "demo" && (
            <button
              className="button demo full"
              onClick={() => void open(true)}
              disabled={busy}
            >
              {busy ? (
                <Spin />
              ) : (
                <>
                  Try with free demo access <ArrowRight size={16} />
                </>
              )}
            </button>
          )}
          <p className="checkout-caption">
            <ShieldCheck size={13} />
            {config?.paypalReady
              ? "Sandbox checkout. No real money."
              : "Local demo. No payment is simulated."}
          </p>
          <ErrorNote message={error} />
          <div className="dataset-summary">
            <span>YOUR WORKING DATA</span>
            {task.datasets.map((d) => (
              <div key={d.id}>
                <FileSpreadsheet size={17} />
                <div>
                  <b>{d.name}</b>
                  <small>
                    {d.rows.length} rows · {d.columns.length} columns
                  </small>
                </div>
                <Check size={14} />
              </div>
            ))}
          </div>
          <p className="source-note">
            {task.source === "ai"
              ? "AI matched this lesson to your goal."
              : "Guided sample matching is active. Connect AI to interpret a wider range of descriptions."}
          </p>
        </aside>
      </div>
      {checkout && (
        <Modal
          close={() => setCheckout(false)}
          title="One useful skill, coming up"
        >
          <p className="modal-subtitle">{lesson.title}</p>
          <div className="checkout-total">
            <span>Single lesson · USD</span>
            <b>{money(lesson.price)}</b>
          </div>
          <PayPalCheckout
            taskId={taskId}
            config={config!}
            onSuccess={() => {
              setCheckout(false);
              notify("Sandbox payment confirmed. Your lesson is ready.");
              void open();
            }}
          />
          <p className="fine-print">
            PayPal sandbox uses your test buyer account. No real money moves.
          </p>
        </Modal>
      )}
    </div>
  );
}
function PayPalCheckout({
  taskId,
  config,
  onSuccess,
}: {
  taskId: string;
  config: Config;
  onSuccess: () => void;
}) {
  const target = useRef<HTMLDivElement>(null);
  const orderId = useRef("");
  const key = useRef(crypto.randomUUID());
  const [status, setStatus] = useState("Loading secure sandbox checkout…");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let buttons: any;
    async function setup() {
      try {
        const w = window as any;
        if (!w.paypal) {
          await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector<HTMLScriptElement>(
              "script[data-paypal]",
            );
            if (existing) {
              existing.addEventListener("load", () => resolve(), {
                once: true,
              });
              existing.addEventListener(
                "error",
                () =>
                  reject(
                    new Error("PayPal could not load. Please reopen checkout."),
                  ),
                { once: true },
              );
              return;
            }
            const s = document.createElement("script");
            s.dataset.paypal = "true";
            s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.paypalClientId!)}&currency=USD&intent=capture&components=buttons`;
            s.onload = () => resolve();
            s.onerror = () => {
              s.remove();
              reject(
                new Error(
                  "PayPal could not load. Please check your connection.",
                ),
              );
            };
            document.head.append(s);
          });
        }
        if (cancelled) return;
        setStatus("");
        buttons = w.paypal.Buttons({
          style: {
            layout: "vertical",
            shape: "pill",
            label: "paypal",
            height: 48,
          },
          createOrder: async () => {
            const o = await send("/orders", {
              taskId,
              idempotencyKey: key.current,
            });
            if (o.owned) {
              onSuccess();
              throw new Error("This lesson is already yours.");
            }
            orderId.current = o.id;
            return o.providerId;
          },
          onApprove: async () => {
            setStatus("Confirming your sandbox payment…");
            try {
              const result = await send(
                `/orders/${orderId.current}/capture`,
                {},
              );
              if (result.status === "paid") onSuccess();
              else {
                setPending(true);
                setStatus(
                  "Your payment is still being checked. You do not need to pay again.",
                );
              }
            } catch (e) {
              setPending(true);
              setError((e as Error).message);
            }
          },
          onCancel: () =>
            setStatus(
              "Checkout closed. Nothing has been unlocked; you can try again.",
            ),
          onError: () =>
            setError(
              "Checkout could not finish. If you completed payment, check its status before trying again.",
            ),
        });
        if (target.current) await buttons.render(target.current);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    void setup();
    return () => {
      cancelled = true;
      try {
        buttons?.close();
      } catch {}
    };
  }, []);
  async function check() {
    setError("");
    try {
      const o = await api(`/orders/${orderId.current}`);
      if (o.status === "paid") onSuccess();
      else
        setStatus(
          "Still waiting for PayPal confirmation. Your order is saved.",
        );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="paypal-checkout">
      <div ref={target} />
      {status && (
        <p className="status-line" role="status">
          {status}
        </p>
      )}
      <ErrorNote message={error} />
      {pending && (
        <button className="button secondary full" onClick={() => void check()}>
          Check payment status <RotateCcw size={15} />
        </button>
      )}
    </div>
  );
}
function DataTable({
  dataset,
  result,
  title,
}: {
  dataset?: Dataset;
  result?: Result;
  title?: string;
}) {
  const headers = result?.headers || dataset?.columns.map((c) => c.name) || [];
  const rows =
    result?.rows ||
    dataset?.rows.map((r) =>
      Object.fromEntries(dataset.columns.map((c) => [c.name, r[c.id]])),
    ) ||
    [];
  return (
    <div className="data-panel">
      {title && (
        <div className="data-panel-heading">
          <span>
            <FileSpreadsheet size={15} />
            {title}
          </span>
          <span>{rows.length} rows</span>
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="row-number">#</th>
              {headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((r, i) => (
              <motion.tr
                key={`${i}-${headers.join()}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.025, 0.25), duration: 0.2 }}
                className={
                  Object.values(r).includes("Flagged") ? "flagged-row" : ""
                }
              >
                <td className="row-number">{i + 1}</td>
                {headers.map((h, n) => (
                  <td key={n}>
                    {r[h] === "Flagged" ? (
                      <span className="cell-badge flagged">
                        <span />
                        Flagged
                      </span>
                    ) : r[h] === "Matched" ? (
                      <span className="cell-badge matched">
                        <Check size={11} />
                        Matched
                      </span>
                    ) : r[h] === "Unknown" || r[h] === "No match" ? (
                      <span className="cell-badge neutral">{r[h]}</span>
                    ) : r[h] === "" ? (
                      <span className="null-cell">—</span>
                    ) : (
                      r[h]
                    )}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 100 && (
        <div className="table-caption">
          Showing the first 100 rows. Your download includes all {rows.length}.
        </div>
      )}
    </div>
  );
}
function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Choose a column",
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  options: { id: string; name: string }[];
  placeholder?: string;
}) {
  return (
    <label className="select-field">
      <span>{label}</span>
      <div>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <ChevronDown size={15} />
      </div>
    </label>
  );
}
function Workspace({
  exerciseId,
  navigate,
  notify,
}: {
  exerciseId: string;
  navigate: (v: View) => void;
  notify: (s: string) => void;
}) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const exRef = useRef<Exercise | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState("");
  const [check, setCheck] = useState<{
    correct: boolean;
    answerCorrect: boolean;
    message: string;
  } | null>(null);
  const [hint, setHint] = useState("");
  const [hintLevel, setHintLevel] = useState(0);
  const [hintBusy, setHintBusy] = useState(false);
  const [source, setSource] = useState<"first" | "second">("first");
  const queue = useRef(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    api<Exercise>("/exercises/" + exerciseId)
      .then((e) => {
        exRef.current = e;
        setExercise(e);
        setSettings(e.settings);
        setStep(e.step);
        setAnswer(e.answer);
        if (e.completed)
          setCheck({
            correct: true,
            answerCorrect: true,
            message: "One more useful skill in your toolkit.",
          });
      })
      .catch((e) => setError(e.message));
  }, [exerciseId]);
  function persist(s: Settings, nextStep: number, ans: number | null) {
    setSaving("Saving…");
    const task = queue.current.then(async () => {
      const ex = exRef.current!;
      const saved = await api<Exercise>("/exercises/" + ex.id, {
        method: "PATCH",
        body: JSON.stringify({
          revision: ex.revision,
          settings: s,
          step: nextStep,
          answer: ans,
        }),
      });
      exRef.current = saved;
      setExercise(saved);
      setSaving("Progress saved");
    });
    queue.current = task.catch((e) => {
      setSaving("Not saved");
      setError((e as Error).message);
    });
    return task;
  }
  useEffect(() => {
    if (!exercise || !settings || busy || exercise.completed) return;
    timer.current = setTimeout(
      () => void persist(settings, step, answer).catch(() => {}),
      650,
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [settings, step, answer]);
  const lesson = exercise ? getLesson(exercise.lessonKey)! : null;
  const preview = useMemo(() => {
    if (!exercise || !settings) return { result: null, error: "" };
    try {
      return {
        result: compute(exercise.task.datasets, exercise.lessonKey, settings),
        error: "",
      };
    } catch (e) {
      return { result: null, error: (e as Error).message };
    }
  }, [exercise, settings]);
  if (!exercise || !settings || !lesson)
    return (
      <div className="loading-page">
        <Spin />
        <span>{error || "Opening your learning space…"}</span>
        {error && (
          <button
            className="button secondary"
            onClick={() => navigate({ name: "library" })}
          >
            Back to my learning
          </button>
        )}
      </div>
    );
  const ds = exercise.task.datasets;
  const numeric = ds[0].columns.filter((c) => c.type === "decimal");
  const Icon = iconFor(lesson.key);
  const complete = !!exercise.completed;
  function edit(patch: Partial<Settings>) {
    setSettings({ ...settings!, ...patch });
    setCheck(null);
    if (exRef.current?.completed) {
      exRef.current = { ...exRef.current, completed: false };
      setExercise(exRef.current);
    }
  }
  async function next(n: number) {
    if (!settings) return;
    setError("");
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    try {
      await persist(settings, n, answer);
      setStep(n);
    } catch {
    } finally {
      setBusy(false);
    }
  }
  async function checkWork() {
    if (!settings) return;
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    setError("");
    try {
      await persist(settings, 2, answer);
      const result = await send(`/exercises/${exerciseId}/check`, {
        settings,
        answer,
        revision: exRef.current!.revision,
      });
      exRef.current = result.exercise;
      setExercise(result.exercise);
      setCheck(result);
      setStep(2);
      setSaving("Progress saved");
      if (result.exercise.completed) {
        setCelebrate(true);
        notify("A little win. Your result is ready to download.");
        setTimeout(() => setCelebrate(false), 2200);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function getHint() {
    setHintBusy(true);
    setError("");
    try {
      const r = await send(`/exercises/${exerciseId}/hints`, {
        level: Math.min(hintLevel, 2),
      });
      setHint(r.hint);
      setHintLevel(Math.min(hintLevel + 1, 2));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setHintBusy(false);
    }
  }
  async function leave() {
    if (timer.current) clearTimeout(timer.current);
    try {
      if (!complete) await persist(settings!, step, answer);
      navigate({ name: "library" });
    } catch {}
  }
  return (
    <div className="workspace-page">
      <div className="workspace-top">
        <button className="back-link" onClick={() => void leave()}>
          <ArrowLeft size={16} /> My learning
        </button>
        <span className="save-status">
          <span className="status-dot" />
          {saving || "Your workspace is ready"}
        </span>
        <span className="workspace-access">
          {exercise.access === "demo"
            ? "Free demo access"
            : "PayPal sandbox purchase"}
        </span>
      </div>
      <div className="workspace-title">
        <div>
          <span className={`skill-icon ${lesson.color}`}>
            <Icon size={22} />
          </span>
          <div>
            <span className="eyebrow muted">LET’S MAKE IT CLICK</span>
            <h1>{lesson.title}</h1>
          </div>
        </div>
        <span className="workspace-duration">
          <Clock3 size={15} />
          {lesson.minutes} min · at your pace
        </span>
      </div>
      <div className="workspace-layout">
        <aside className="lesson-sidebar">
          <div className="step-progress">
            <span>
              {complete ? "YOUR LITTLE WIN" : `STEP ${step + 1} OF 3`}
            </span>
            <div>
              {lesson.steps.map((_, i) => (
                <span key={i} className={i <= step ? "filled" : ""} />
              ))}
            </div>
          </div>
          <nav className="step-navigation" aria-label="Lesson steps">
            {lesson.steps.map((s, i) => (
              <button
                key={s.title}
                className={
                  step === i ? "current" : i < step || complete ? "done" : ""
                }
                onClick={() => void next(i)}
                disabled={busy}
              >
                <span>
                  {i < step || complete ? <Check size={14} /> : i + 1}
                </span>
                {s.title}
                {step === i && <ChevronRight size={14} />}
              </button>
            ))}
          </nav>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              className="step-explanation"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              <h2>{lesson.steps[step].title}</h2>
              <p>{lesson.steps[step].body}</p>
            </motion.div>
          </AnimatePresence>
          <div className="your-task">
            <span>YOUR TASK</span>
            <p>“{exercise.task.goal}”</p>
          </div>
          <button
            className="hint-button"
            onClick={() => void getHint()}
            disabled={hintBusy}
          >
            {hintBusy ? <Spin /> : <Lightbulb size={17} />}{" "}
            {hint ? "Another little nudge" : "A little nudge, please"}
            <Plus size={14} />
          </button>
          <AnimatePresence>
            {hint && (
              <motion.div
                className="hint-box"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <span>A LITTLE NUDGE</span>
                <p>{hint}</p>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="sidebar-bottom">
            <span>
              <ShieldCheck size={14} /> Practice with the data you choose.
            </span>
            <small>
              Learning the idea here makes it easier to use in your spreadsheet
              later.
            </small>
          </div>
        </aside>
        <div className="working-area">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 7 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.22 }}
            >
              {step === 0 ? (
                <>
                  <div className="work-section-title">
                    <h2>First, a look at what you’ve got.</h2>
                    <p>
                      These are the rows we’ll work with. Nothing changes until
                      you try it.
                    </p>
                  </div>
                  {ds.length > 1 && (
                    <div className="table-tabs">
                      <button
                        className={source === "first" ? "active" : ""}
                        onClick={() => setSource("first")}
                      >
                        {ds[0].name}
                      </button>
                      <button
                        className={source === "second" ? "active" : ""}
                        onClick={() => setSource("second")}
                      >
                        {ds[1].name}
                      </button>
                    </div>
                  )}
                  <DataTable
                    dataset={ds[source === "second" && ds[1] ? 1 : 0]}
                    title={ds[source === "second" && ds[1] ? 1 : 0].name}
                  />
                  {ds
                    .flatMap((d) => d.warnings)
                    .map((w) => (
                      <div className="table-warning" key={w}>
                        <AlertCircle size={15} />
                        {w}
                      </div>
                    ))}
                  <div className="concept-note">
                    <span className="concept-icon">
                      <Icon size={22} />
                    </span>
                    <div>
                      <b>
                        {lesson.key === "summarise-sales"
                          ? "Think of it as sorting receipts into piles."
                          : lesson.key === "match-records"
                            ? "A shared key is your tables’ common language."
                            : "One rule can do a lot of scanning."}
                      </b>
                      <p>
                        {lesson.key === "summarise-sales"
                          ? "A group makes a pile. A measure adds up what’s inside."
                          : lesson.key === "match-records"
                            ? "The product code in one table points to the same product in the other."
                            : "You choose what matters. The rule applies it consistently to every row."}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="work-section-title">
                    <h2>
                      {complete
                        ? "A small step. A real result."
                        : step === 1
                          ? "Your turn. Give it a little try."
                          : "Let’s see what clicked."}
                    </h2>
                    <p>
                      {complete
                        ? "You made this. Download it, use it, and bring the skill to your next task."
                        : step === 1
                          ? "Change a control and watch the result below. It’s safe to explore."
                          : "Check your setup and answer one quick question to finish."}
                    </p>
                  </div>
                  <fieldset disabled={busy} className="controls-fieldset">
                    <div
                      className={`operation-controls ${lesson.key === "match-records" ? "three" : ""}`}
                    >
                      {lesson.key === "summarise-sales" ? (
                        <>
                          <SelectField
                            label="Make a group for each"
                            value={settings.group}
                            options={ds[0].columns}
                            onChange={(group) => edit({ group })}
                          />
                          <span className="control-connector">then</span>
                          <SelectField
                            label="Add up the"
                            value={settings.measure}
                            options={numeric}
                            onChange={(measure) => edit({ measure })}
                          />
                          <label className="month-switch">
                            <input
                              type="checkbox"
                              checked={settings.month}
                              onChange={(e) =>
                                edit({ month: e.target.checked })
                              }
                            />
                            <span />
                            Also group by month
                          </label>
                        </>
                      ) : lesson.key === "match-records" ? (
                        <>
                          <SelectField
                            label="Key in your first table"
                            value={settings.leftKey}
                            options={ds[0].columns}
                            onChange={(leftKey) => edit({ leftKey })}
                          />
                          <SelectField
                            label="Matching key in the second"
                            value={settings.rightKey}
                            options={ds[1]?.columns || []}
                            onChange={(rightKey) => edit({ rightKey })}
                          />
                          <SelectField
                            label="Bring across this detail"
                            value={settings.returnColumn}
                            options={ds[1]?.columns || []}
                            onChange={(returnColumn) => edit({ returnColumn })}
                          />
                        </>
                      ) : (
                        <>
                          <SelectField
                            label="Look at this column"
                            value={settings.column}
                            options={numeric}
                            onChange={(column) => edit({ column })}
                          />
                          <SelectField
                            label="Flag it when the value"
                            value={settings.comparator}
                            options={[
                              { id: "lt", name: "is below" },
                              { id: "lte", name: "is at most" },
                              { id: "eq", name: "equals" },
                              { id: "gte", name: "is at least" },
                              { id: "gt", name: "is above" },
                            ]}
                            onChange={(comparator) =>
                              edit({
                                comparator:
                                  comparator as Settings["comparator"],
                              })
                            }
                          />
                          <label className="threshold-field">
                            <span>Threshold</span>
                            <input
                              aria-label="Threshold"
                              type="number"
                              value={settings.threshold}
                              onChange={(e) =>
                                edit({ threshold: e.target.value })
                              }
                            />
                          </label>
                        </>
                      )}
                    </div>
                  </fieldset>
                  {preview.result ? (
                    <>
                      <div className="result-label">
                        <span>
                          <i className="live-dot" /> YOUR RESULT, LIVE
                        </span>
                        <span>
                          {preview.result.rows.length}{" "}
                          {lesson.key === "summarise-sales" ? "groups" : "rows"}
                        </span>
                      </div>
                      <DataTable result={preview.result} />
                      {preview.result.warnings.map((w) => (
                        <div className="table-warning" key={w}>
                          <AlertCircle size={15} />
                          {w}
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="result-empty">
                      <div className="empty-icon">
                        <Icon size={26} />
                      </div>
                      <h3>A little choice makes it click.</h3>
                      <p>
                        {preview.error ||
                          "Choose your columns above to see your result here."}
                      </p>
                    </div>
                  )}
                  {step === 2 && (
                    <div className="quick-check">
                      <span className="eyebrow muted">ONE QUICK CHECK</span>
                      <h3>{lesson.question}</h3>
                      <div>
                        {lesson.answers.map((a, i) => (
                          <button
                            key={a}
                            disabled={busy}
                            className={`answer-choice ${answer === i ? "selected" : ""} ${complete && answer === i ? "correct" : ""}`}
                            onClick={() => {
                              setAnswer(i);
                              setCheck(null);
                              if (exRef.current?.completed) {
                                exRef.current = {
                                  ...exRef.current,
                                  completed: false,
                                };
                                setExercise(exRef.current);
                              }
                            }}
                          >
                            <span>
                              {answer === i ? (
                                <Check size={13} />
                              ) : (
                                String.fromCharCode(65 + i)
                              )}
                            </span>
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {check && (
                    <motion.div
                      role="status"
                      className={`check-feedback ${check.correct && check.answerCorrect ? "success" : "retry"}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {check.correct && check.answerCorrect ? (
                        <CheckCircle2 size={21} />
                      ) : (
                        <Lightbulb size={21} />
                      )}
                      <div>
                        <b>
                          {check.correct && check.answerCorrect
                            ? "Look at you, making things happen."
                            : "You’re getting there."}
                        </b>
                        <p>{check.message}</p>
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
          <ErrorNote message={error} />
          <div className="workspace-bottom">
            <span className="subtle-label">
              {step === 0
                ? "A familiar task. A fresh way to see it."
                : step === 1
                  ? "Try things. That’s how it sticks."
                  : complete
                    ? "This skill is yours to come back to."
                    : "Understanding beats memorising."}
            </span>
            {step < 2 ? (
              <button
                className="button primary"
                onClick={() => void next(step + 1)}
                disabled={busy}
              >
                {busy ? (
                  <Spin />
                ) : step === 0 ? (
                  <>
                    Let’s try it <ArrowRight size={17} />
                  </>
                ) : (
                  <>
                    Check my understanding <ArrowRight size={17} />
                  </>
                )}
              </button>
            ) : complete ? (
              <a
                className="button primary"
                href={`/api/exercises/${exerciseId}/export`}
                download
              >
                <Download size={17} />
                Download my result
              </a>
            ) : (
              <button
                className="button primary"
                onClick={() => void checkWork()}
                disabled={busy || !preview.result || answer === null}
              >
                {busy ? (
                  <Spin />
                ) : (
                  <>
                    Check my work <Check size={17} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
      {celebrate && (
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <motion.i
              key={i}
              style={{
                background: ["#b6d66e", "#2d5b46", "#e2aa85", "#b5a8db"][i % 4],
                left: `${25 + ((i * 7) % 55)}%`,
              }}
              initial={{ y: -30, x: 0, opacity: 1, rotate: 0 }}
              animate={{
                y: 550,
                x: (i % 2 ? 1 : -1) * (30 + i * 5),
                opacity: 0,
                rotate: i * 50,
              }}
              transition={{ duration: 1.7, delay: i * 0.025 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
function Library({
  navigate,
  notify,
}: {
  navigate: (v: View) => void;
  notify: (s: string) => void;
}) {
  const [data, setData] = useState<{
    exercises: Exercise[];
    owned: { lesson: string; source: string }[];
    orders: any[];
  } | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [remove, setRemove] = useState(false);
  useEffect(() => {
    api("/library")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  async function clear() {
    setDeleting(true);
    try {
      await api("/data", { method: "DELETE" });
      setData((d) => (d ? { ...d, exercises: [] } : null));
      notify(
        "Your uploaded data and exercises have been removed. Lesson access is kept.",
      );
      setRemove(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  return (
    <div className="library-page">
      <div className="library-title">
        <div>
          <div className="eyebrow">
            <span className="tiny-spark">✳</span> YOUR GROWING TOOLKIT
          </div>
          <h1>Little skills. Lasting progress.</h1>
          <p>Pick up where you left off. Or put a skill to work again.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => navigate({ name: "home" })}
        >
          Try a new task <Plus size={17} />
        </button>
      </div>
      <ErrorNote message={error} />
      {!data ? (
        <div className="loading-page">
          <Spin />
        </div>
      ) : data.exercises.length ? (
        <>
          <div className="library-grid">
            {data.exercises.map((e) => {
              const l = getLesson(e.lessonKey)!;
              const Icon = iconFor(l.key);
              const active = data.owned.some((o) => o.lesson === e.lessonKey);
              return (
                <button
                  className={`library-card ${l.color}`}
                  key={e.id}
                  disabled={!active}
                  onClick={() => navigate({ name: "learn", id: e.id })}
                >
                  <div className="library-card-top">
                    <span className={`skill-icon ${l.color}`}>
                      <Icon size={21} />
                    </span>
                    <span
                      className={`progress-pill ${e.completed ? "complete" : ""}`}
                    >
                      {!active ? (
                        "Access unavailable"
                      ) : e.completed ? (
                        <>
                          <Check size={12} />
                          Completed
                        </>
                      ) : (
                        "In progress"
                      )}
                    </span>
                  </div>
                  <h2>{l.title}</h2>
                  <p>{e.task.goal}</p>
                  <div className="library-progress">
                    <span
                      style={{
                        width: e.completed
                          ? "100%"
                          : `${((e.step + 1) / 3) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="library-card-bottom">
                    <span>
                      {e.access === "demo" ? "Demo access" : "Sandbox purchase"}
                    </span>
                    <b>
                      {e.completed ? "Practise again" : "Keep going"}{" "}
                      <ArrowRight size={15} />
                    </b>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="library-data-note">
            <span>
              <ShieldCheck size={15} /> Your data stays on this computer.
              Inactive exercises expire after 7 days; lesson access stays.
            </span>
            <button onClick={() => setRemove(true)}>
              <Trash2 size={14} />
              Remove my data
            </button>
          </div>
        </>
      ) : (
        <div className="empty-card library-empty">
          <div className="empty-book-art">
            <BookOpen size={42} />
            <Sparkles size={18} />
          </div>
          <h2>Your next small win goes here.</h2>
          <p>
            {data.owned.length
              ? "Your lesson access is still here. Start a new task to put it to work."
              : "Start with a task. Finish with something you know how to do."}
          </p>
          <button
            className="button primary"
            onClick={() => navigate({ name: "home" })}
          >
            Find my first skill <ArrowRight size={17} />
          </button>
        </div>
      )}
      {data?.orders.some(
        (o) => !["paid", "refunded", "reversed"].includes(o.status),
      ) && (
        <div className="pending-orders">
          <h2>Saved checkouts</h2>
          {data.orders
            .filter((o) => !["paid", "refunded", "reversed"].includes(o.status))
            .map((o) => (
              <div key={o.id}>
                <span>
                  {getLesson(o.lesson)?.title}
                  <small>{o.status.replaceAll("_", " ")}</small>
                </span>
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      const latest = await api("/orders/" + o.id);
                      notify(
                        latest.status === "paid"
                          ? "Payment confirmed. Reopen your task to begin."
                          : "PayPal has not confirmed payment yet. You do not need to pay again.",
                      );
                      api("/library").then(setData);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Check status <RotateCcw size={14} />
                </button>
              </div>
            ))}
        </div>
      )}
      {remove && (
        <Modal close={() => setRemove(false)} title="Remove your working data?">
          <p>
            This removes your tasks, uploaded data, and exercises from this
            computer. Your lesson access and payment records stay.
          </p>
          <button
            className="button primary full"
            disabled={deleting}
            onClick={() => void clear()}
          >
            {deleting ? (
              <Spin />
            ) : (
              <>
                Remove my data <Trash2 size={16} />
              </>
            )}
          </button>
        </Modal>
      )}
    </div>
  );
}
