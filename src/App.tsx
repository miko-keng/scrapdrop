import { useEffect, useState, useRef } from "react";
import { lazy, Suspense } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  Check,
  X,
  Sparkles,
  Search,
  Layers,
  SlidersHorizontal,
  Upload,
  Download,
  Folder,
  CalendarDays,
  CheckCircle2,
  LockKeyhole,
  LoaderCircle,
  ChevronDown,
  Code2,
  Copy,
  ExternalLink,
  FileImage,
  UserRound,
  LogOut,
  BookOpen,
  Play,
  RotateCcw,
  MessageSquare,
  ShieldCheck,
  CircleHelp,
} from "lucide-react";
import { api, getConfig, send, setCSRF } from "./api";
import type { Config } from "./shared/types";
import {
  comparisonKey,
  sampleContracts,
  type SampleContract,
} from "./market/contracts";
import { money, type MarketTool, type Family } from "./market/model";
import "./market/style.css";
import { GuidedExample, SampleAttachment } from "./market/RequestFlow";
const ExpertiseApp = lazy(() => import("./ExpertiseApp"));
type Session = {
  account: null | { id: string; name: string; email: string };
  ai: {
    mode: string;
    available: boolean;
    liveRequests: number;
    budget: number;
  };
  demo: boolean;
  referenceOrigin: string;
  referenceInboxConfigured: boolean;
  referenceOwner: boolean;
};
function Brand() {
  return (
    <span className="mk-brand">
      <i>
        <b />
        <b />
        <b />
      </i>
      taskslice<span>.</span>
    </span>
  );
}
async function launchApplication(tool: MarketTool, nav: (url: string) => void) {
  const launch = await send(`/market/tools/${tool.id}/launch`, {});
  if (launch.url.startsWith("/")) nav(launch.url);
  else location.assign(launch.url);
}
const Spin = () => <LoaderCircle size={17} className="spin" />;
function ErrorBox({ text }: { text: string }) {
  return text ? (
    <p className="mk-error" role="alert">
      {text}
    </p>
  ) : null;
}
function useModal(onClose: () => void) {
  const modal = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        modal.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, textarea, select, a[href], iframe",
        ) || [],
      ).filter((el) => el.offsetParent !== null);
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (element: HTMLElement | null) => {
    modal.current = element;
  };
}
export default function App() {
  const [path, setPath] = useState(location.pathname),
    [config, setConfig] = useState<Config | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [error, setError] = useState(""),
    [auth, setAuth] = useState(false);
  async function refresh() {
    const s = await api<Session>("/market/session");
    setSession(s);
    return s;
  }
  useEffect(() => {
    getConfig()
      .then((c) => {
        setConfig(c);
        return refresh();
      })
      .catch((e) => setError(e.message));
    const pop = () => setPath(location.pathname);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function nav(url: string) {
    history.pushState({}, "", url);
    setPath(location.pathname);
    window.scrollTo(0, 0);
  }
  const legacy = /^\/(expertise|quotes|lessons|learn|tasks|library)(\/|$)/.test(
    path,
  );
  if (legacy)
    return (
      <Suspense fallback={<p>Opening earlier TaskSlice tools…</p>}>
        <ExpertiseApp />
      </Suspense>
    );
  const refreshAuth = async () => {
    await refresh();
    setAuth(false);
  };
  const needAccount = () => {
    if (!session?.account) {
      setAuth(true);
      return false;
    }
    return true;
  };
  const detail = path.match(/^\/(tools|apps)\/([^/]+)$/),
    publicBoard = path.match(/^\/b\/([^/]+)$/);
  return (
    <MotionConfig reducedMotion="user">
      <div className="mk-shell">
        <header className="mk-header">
          <button aria-label="TaskSlice home" onClick={() => nav("/")}>
            <Brand />
          </button>
          <nav aria-label="Main navigation">
            <button
              className={path === "/" ? "active" : ""}
              onClick={() => nav("/")}
            >
              Explore solutions
            </button>
            <button
              className={path === "/workspace" ? "active" : ""}
              onClick={() => nav("/workspace")}
            >
              My workspace
            </button>
            <button
              className={
                path === "/builder" || path === "/create" ? "active" : ""
              }
              onClick={() => nav("/builder")}
            >
              For builders
            </button>
          </nav>
          <button
            className="mk-account"
            onClick={() =>
              session?.account ? nav("/workspace") : setAuth(true)
            }
          >
            <UserRound size={15} />
            {session?.account ? session.account.name.split(" ")[0] : "Sign in"}
          </button>
        </header>
        <ErrorBox text={error} />
        <main>
          {!session || !config ? (
            <div className="mk-loading">
              <Spin />
              Getting things ready…
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={path}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {publicBoard ? (
                  <BookingPublic boardId={publicBoard[1]} />
                ) : path === "/builder" || path === "/create" ? (
                  <Builder
                    session={session}
                    requireAccount={needAccount}
                    nav={nav}
                  />
                ) : path === "/workspace" ? (
                  <Workspace
                    session={session}
                    requireAccount={needAccount}
                    nav={nav}
                    logout={async () => {
                      const r = await send("/market/auth/logout", {});
                      setCSRF(r.csrf);
                      await refresh();
                      nav("/");
                    }}
                  />
                ) : detail ? (
                  <ToolPage
                    id={detail[2]}
                    application={detail[1] === "apps"}
                    config={config}
                    session={session}
                    requireAccount={needAccount}
                    nav={nav}
                  />
                ) : (
                  <Explore session={session} nav={nav} />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
        <footer className="mk-footer">
          <Brand />
          <span>Small tools. Real possibilities.</span>
          <div>
            <span className="mk-dot" />
            PayPal sandbox
            <a href="/lessons">
              Earlier lessons
              <ArrowUpRight size={12} />
            </a>
          </div>
        </footer>
        {auth && (
          <Auth onClose={() => setAuth(false)} onSuccess={refreshAuth} />
        )}
      </div>
    </MotionConfig>
  );
}
function Auth({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [register, setRegister] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const modalRef = useModal(onClose);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await send(
        `/market/auth/${register ? "register" : "login"}`,
        { email, password, ...(register ? { name } : {}) },
      );
      setCSRF(result.csrf);
      await onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="mk-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        ref={modalRef}
        className="mk-dialog"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-heading"
      >
        <button
          type="button"
          className="mk-icon close"
          onClick={onClose}
          aria-label="Close sign in"
        >
          <X size={19} />
        </button>
        <span className="mk-kicker">YOUR USEFUL THINGS, ALL TOGETHER</span>
        <h2 id="auth-heading">
          {register ? "Make yourself at home." : "Good to see you again."}
        </h2>
        <p>Save purchases and projects to your account.</p>
        <ErrorBox text={error} />
        {register && (
          <label>
            Display name
            <input
              autoFocus
              required
              minLength={2}
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus={!register}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={10}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={register ? "new-password" : "current-password"}
          />
        </label>
        <small>
          At least 10 characters. This is your TaskSlice account, not your
          PayPal login.
        </small>
        <button className="mk-btn full" disabled={busy}>
          {busy ? <Spin /> : register ? "Create account" : "Sign in"}
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          className="mk-text"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
        <small>
          Local prototype accounts persist on this computer. Email recovery is
          not connected yet.
        </small>
      </form>
    </div>
  );
}
function Explore({
  session,
  nav,
}: {
  session: Session;
  nav: (s: string) => void;
}) {
  const [text, setText] = useState(""),
    [catalog, setCatalog] = useState<MarketTool[]>([]),
    [matches, setMatches] = useState<MarketTool[] | null>(null),
    [problem, setProblem] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [family, setFamily] = useState<Family | "all">("all"),
    [compare, setCompare] = useState<string[]>([]),
    [result, setResult] = useState<any[]>([]),
    [mapping, setMapping] = useState(""),
    [showMapping, setShowMapping] = useState(false),
    [comparison, setComparison] = useState<SampleContract>("image-rename-v1");
  useEffect(() => {
    api<MarketTool[]>("/market/tools")
      .then(setCatalog)
      .catch((e) => setError(e.message));
  }, []);
  async function find(manual = false) {
    setBusy(true);
    setError("");
    try {
      const data = await send("/market/problems", {
        text: text || "Find an application",
        ...(manual
          ? { manualFamily: family === "all" ? "batch-file-renaming" : family }
          : {}),
      });
      setProblem(data.problem);
      setMatches(data.tools);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    setBusy(true);
    setError("");
    try {
      const data = await send("/market/trials", {
        toolIds: compare,
        sample: true,
        label: "Sunday-studio",
        date: "2026-10-24",
        preserveFolders: true,
        mapping,
      });
      setResult(data.results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = (matches || catalog).filter(
    (t) => family === "all" || t.family === family,
  );
  const comparable = catalog.filter((t) => comparisonKey(t));
  const groups = [...new Set(comparable.map((t) => t.sampleContract!))];
  const activeContract = groups.includes(comparison) ? comparison : groups[0];
  function select(t: MarketTool) {
    const key = comparisonKey(t);
    if (!key) {
      nav(`/tools/${t.id}`);
      return;
    }
    setResult([]);
    if (key !== activeContract) {
      setComparison(key);
      setCompare([t.id]);
    } else
      setCompare((old) =>
        old.includes(t.id)
          ? old.filter((id) => id !== t.id)
          : [...old.slice(-2), t.id],
      );
  }
  return (
    <>
      <section className="mk-hero">
        <div>
          <span className="mk-kicker">
            <span>✳</span> A PROBLEM SHARED. A SOLUTION FOUND.
          </span>
          <h1>
            Less figuring it out.
            <br />
            <em>More getting it done.</em>
          </h1>
          <p>
            Find a working tool for the thing you need to do. Try it on a real
            task. Make sure it fits before you make it yours.
          </p>
          <div className="mk-search">
            <Search size={20} />
            <label className="mk-sr" htmlFor="problem">
              What do you need to get done?
            </label>
            <textarea
              id="problem"
              value={text}
              maxLength={1500}
              onChange={(e) => setText(e.target.value)}
              placeholder="I need to rename a batch of event photos and keep the folders…"
            />
            <button
              className="mk-btn"
              aria-label="Find a fit"
              disabled={busy}
              onClick={() => void find()}
            >
              {busy ? <Spin /> : <ArrowUpRight size={21} />}
              <span>Find a fit</span>
            </button>
          </div>
          <div className="mk-examples">
            <span>Try a starting point</span>
            <button
              onClick={() => {
                setText("Rename my event photos into a neatly named ZIP");
                setFamily("batch-file-renaming");
              }}
            >
              Organise client photos
              <ArrowUpRight size={11} />
            </button>
            <button
              onClick={() => {
                setText("Create a workshop booking page with limited capacity");
                setFamily("booking-pages");
              }}
            >
              Fill a workshop
              <ArrowUpRight size={11} />
            </button>
          </div>
          <small>
            {session.ai.mode === "live"
              ? "AI interpretation is available on request."
              : "Local interpretation fixtures · no Gemini calls while testing."}{" "}
            You can also choose a category below.
          </small>
        </div>
        <HeroArt nav={nav} />
      </section>
      <section className="mk-catalog">
        <div className="mk-section-heading">
          <div>
            <span className="mk-kicker">
              BUILT FOR A PARTICULAR KIND OF “HELP.”
            </span>
            <h2>A good tool changes your day.</h2>
          </div>
          <button className="mk-text" onClick={() => nav("/builder")}>
            Have something useful?
            <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="mk-filter-bar">
          <div>
            {[
              ["all", "All solutions"],
              ["batch-file-renaming", "Files & delivery"],
              ["booking-pages", "Bookings & people"],
              ["custom", "Independent previews"],
            ].map(([key, label]) => (
              <button
                className={family === key ? "selected" : ""}
                key={key}
                onClick={() => {
                  setFamily(key as any);
                  setMatches(null);
                  setProblem(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <span>
            {visible.length} working{" "}
            {visible.length === 1 ? "solution" : "solutions"}
          </span>
        </div>
        {problem && (
          <div className="mk-match-note">
            <Sparkles size={16} />
            <span>
              {problem.clarification ||
                `Matched ${problem.family.replaceAll("-", " ")}${problem.requirements.length ? " with " + problem.requirements.join(", ").replaceAll("-", " ") : ""}.`}
              <small>
                {problem.source === "ai"
                  ? "Gemini interpretation"
                  : "Deterministic fixture/manual match"}{" "}
                · capability checks applied
              </small>
            </span>
            <button className="mk-text" onClick={() => void find(true)}>
              Use selected category
            </button>
          </div>
        )}
        <ErrorBox text={error} />
        <div className="mk-grid">
          {visible.map((t) => (
            <ToolCard
              key={t.id}
              tool={t}
              selected={compare.includes(t.id)}
              onOpen={() => nav(`/tools/${t.id}`)}
              onCompare={() => select(t)}
            />
          ))}
        </div>
        {visible.length === 0 && (
          <div className="mk-empty">
            <Search size={28} />
            <h3>No exact match yet.</h3>
            <p>
              Try another category or fewer requirements. We won't claim a tool
              supports a format it doesn't.
            </p>
          </div>
        )}
      </section>
      <section className="mk-comparison" id="comparison">
        <div className="mk-section-heading">
          <div>
            <span className="mk-kicker">SAME TASK. DIFFERENT APPROACHES.</span>
            <h2>Put the fit to the test.</h2>
            <p>
              Compare applications that support the same verified sample
              operation. Each runs the same input; results and limits come from
              the actual run.
            </p>
          </div>
          <span className="mk-handwritten">
            See the work,
            <br />
            then decide.
          </span>
        </div>
        <div className="mk-compare-controls">
          <div className="mk-sample-files">
            <FileImage size={20} />
            <span>
              {activeContract
                ? sampleContracts[activeContract].title
                : "No connected samples yet"}
              <small>
                {activeContract
                  ? sampleContracts[activeContract].sample
                  : "Providers appear here after their sample connection passes."}
              </small>
            </span>
          </div>
          <label className="mk-comparison-group">
            Compare task
            <select
              aria-label="Comparison task"
              value={activeContract || ""}
              onChange={(e) => {
                setComparison(e.target.value as SampleContract);
                setCompare([]);
                setResult([]);
              }}
            >
              {groups.map((key) => (
                <option key={key} value={key}>
                  {sampleContracts[key].title}
                </option>
              ))}
            </select>
          </label>
          <div className="mk-compare-choices">
            {comparable
              .filter((t) => comparisonKey(t) === activeContract)
              .map((t) => (
                <button
                  className={compare.includes(t.id) ? "selected" : ""}
                  key={t.id}
                  onClick={() => select(t)}
                >
                  <span>
                    {compare.includes(t.id) ? (
                      <Check size={12} />
                    ) : (
                      <Plus size={12} />
                    )}
                  </span>
                  {t.title}
                </button>
              ))}
          </div>
          <button
            className="mk-btn"
            disabled={!compare.length || busy}
            onClick={() => void run()}
          >
            {busy ? <Spin /> : <Play size={15} />}Run same sample
          </button>
        </div>
        {activeContract === "image-rename-v1" && (
          <button
            className="mk-text"
            onClick={() => setShowMapping(!showMapping)}
          >
            <Code2 size={13} />
            Optional mapping CSV
            <ChevronDown size={13} />
          </button>
        )}
        {showMapping && activeContract === "image-rename-v1" && (
          <label className="mk-field">
            Applied by tools declaring CSV mapping support; other tools use the
            naming pattern.
            <textarea
              value={mapping}
              onChange={(e) => setMapping(e.target.value)}
              placeholder={
                "oldName,newName\ncamera/IMG_1042.png,selected/hero.png"
              }
            />
          </label>
        )}
        <div className="mk-results-grid">
          {result.map((r) => (
            <TrialResult
              key={r.id}
              result={r}
              onOpen={() => nav(`/tools/${r.toolId}`)}
            />
          ))}
        </div>
        {!result.length && (
          <div className="mk-compare-empty">
            <Layers size={25} />
            <p>
              Choose up to three compatible tools, then run the sample.
              <br />
              {activeContract === "image-rename-v1"
                ? "You'll see actual filenames, downloadable outputs and byte-preservation checks."
                : "You'll see which reservation attempts fit within the available capacity."}
            </p>
          </div>
        )}
      </section>
      <section className="mk-builder-invite">
        <span className="mk-doodle">✳</span>
        <div>
          <span className="mk-kicker">YOU BUILT SOMETHING USEFUL.</span>
          <h2>Give it a place to be found.</h2>
          <p>
            Connect your website, walk through integration, and let buyers try
            what it actually does.
          </p>
        </div>
        <button className="mk-btn" onClick={() => nav("/builder")}>
          Meet your next customer
          <ArrowUpRight size={17} />
        </button>
      </section>
    </>
  );
}
function HeroArt({ nav }: { nav: (url: string) => void }) {
  const [renamed, setRenamed] = useState(false);
  return (
    <div className="mk-hero-art">
      <div className="mk-sticky-note">
        <span>
          Good work starts
          <br />
          with a good fit.
        </span>
      </div>
      <motion.div
        className="mk-demo"
        initial={{ rotate: 2, y: 10 }}
        animate={{ rotate: 0, y: 0 }}
      >
        <div className="mk-demo-top">
          <Folder size={18} />
          <span>EXAMPLE · PATTERN RENAME</span>
          <span className="mk-dot" />
        </div>
        <h3>Organise a photographer’s delivery.</h3>
        <div className="mk-demo-files">
          {["IMG_1042.png", "IMG_1081.png", "DSC_0024.png"].map((name, i) => (
            <div key={name}>
              <span className={"mk-photo p" + i} />
              <motion.span
                key={renamed ? i : name}
                initial={{ opacity: 0.4, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
              >
                {renamed
                  ? `Wedding_2026-10-25_${String(i + 1).padStart(3, "0")}.png`
                  : name}
              </motion.span>
              {renamed ? (
                <CheckCircle2 size={14} />
              ) : (
                <span className="mk-file-ext">PNG</span>
              )}
            </div>
          ))}
        </div>
        <button onClick={() => setRenamed(!renamed)}>
          <span>{renamed ? <Check size={15} /> : <Play size={14} />}</span>
          {renamed ? "Show original filenames" : "Preview the filename change"}
          <ArrowRight size={16} />
        </button>
        <small>
          Illustration: camera filenames become project + date + sequence.
        </small>
        <button
          className="mk-example-open"
          onClick={() => nav("/tools/pattern-rename?example=photographer")}
        >
          Try Pattern Rename with sample files
          <ArrowRight size={14} />
        </button>
      </motion.div>
      <span className="mk-art-caption">↗ Go on. Give it a try.</span>
    </div>
  );
}
function ToolCard({
  tool,
  selected,
  onOpen,
  onCompare,
}: {
  tool: MarketTool;
  selected: boolean;
  onOpen: () => void;
  onCompare: () => void;
}) {
  const kind =
    tool.id === "booking-board"
      ? "booking"
      : tool.id === "map-rename"
        ? "mapping"
        : "rename";
  return (
    <motion.article className="mk-card" whileHover={{ y: -4 }}>
      <button
        className={`mk-card-art ${kind}`}
        onClick={onOpen}
        aria-label={`Open ${tool.title}`}
      >
        <span className="mk-art-grid" />
        {kind === "booking" ? (
          <>
            <CalendarDays size={60} />
            <span className="mk-art-label">A seat for something good.</span>
            <i className="mk-art-ticket">
              YOU'RE
              <br />
              ON THE LIST
            </i>
          </>
        ) : (
          <>
            <span className="mk-file-paper">
              <FileImage size={27} />
              <i />
              <i />
            </span>
            <span className="mk-card-arrow">
              {kind === "mapping" ? "⇄" : "↗"}
            </span>
            <span className="mk-art-label">
              {kind === "mapping"
                ? "Everything in its place."
                : "A little less file chaos."}
            </span>
          </>
        )}
      </button>
      <div className="mk-card-content">
        <span className="mk-kicker">
          {tool.family === "booking-pages"
            ? "BOOKINGS & PEOPLE"
            : tool.reference
              ? "FILES & DELIVERY"
              : "INDEPENDENT PROVIDER"}
        </span>
        <button className="mk-card-title" onClick={onOpen}>
          <h3>{tool.title}</h3>
          <ArrowUpRight size={18} />
        </button>
        <p>{tool.subtitle || tool.description}</p>
        <div className="mk-cap-tags">
          {tool.capabilities.slice(0, 2).map((c) => (
            <span key={c}>{c.replaceAll("-", " ")}</span>
          ))}
        </div>
        <div className="mk-card-bottom">
          <span>
            {tool.reference ? "First-party reference app" : tool.provider}
            <small>
              {tool.reference || tool.purchasable
                ? `${money(tool.price)} USD · 30-day access`
                : tool.state || "Preview only"}
            </small>
          </span>
          <button
            className={"mk-circle " + (selected ? "selected" : "")}
            onClick={onCompare}
            aria-label={
              !!comparisonKey(tool)
                ? `${selected ? "Remove" : "Compare"} ${tool.title}`
                : `Try ${tool.title}`
            }
          >
            {selected ? (
              <Check size={17} />
            ) : !!comparisonKey(tool) ? (
              <Plus size={17} />
            ) : (
              <ArrowUpRight size={17} />
            )}
          </button>
        </div>
      </div>
    </motion.article>
  );
}
function TrialResult({
  result: r,
  onOpen,
}: {
  result: any;
  onOpen?: () => void;
}) {
  if (r.status === "failed")
    return (
      <div className="mk-result mk-result-failed" role="alert">
        <h3>{r.toolTitle}</h3>
        <p>{r.message}</p>
        <small>
          This run failed; no successful output or quality score is claimed.
          Other tools in the comparison can still succeed.
        </small>
      </div>
    );
  return (
    <div className="mk-result">
      <div className="mk-result-head">
        <span className="mk-pass">
          <CheckCircle2 size={14} />
          {r.replay ? "Re-run of attached sample" : "Actual sample result"}
        </span>
        <span>
          {r.cached ? "Cached · " : ""}
          {r.elapsedMs} ms{r.cached ? " original run" : ""}
        </span>
      </div>
      <h3>{r.toolTitle}</h3>
      {r.kind === "files" ? (
        <>
          <div className="mk-output-list">
            {r.rows.map((row: any) => (
              <div key={row.oldName}>
                <span>{row.oldName}</span>
                <ArrowRight size={12} />
                <strong>{row.newName}</strong>
              </div>
            ))}
          </div>
          <div className="mk-checks">
            <span>
              <Check size={13} />
              {r.checks.fileCount} files preserved
            </span>
            <span>
              <Check size={13} />
              Unique names
            </span>
            <span>
              <Check size={13} />
              SHA-256 bytes match
            </span>
          </div>
          {r.unmatched?.length > 0 && (
            <p className="mk-note">
              {r.unmatched.length} filenames used the pattern because no mapping
              matched.
            </p>
          )}
          {r.unusedMappings?.length > 0 && (
            <p className="mk-note">
              {r.unusedMappings.length} mapping rows did not match an input
              file.
            </p>
          )}
          <div className="mk-downloads">
            {r.artifacts.map((a: any) => (
              <a key={a.id} href={`/api/market/artifacts/${a.id}`}>
                <Download size={13} />
                {a.type === "application/zip" ? "Image ZIP" : "Mapping CSV"}
              </a>
            ))}
          </div>
        </>
      ) : (
        <p className="mk-note">
          Capacity test: {r.accepted} reservations accepted, {r.rejected}{" "}
          rejected after {r.capacity} places filled. {r.note}
        </p>
      )}
      {onOpen && (
        <button className="mk-text" onClick={onOpen}>
          Explore this tool
          <ArrowUpRight size={14} />
        </button>
      )}
      <small>
        {r.replay
          ? "Reproduced from the attached settings. This does not implement a requested feature."
          : "Observed on this sample, not a universal quality score. Output expires after 24 hours."}
      </small>
    </div>
  );
}
function ToolPage({
  id,
  application,
  session,
  config,
  requireAccount,
  nav,
}: {
  id: string;
  application: boolean;
  session: Session;
  config: Config;
  requireAccount: () => boolean;
  nav: (s: string) => void;
}) {
  const [tool, setTool] = useState<MarketTool | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sample, setSample] = useState(true),
    [files, setFiles] = useState<any[]>([]),
    [label, setLabel] = useState(
      new URLSearchParams(location.search).has("example")
        ? "Wedding"
        : "Sunday-studio",
    ),
    [pattern, setPattern] = useState("{label}_{date}_{seq}"),
    [date, setDate] = useState(
      new URLSearchParams(location.search).has("example")
        ? "2026-10-25"
        : "2026-10-24",
    ),
    [folders, setFolders] = useState(true),
    [mapping, setMapping] = useState(""),
    [result, setResult] = useState<any>(null),
    [checkout, setCheckout] = useState(false),
    [notice, setNotice] = useState(""),
    [request, setRequest] = useState(""),
    [requestSample, setRequestSample] = useState<any>(null),
    [presets, setPresets] = useState<any[]>([]),
    [boards, setBoards] = useState<any[]>([]),
    [boardTitle, setBoardTitle] = useState("Creative lettering workshop"),
    [boardDate, setBoardDate] = useState("2026-12-01T10:00"),
    [capacity, setCapacity] = useState(12),
    [attendees, setAttendees] = useState<{ id: string; rows: any[] } | null>(
      null,
    );
  async function refresh() {
    const t = await api<MarketTool>(`/market/tools/${id}`);
    setTool(t);
    if (t.owned && t.family === "batch-file-renaming")
      setPresets(await api(`/market/presets/${id}`));
    if (session.account && t.family === "booking-pages") {
      const lib = await api("/market/library");
      setBoards(lib.boards);
    }
    return t;
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [id, session.account?.id]);
  async function upload(selected: FileList | null) {
    if (!selected) return;
    setError("");
    try {
      if (selected.length > 100) throw new Error("Choose at most 100 images.");
      const data = await Promise.all(
        Array.from(selected)
          .filter(
            (file) => file.type === "image/png" || file.type === "image/jpeg",
          )
          .map(
            (file) =>
              new Promise<any>((resolve, reject) => {
                if (file.size > 2 * 1024 * 1024)
                  return reject(
                    new Error("Each image must be 2 MB or smaller."),
                  );
                const reader = new FileReader();
                reader.onload = () =>
                  resolve({
                    name: file.webkitRelativePath || file.name,
                    type: file.type,
                    data: String(reader.result).split(",")[1],
                  });
                reader.onerror = () =>
                  reject(new Error("A file could not be read."));
                reader.readAsDataURL(file);
              }),
          ),
      );
      setFiles(data);
      setSample(false);
      setResult(null);
      setRequestSample(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function run() {
    setBusy(true);
    setError("");
    try {
      const r = await send("/market/trials", {
        toolIds: [id],
        pattern,
        sample,
        files: sample ? undefined : files,
        label,
        date,
        preserveFolders: folders,
        mapping,
      });
      setResult(r.results[0]);
      setRequestSample(r.results[0].sampleInput ? r.results[0] : null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function savePreset() {
    if (!requireAccount()) return;
    if (!tool?.owned) {
      setCheckout(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await send("/market/presets", {
        tool: id,
        name: label,
        pattern,
        label,
        date,
        preserveFolders: folders,
      });
      setNotice("Naming preset saved to your account.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createBoard() {
    if (!requireAccount()) return;
    if (!tool?.owned) {
      setCheckout(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await send("/market/boards", {
        title: boardTitle,
        date: new Date(boardDate).toISOString(),
        capacity,
      });
      setNotice("Your booking page is ready to share.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function runRequestSample() {
    setBusy(true);
    setError("");
    try {
      const run = await send("/market/trials", {
        toolIds: [id],
        sample: true,
        label,
        date,
        pattern,
        preserveFolders: folders,
        mapping,
      });
      setRequestSample(run.results[0]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function adapt() {
    if (!requireAccount()) return;
    setBusy(true);
    setError("");
    try {
      const sent = await send("/market/adaptations", {
        toolId: id,
        request,
        ...(requestSample ? { sampleJobId: requestSample.id } : {}),
      });
      setNotice(
        sent.delivery === "awaiting-owner-setup"
          ? "Request and sample saved. The TaskSlice reference-app inbox is awaiting owner setup; track it in My workspace."
          : "Request saved in the builder inbox. Track the response in My workspace. No payment was collected.",
      );
      setRequest("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!tool)
    return (
      <div className="mk-loading">
        {error || (
          <>
            <Spin />
            Opening the application…
          </>
        )}
      </div>
    );
  return (
    <section className="mk-tool-page">
      <div className="mk-breadcrumb">
        <button onClick={() => nav("/")}>
          <ArrowLeft size={14} />
          Explore solutions
        </button>
        <span>/</span>
        <span>
          {tool.family === "booking-pages"
            ? "Bookings & people"
            : "Files & delivery"}
        </span>
        <span>v{tool.version}</span>
      </div>
      <div className="mk-tool-heading">
        <div>
          <span className="mk-kicker">
            {tool.reference
              ? "A WORKING FIRST-PARTY REFERENCE APP"
              : tool.operatorOwned
                ? "TASKSLICE-OPERATED EXTERNAL DEMO"
                : "INDEPENDENT PROVIDER WEBSITE"}
          </span>
          <h1>{tool.title}</h1>
          <p>{tool.description}</p>
          <div className="mk-attribution">
            <span className="mk-avatar">✳</span>
            {tool.provider}
            <span>{tool.inputs.join(" · ")}</span>
          </div>
        </div>
        <span className="mk-handwritten">
          A good fit
          <br />
          feels different.
        </span>
      </div>
      <ErrorBox text={error} />
      <div className="mk-tool-layout">
        <div>
          {!tool.reference ? (
            <div className="mk-panel">
              <h2>Explore the provider’s website.</h2>
              <p>
                {tool.operatorOwned
                  ? "This separately hosted demo uses the configured TaskSlice sandbox seller. Paid operations are checked by the provider server."
                  : `This listing is ${tool.state}. Independent paid sales require seller onboarding; a listing alone does not unlock an external website.`}
              </p>
              <a
                className="mk-btn"
                href={tool.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open provider preview
                <ExternalLink size={15} />
              </a>
              {tool.sampleReady && (
                <>
                  <p>
                    Try the provider’s verified sample here. Only bundled
                    example data is sent to this provider.
                  </p>
                  <button
                    className="mk-btn outline"
                    disabled={busy}
                    onClick={() => void run()}
                  >
                    <Play size={14} />
                    Run provider sample
                  </button>
                </>
              )}
            </div>
          ) : tool.family === "batch-file-renaming" ? (
            <div className="mk-panel">
              <div className="mk-panel-title">
                <span className="mk-number">01</span>
                <h2>
                  {application
                    ? "Your file delivery workspace"
                    : "Give it a real task."}
                </h2>
              </div>
              <div className="mk-file-zone">
                <FileImage size={27} />
                <strong>
                  {sample
                    ? "Sunday Studio sample"
                    : `${files.length} images selected`}
                </strong>
                <p>
                  {sample
                    ? "3 PNG images in camera/ and portraits/ folders"
                    : files
                        .map((f) => f.name)
                        .slice(0, 4)
                        .join(", ")}
                </p>
                <label className="mk-btn outline">
                  <Upload size={14} />
                  Choose JPEG / PNG images
                  <input
                    className="mk-sr"
                    type="file"
                    multiple
                    accept="image/jpeg,image/png"
                    onChange={(e) => void upload(e.target.files)}
                  />
                </label>
                {id === "map-rename" && (
                  <label className="mk-btn outline">
                    <Upload size={14} />
                    Choose image folder
                    <input
                      className="mk-sr"
                      type="file"
                      multiple
                      {...({ webkitdirectory: "" } as any)}
                      onChange={(e) => void upload(e.target.files)}
                    />
                  </label>
                )}
                {!sample && (
                  <button
                    className="mk-text"
                    onClick={() => {
                      setSample(true);
                      setFiles([]);
                    }}
                  >
                    Use the supplied sample instead
                  </button>
                )}
                <small>
                  Files go only to this TaskSlice reference app. No image data
                  is sent to Gemini. 2 MB each, 12 MB total.
                </small>
              </div>
              {!sample && (
                <ol className="mk-input-order">
                  {files.map((file, index) => (
                    <li key={file.name}>
                      <span>
                        {index + 1}. {file.name}
                      </span>
                      <button
                        className="mk-text"
                        aria-label={`Move ${file.name} earlier`}
                        disabled={index === 0}
                        onClick={() =>
                          setFiles((old) => {
                            const next = [...old];
                            [next[index - 1], next[index]] = [
                              next[index],
                              next[index - 1],
                            ];
                            return next;
                          })
                        }
                      >
                        ↑
                      </button>
                      <button
                        className="mk-text"
                        aria-label={`Move ${file.name} later`}
                        disabled={index === files.length - 1}
                        onClick={() =>
                          setFiles((old) => {
                            const next = [...old];
                            [next[index], next[index + 1]] = [
                              next[index + 1],
                              next[index],
                            ];
                            return next;
                          })
                        }
                      >
                        ↓
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <label>
                Filename pattern
                <input
                  value={pattern}
                  maxLength={100}
                  onChange={(e) => setPattern(e.target.value)}
                />
                <small>
                  Use {"{label}"}, {"{date}"} and {"{seq}"}. Sequence is
                  required; the original extension is preserved.
                </small>
              </label>
              <div className="mk-form-grid">
                <label>
                  Event / project label
                  <input
                    maxLength={60}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </label>
                <label>
                  Date in filenames
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
              </div>
              {id === "map-rename" && (
                <>
                  <label className="mk-checkbox">
                    <input
                      type="checkbox"
                      checked={folders}
                      onChange={(e) => setFolders(e.target.checked)}
                    />
                    Preserve input folder structure
                  </label>
                  <label>
                    Optional filename mapping CSV
                    <textarea
                      value={mapping}
                      maxLength={30000}
                      onChange={(e) => setMapping(e.target.value)}
                      placeholder={
                        "oldName,newName\ncamera/IMG_1042.png,selected/hero.png"
                      }
                    />
                  </label>
                  <label className="mk-text">
                    <Upload size={13} />
                    Import mapping CSV
                    <input
                      type="file"
                      className="mk-sr"
                      accept=".csv"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          if (f.size > 30000) {
                            setError("Mapping CSV must be smaller than 30 KB.");
                            return;
                          }
                          setMapping(await f.text());
                        }
                      }}
                    />
                  </label>
                </>
              )}
              <div className="mk-action-row">
                <button
                  className="mk-btn"
                  disabled={busy || (!sample && !files.length)}
                  onClick={() => void run()}
                >
                  {busy ? <Spin /> : <Play size={15} />}Run{" "}
                  {sample ? "sample" : "selected images"}
                </button>
                <button className="mk-text" onClick={() => void savePreset()}>
                  <Plus size={14} />
                  Save naming preset{!tool.owned && <LockKeyhole size={12} />}
                </button>
              </div>
              {presets.length > 0 && (
                <div className="mk-preset-list">
                  <span>Saved presets</span>
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setLabel(p.label);
                        setPattern(p.pattern || "{label}_{date}_{seq}");
                        setDate(p.date);
                        setFolders(p.preserveFolders);
                      }}
                    >
                      {p.name}
                      <ArrowUpRight size={12} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mk-panel">
              <div className="mk-panel-title">
                <span className="mk-number">01</span>
                <h2>A place for your next workshop.</h2>
              </div>
              <p>
                Try the capacity rule, then create a persistent booking page
                with your access package.
              </p>
              <button
                className="mk-btn outline"
                disabled={busy}
                onClick={() => void run()}
              >
                <Play size={14} />
                Test 4 bookings against 3 places
              </button>
              <div className="mk-divider" />
              <label>
                Workshop / session name
                <input
                  value={boardTitle}
                  maxLength={100}
                  onChange={(e) => setBoardTitle(e.target.value)}
                />
              </label>
              <div className="mk-form-grid">
                <label>
                  Session date and time
                  <input
                    type="datetime-local"
                    value={boardDate}
                    onChange={(e) => setBoardDate(e.target.value)}
                  />
                </label>
                <label>
                  Number of places
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={capacity}
                    onChange={(e) =>
                      setCapacity(
                        Math.max(1, Math.min(500, Number(e.target.value) || 1)),
                      )
                    }
                  />
                </label>
              </div>
              <button
                className="mk-btn"
                disabled={busy}
                onClick={() => void createBoard()}
              >
                <CalendarDays size={16} />
                Create booking page{!tool.owned && <LockKeyhole size={13} />}
              </button>
              {boards.length > 0 && (
                <div className="mk-board-list">
                  {boards.map((b) => (
                    <div key={b.id}>
                      <strong>{b.title}</strong>
                      <p>
                        {b.reserved}/{b.capacity} places reserved ·{" "}
                        {new Date(b.date).toLocaleString()}
                      </p>
                      <div>
                        <a
                          href={`/b/${b.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open booking page
                          <ArrowUpRight size={12} />
                        </a>
                        <button
                          onClick={async () => {
                            try {
                              setAttendees({
                                id: b.id,
                                rows: await api(
                                  `/market/boards/${b.id}/attendees`,
                                ),
                              });
                              await refresh();
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          View attendees
                        </button>
                        <a href={`/api/market/boards/${b.id}/export`}>
                          Export CSV
                          <Download size={12} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {attendees && (
                <div className="mk-attendees">
                  <h3>Private attendee list</h3>
                  {attendees.rows.length ? (
                    attendees.rows.map((a, i) => (
                      <p key={i}>
                        {a.name} · {a.email}
                      </p>
                    ))
                  ) : (
                    <p>No reservations yet.</p>
                  )}
                </div>
              )}
            </div>
          )}
          {result && <TrialResult result={result} />}
          <div className="mk-panel mk-adapt">
            <span className="mk-kicker">
              REQUEST A FEATURE FROM THIS BUILDER
            </span>
            <h2>Need this tool to do something more?</h2>
            <p>
              Show what the tool does today, then explain what should be
              different. Your request starts a private conversation; it does not
              automatically build a feature or collect payment.
            </p>
            {tool.sampleReady && tool.sampleContract === "image-rename-v1" && (
              <div className="mk-request-baseline">
                <button
                  className="mk-btn outline"
                  disabled={busy}
                  onClick={() => void runRequestSample()}
                >
                  <Play size={14} />
                  {requestSample
                    ? "Reproduce current result"
                    : "Run sample for this request"}
                </button>
                <small>
                  Uses supplied PNGs and the naming settings above. Personal
                  uploads are not attached.
                </small>
                {requestSample && (
                  <>
                    {result?.id === requestSample.id ? (
                      <p className="mk-note">
                        Using the sample result shown above. No second run is
                        needed.
                      </p>
                    ) : (
                      <TrialResult result={requestSample} />
                    )}
                    <p className="mk-note">
                      This result and its settings will be attached. The builder
                      can reproduce it before discussing your requested change.
                    </p>
                  </>
                )}
              </div>
            )}
            <label htmlFor="adaptation">What should be different?</label>
            <textarea
              id="adaptation"
              value={request}
              maxLength={1500}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="For example: keep my camera/ and portraits/ folders in the output ZIP."
            />
            <button
              className="mk-text"
              disabled={busy || request.trim().length < 15}
              onClick={() => void adapt()}
            >
              {requestSample
                ? "Send request with this sample"
                : "Send feature request"}
              <ArrowUpRight size={15} />
            </button>
            {tool.reference && (
              <small>
                {session.referenceInboxConfigured
                  ? "Sent to the TaskSlice reference-app owner inbox."
                  : "Reference-app requests are saved and await a connected TaskSlice owner inbox."}
              </small>
            )}
          </div>
        </div>
        <aside className="mk-package">
          <span className="mk-kicker">
            {tool.owned
              ? "YOUR NEXT USEFUL THING"
              : "TRY IT. THEN MAKE IT YOURS."}
          </span>
          <h2>
            {tool.reference || tool.purchasable
              ? money(tool.price)
              : "Preview only"}
          </h2>
          <p>
            {tool.reference || tool.purchasable
              ? "USD · one payment · no auto-renewal"
              : "External website · no TaskSlice checkout"}
          </p>
          <ul>
            <li>
              <Check size={14} />
              30 days from first activation
            </li>
            <li>
              <Check size={14} />
              {tool.family === "booking-pages"
                ? "Up to 20 saved booking boards"
                : `Up to ${tool.paidLimit || "provider-defined"} images per run`}
            </li>
            <li>
              <Check size={14} />
              {tool.family === "booking-pages"
                ? "Private attendee management & CSV export"
                : tool.reference
                  ? "Saved naming presets & ZIP/CSV delivery"
                  : "Protected larger batches & ZIP/CSV delivery"}
            </li>
            <li>
              <Check size={14} />
              Account-bound access
            </li>
          </ul>
          {tool.owned ? (
            <>
              <span className="mk-pass">
                <CheckCircle2 size={15} />
                Active{" "}
                {(tool as any).source === "demo"
                  ? "demo access"
                  : "access package"}
              </span>
              <p>Expires {new Date(tool.expires!).toLocaleDateString()}</p>
              {!application && (
                <button
                  className="mk-btn full"
                  onClick={() =>
                    void launchApplication(tool, nav).catch((e) =>
                      setError(e.message),
                    )
                  }
                >
                  Open application
                  <ArrowUpRight size={16} />
                </button>
              )}
            </>
          ) : tool.reference || tool.purchasable ? (
            <button
              className="mk-btn full"
              onClick={() => {
                if (requireAccount()) setCheckout(true);
              }}
            >
              <LockKeyhole size={15} />
              Get this application
              <ArrowUpRight size={15} />
            </button>
          ) : (
            <span className="mk-note">
              Paid sales require provider and seller integration.
            </span>
          )}
          {session.demo && tool.reference && !tool.owned && (
            <button
              className="mk-text"
              onClick={async () => {
                if (!requireAccount()) return;
                try {
                  await send(`/market/tools/${id}/demo-access`, {});
                  await refresh();
                  setNotice(
                    "Clearly marked demo access activated. No PayPal purchase occurred.",
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Activate demo access
            </button>
          )}
          <small>
            PayPal sandbox only. No real money moves. Reference tools are
            operated by the configured demo seller.
          </small>
          <div className="mk-divider" />
          <span className="mk-kicker">FREE PREVIEW</span>
          <p>
            {tool.reference
              ? `Try ${tool.trialLimit} ${tool.family === "booking-pages" ? "capacity simulation" : "sample images"} before purchase.`
              : "Open the provider’s demonstration."}
          </p>
          <small>
            Input and output files expire after 24 hours. Download any files you
            want to keep.
          </small>
        </aside>
      </div>
      {notice && (
        <p className="mk-notice" role="status">
          {notice}
        </p>
      )}
      {checkout && (
        <MarketCheckout
          tool={tool}
          config={config}
          onClose={() => setCheckout(false)}
          onSuccess={async () => {
            await refresh();
            setCheckout(false);
            setNotice("Access confirmed. Your application is ready.");
          }}
        />
      )}
    </section>
  );
}
function MarketCheckout({
  tool,
  config,
  onClose,
  onSuccess,
}: {
  tool: MarketTool;
  config: Config;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const modalRef = useModal(onClose);
  const [status, setStatus] = useState("Loading PayPal sandbox…"),
    [error, setError] = useState("");
  const target = useRef<HTMLDivElement>(null),
    order = useRef(""),
    key = useRef(crypto.randomUUID());
  useEffect(() => {
    let cancelled = false,
      buttons: any;
    async function setup() {
      try {
        if (!config.paypalClientId)
          throw new Error("PayPal sandbox is not configured.");
        const { loadSDK } = await import("./ToolCheckout");
        await loadSDK(config.paypalClientId);
        if (cancelled) return;
        try {
          const saved = JSON.parse(
            sessionStorage.getItem("mk-order:" + tool.id) || "null",
          );
          if (saved) {
            order.current = saved.order;
            key.current = saved.key;
          }
        } catch {}
        setStatus("");
        buttons = (window as any).paypal.Buttons({
          style: { layout: "vertical", shape: "pill", height: 48 },
          createOrder: async () => {
            const r = await send(`/market/tools/${tool.id}/order`, {
              requestKey: key.current,
            });
            if (r.owned) {
              await onSuccess();
              throw new Error("Already owned.");
            }
            order.current = r.id;
            sessionStorage.setItem(
              "mk-order:" + tool.id,
              JSON.stringify({ order: r.id, key: key.current }),
            );
            return r.providerId;
          },
          onApprove: async () => {
            setStatus("Verifying sandbox payment…");
            try {
              const r = await send(`/orders/${order.current}/capture`, {});
              if (r.status === "paid") {
                sessionStorage.removeItem("mk-order:" + tool.id);
                await onSuccess();
              } else
                setStatus(
                  "Awaiting payment confirmation. Check status before paying again.",
                );
            } catch (e) {
              setError((e as Error).message);
            }
          },
          onCancel: () =>
            setStatus("Checkout cancelled. No access has been granted."),
          onError: () =>
            setError(
              "Checkout could not finish. Check your order status before trying again.",
            ),
        });
        await buttons.render(target.current);
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
  return (
    <div className="mk-overlay">
      <div
        ref={modalRef}
        className="mk-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="buy-title"
      >
        <button
          className="mk-icon close"
          onClick={onClose}
          aria-label="Close checkout"
        >
          <X size={19} />
        </button>
        <span className="mk-kicker">A WORKING SOLUTION, YOURS TO USE</span>
        <h2 id="buy-title">{tool.title}</h2>
        <div className="mk-price">
          {money(tool.price)}
          <small>USD · 30-day access package</small>
        </div>
        <p>
          Starts at first activation after verified payment. No automatic
          renewal. Sold by the configured TaskSlice sandbox seller.
        </p>
        <div ref={target} />
        {status && (
          <p className="mk-note" role="status">
            {status}
          </p>
        )}
        <ErrorBox text={error} />
        <button
          className="mk-text"
          onClick={async () => {
            try {
              if (!order.current) throw new Error("Start checkout first.");
              const r = await api(`/orders/${order.current}`);
              if (r.status === "paid") await onSuccess();
              else setStatus("Order status: " + r.status.replaceAll("_", " "));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <RotateCcw size={14} />
          Check payment status
        </button>
        <small>
          Sandbox only. This does not buy the application’s source code or
          business.
        </small>
      </div>
    </div>
  );
}
function BookingPublic({ boardId }: { boardId: string }) {
  const [board, setBoard] = useState<any>(null),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [error, setError] = useState(""),
    [reserved, setReserved] = useState(false),
    [busy, setBusy] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  useEffect(() => {
    api(`/market/boards/${boardId}`)
      .then(setBoard)
      .catch((e) => setError(e.message));
  }, [boardId]);
  async function reserve(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send(`/market/boards/${boardId}/reserve`, {
        name,
        email,
        requestKey: requestKey.current,
      });
      setReserved(true);
      setBoard(await api(`/market/boards/${boardId}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mk-public-booking">
      <span className="mk-booking-art">
        <CalendarDays size={44} />
      </span>
      <span className="mk-kicker">A LITTLE SPACE FOR SOMETHING GOOD</span>
      <h1>{board?.title || "Workshop booking"}</h1>
      {board && (
        <>
          <p>{new Date(board.date).toLocaleString()}</p>
          <span className="mk-small-pill">
            {Math.max(0, board.capacity - board.reserved)} places remaining
          </span>
        </>
      )}
      <ErrorBox text={error} />
      {reserved ? (
        <div className="mk-booked">
          <CheckCircle2 size={30} />
          <h2>You’re on the list.</h2>
          <p>
            Your reservation is saved. No payment or confirmation email is sent
            by this demonstration.
          </p>
        </div>
      ) : (
        board && (
          <form className="mk-panel" onSubmit={reserve}>
            <label>
              Your name
              <input
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                value={email}
                maxLength={160}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button
              className="mk-btn full"
              disabled={
                busy || !board.available || board.reserved >= board.capacity
              }
            >
              {busy ? (
                <Spin />
              ) : board.available ? (
                "Reserve a place"
              ) : (
                "Bookings are closed"
              )}
              <ArrowRight size={15} />
            </button>
            <small>
              Contact details are visible only to the organiser. This local
              booking page does not charge attendees.
            </small>
          </form>
        )
      )}
    </section>
  );
}
function Builder({
  session,
  requireAccount,
  nav,
}: {
  session: Session;
  requireAccount: () => boolean;
  nav: (s: string) => void;
}) {
  const [drafts, setDrafts] = useState<any[]>([]),
    [requests, setRequests] = useState<any[]>([]),
    [step, setStep] = useState(1),
    [draftId, setDraftId] = useState(""),
    [credential, setCredential] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [manifestText, setManifestText] = useState(""),
    [checks, setChecks] = useState<any>(null),
    [response, setResponse] = useState<Record<string, string>>({}),
    [form, setForm] = useState({
      title: "My useful web application",
      description:
        "A working text application that converts supplied text to uppercase.",
      appUrl: session.referenceOrigin + "/",
      previewUrl: session.referenceOrigin + "/",
      family: "custom" as Family,
      capabilities: ["text-conversion"],
      inputs: ["text/plain"],
      outputs: ["text/plain"],
      sampleContract: null as SampleContract | null,
    });
  const steps = [
    "Register your website",
    "Connect server access",
    "Run your application",
    "Test the integration",
    "Preview your listing",
    "Publish listing",
  ];
  async function refresh() {
    if (!session.account) return;
    const data = await api("/market/builder");
    setDrafts(data.providers);
    setRequests(
      data.requests.filter((r: any) => !JSON.parse(r.body).guidedDemo),
    );
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [session.account?.id]);
  function update(change: Partial<typeof form>) {
    setForm((old) => ({ ...old, ...change }));
    setDirty(true);
    setChecks(null);
  }
  async function save() {
    if (!requireAccount()) return;
    setBusy(true);
    setError("");
    try {
      const data = await send(
        draftId ? `/market/providers/${draftId}/save` : "/market/providers",
        form,
      );
      setDraftId(data.id);
      if (data.credential) setCredential(data.credential);
      setDirty(false);
      setChecks(null);
      setNotice("Draft saved. Keep the provider credential on your server.");
      await refresh();
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    if (!requireAccount() || !draftId) return;
    setBusy(true);
    setError("");
    try {
      const data = await send(`/market/providers/${draftId}/test`, {});
      setChecks(data);
      setNotice(
        data.passed
          ? "Contract checks passed against your running provider. Verified sample operations can join comparisons. Independent paid sales still require seller onboarding."
          : "Some checks failed. Start the reference server with this draft’s credential and the correct TaskSlice URL.",
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    setError("");
    try {
      const data = await send(`/market/providers/${draftId}/publish`, {});
      setNotice(data.message);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const operatedDemo = !!drafts.find((d) => d.id === draftId)?.operatorOwned;
  function openDraft(d: any) {
    setDraftId(d.id);
    setForm({
      ...d.manifest,
      sampleContract: d.manifest.sampleContract || null,
    });
    setChecks(d.checks);
    setCredential("");
    setDirty(false);
    setStep(1);
    setNotice(
      "Draft reopened. A previously issued credential is never returned again.",
    );
  }
  if (!session.account)
    return (
      <section className="mk-builder-intro">
        <span className="mk-kicker">YOU BUILT IT. HELP SOMEONE FIND IT.</span>
        <h1>
          Your website.
          <br />
          Someone’s missing piece.
        </h1>
        <p>
          Connect a working application. Follow a real integration guide. Let
          buyers see what it can do.
        </p>
        <GuidedExample
          accountId={undefined}
          requireAccount={requireAccount}
          nav={nav}
        />
        <div className="mk-builder-principles">
          <div>
            <Code2 size={25} />
            <h3>Bring the application.</h3>
            <p>
              A working website, a clear problem and honest capabilities. No
              arbitrary code upload or hidden hosting promise.
            </p>
          </div>
          <div>
            <ShieldCheck size={25} />
            <h3>Check the connection.</h3>
            <p>
              Test server-side access using a runnable reference app. No Gemini
              calls needed.
            </p>
          </div>
          <div>
            <Play size={25} />
            <h3>Show it working.</h3>
            <p>
              Publish a preview. Paid selling requires the provider contract and
              supported seller onboarding.
            </p>
          </div>
        </div>
        <button className="mk-btn" onClick={requireAccount}>
          Sign in to start building
          <ArrowUpRight size={17} />
        </button>
      </section>
    );
  return (
    <section className="mk-builder">
      <div className="mk-breadcrumb">
        <button onClick={() => nav("/")}>
          <ArrowLeft size={14} />
          Explore solutions
        </button>
        <span>/</span>
        <span>Builder workspace</span>
      </div>
      <div className="mk-section-heading">
        <div>
          <span className="mk-kicker">A REAL WEBSITE. A CLEAR WAY IN.</span>
          <h1>Bring your useful thing.</h1>
          <p>Register it, connect it, test it. We’ll walk you through.</p>
        </div>
        <a className="mk-text" href="/provider-guide.md" target="_blank">
          Open full integration guide
          <BookOpen size={15} />
        </a>
      </div>
      <GuidedExample
        accountId={session.account.id}
        requireAccount={requireAccount}
        nav={nav}
      />
      <p className="mk-kicker">CONNECT YOUR OWN APPLICATION</p>
      <ErrorBox text={error} />
      <div className="mk-builder-layout">
        <aside className="mk-tutorial-nav">
          {steps.map((s, i) => (
            <button
              className={step === i + 1 ? "selected" : ""}
              key={s}
              onClick={() => setStep(i + 1)}
            >
              <span>{i + 1}</span>
              <strong>{s}</strong>
            </button>
          ))}
          <div className="mk-builder-drafts">
            <span className="mk-kicker">YOUR PROVIDER DRAFTS</span>
            {drafts.length ? (
              drafts.map((d) => (
                <button key={d.id} onClick={() => openDraft(d)}>
                  {d.title}
                  <small>
                    {d.published ? "Published preview" : "Private draft"} ·{" "}
                    {d.checked ? "checks current" : "not checked"}
                  </small>
                </button>
              ))
            ) : (
              <p>Your first draft starts here.</p>
            )}
          </div>
        </aside>
        <div className="mk-panel mk-tutorial-panel">
          <span className="mk-kicker">STEP {step} OF 6</span>
          <h2>{steps[step - 1]}</h2>
          {step === 1 ? (
            <>
              <p>
                Connect a website that already works. The example fields below
                point to the runnable local reference app.
              </p>
              <details className="mk-manifest-import">
                <summary>Connect BatchStudio using its manifest</summary>
                <p>
                  Deploy the separate BatchStudio service, open its Provider
                  integration example, copy the application manifest, and paste
                  it here. This fills the declaration; checks still have to
                  pass.
                </p>
                <textarea
                  aria-label="Application manifest JSON"
                  value={manifestText}
                  maxLength={15000}
                  onChange={(e) => setManifestText(e.target.value)}
                  placeholder="Paste the JSON from BatchStudio"
                />
                <button
                  className="mk-btn outline"
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(manifestText);
                      if (
                        !parsed ||
                        !["title", "description", "appUrl", "previewUrl"].every(
                          (key) => typeof parsed[key] === "string",
                        ) ||
                        ![
                          "batch-file-renaming",
                          "booking-pages",
                          "custom",
                        ].includes(parsed.family) ||
                        !["capabilities", "inputs", "outputs"].every(
                          (key) =>
                            Array.isArray(parsed[key]) &&
                            parsed[key].every(
                              (value: unknown) => typeof value === "string",
                            ),
                        ) ||
                        (parsed.sampleContract &&
                          !Object.keys(sampleContracts).includes(
                            parsed.sampleContract,
                          ))
                      )
                        throw new Error("Invalid manifest");
                      setError("");
                      update({
                        title: parsed.title,
                        description: parsed.description,
                        appUrl: parsed.appUrl,
                        previewUrl: parsed.previewUrl,
                        family: parsed.family,
                        capabilities: parsed.capabilities,
                        inputs: parsed.inputs,
                        outputs: parsed.outputs,
                        sampleContract: parsed.sampleContract || null,
                      });
                      setNotice(
                        "Manifest loaded. Review the declaration, then save the draft.",
                      );
                    } catch {
                      setError(
                        "Paste a valid application manifest JSON object.",
                      );
                    }
                  }}
                >
                  Use this manifest
                </button>
              </details>
              <label>
                Application name
                <input
                  value={form.title}
                  maxLength={70}
                  onChange={(e) => update({ title: e.target.value })}
                />
              </label>
              <label>
                What problem does it solve?
                <textarea
                  value={form.description}
                  maxLength={1000}
                  onChange={(e) => update({ description: e.target.value })}
                />
              </label>
              <div className="mk-form-grid">
                <label>
                  Application URL
                  <input
                    type="url"
                    value={form.appUrl}
                    onChange={(e) => update({ appUrl: e.target.value })}
                  />
                </label>
                <label>
                  Free preview URL
                  <input
                    type="url"
                    value={form.previewUrl}
                    onChange={(e) => update({ previewUrl: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Task family
                <select
                  value={form.family}
                  onChange={(e) => update({ family: e.target.value as Family })}
                >
                  <option value="custom">Other / custom application</option>
                  <option value="batch-file-renaming">
                    Batch image renaming
                  </option>
                  <option value="booking-pages">Booking pages</option>
                </select>
              </label>
              <label>
                Capabilities · comma separated
                <input
                  value={form.capabilities.join(", ")}
                  onChange={(e) =>
                    update({
                      capabilities: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <div className="mk-form-grid">
                <label>
                  Input types · comma separated
                  <input
                    value={form.inputs.join(", ")}
                    onChange={(e) =>
                      update({
                        inputs: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <label>
                  Output types · comma separated
                  <input
                    value={form.outputs.join(", ")}
                    onChange={(e) =>
                      update({
                        outputs: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Compatible sample operation
                <select
                  value={form.sampleContract || ""}
                  onChange={(e) => {
                    const key = e.target.value as SampleContract;
                    const contract = sampleContracts[key];
                    update(
                      contract
                        ? {
                            sampleContract: key,
                            family: contract.family,
                            inputs: [...contract.inputs],
                            outputs: [...contract.outputs],
                          }
                        : { sampleContract: null },
                    );
                  }}
                >
                  <option value="">
                    No shared sample contract (preview only)
                  </option>
                  {Object.entries(sampleContracts).map(([key, contract]) => (
                    <option key={key} value={key}>
                      {contract.title} · v1
                    </option>
                  ))}
                </select>
                <small>
                  Providers automatically join comparisons after the declared
                  operation passes connection checks. A category alone is not
                  enough.
                </small>
              </label>
              <button
                className="mk-btn"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy ? <Spin /> : <Plus size={15} />}Save provider draft
                <ArrowRight size={15} />
              </button>
            </>
          ) : step === 2 ? (
            <>
              <p>
                Your provider credential belongs on your server. A browser
                redirect or an “owned” field is never proof of purchase.
              </p>
              <div className="mk-protocol-diagram">
                <span>Buyer’s browser</span>
                <ArrowRight size={15} />
                <span>Your server</span>
                <ArrowRight size={15} />
                <span>TaskSlice access check</span>
              </div>
              {draftId && (
                <div className="mk-note">
                  <strong>Provider ID</strong>
                  <p>
                    <code>{draftId}</code>
                  </p>
                  <small>
                    Use this ID in BatchStudio’s TASKSLICE_PROVIDER_ID
                    environment variable. Only the site operator can enable the
                    self-operated sandbox seller demo.
                  </small>
                </div>
              )}
              {credential ? (
                <div className="mk-secret">
                  <label>
                    Provider credential · shown once
                    <input type="password" readOnly value={credential} />
                  </label>
                  <button
                    className="mk-text"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(credential)
                        .then(() =>
                          setNotice(
                            "Credential copied. Keep it on your provider server.",
                          ),
                        )
                        .catch(() =>
                          setError(
                            "Select the credential field and copy it manually.",
                          ),
                        )
                    }
                  >
                    <Copy size={14} />
                    Copy private credential
                  </button>
                </div>
              ) : (
                <p className="mk-note">
                  {draftId
                    ? "This draft’s credential was issued when it was created. Use your saved private copy."
                    : "Save a draft in step 1 to receive a private provider credential."}
                </p>
              )}
              <ul className="mk-guide-list">
                <li>
                  Keep provider credentials and PayPal secrets out of browser
                  code.
                </li>
                <li>
                  Check active access on the server before every protected
                  operation.
                </li>
                <li>Reject wrong-tool, expired and revoked access.</li>
              </ul>
              <button className="mk-btn outline" onClick={() => setStep(3)}>
                Show me how to run it
                <ArrowRight size={15} />
              </button>
            </>
          ) : step === 3 ? (
            <>
              {form.sampleContract === "image-rename-v1" ? (
                <>
                  <p>
                    BatchStudio is a complete, separately hosted example. For
                    Render, create a second Node web service from this
                    repository, build with npm ci --include=dev and start with
                    npm run start:batchstudio. Set TASKSLICE_URL to this
                    marketplace, and add your private TASKSLICE_PROVIDER_KEY and
                    TASKSLICE_PROVIDER_ID on that service.
                  </p>
                  <p>
                    For local development from the TaskSlice project folder:
                  </p>
                  <pre>{`export TASKSLICE_URL="${location.origin}"\nexport TASKSLICE_PROVIDER_KEY="YOUR_PRIVATE_PROVIDER_KEY"\nexport TASKSLICE_PROVIDER_ID="${draftId || "YOUR_PROVIDER_ID"}"\nPORT=4419 npm run start:batchstudio`}</pre>
                  <p>
                    The local example runs at http://127.0.0.1:4419. On Render,
                    use its actual HTTPS URL in your declaration. The site
                    operator must approve that exact origin before integration
                    tests can run. Open the provider website and try three
                    images before continuing.
                  </p>
                  <a
                    className="mk-text"
                    href={form.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open your application preview <ExternalLink size={12} />
                  </a>
                </>
              ) : (
                <>
                  <p>
                    Your own application should run on its hosting service
                    before testing. To learn the access protocol locally, start
                    the minimal text example from the TaskSlice project folder
                    with your private credential.
                  </p>
                  <pre>{`export TASKSLICE_URL="${location.origin}"\nexport TASKSLICE_PROVIDER_KEY="YOUR_PRIVATE_PROVIDER_KEY"\nnode examples/provider-reference.mjs`}</pre>
                  <p>
                    The minimal example runs at{" "}
                    <a
                      href={session.referenceOrigin}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {session.referenceOrigin} <ExternalLink size={12} />
                    </a>
                    . It has a free uppercase-text preview and a protected
                    operation. It does not implement image or booking sample
                    contracts.
                  </p>
                </>
              )}
              <pre>{`// Provider server: check access, then execute.\nconst response = await fetch(\n  TASKSLICE_URL + '/api/market/provider/verify', {\n    method: 'POST',\n    headers: {\n      Authorization: 'Bearer ' + SERVER_ONLY_KEY,\n      'Content-Type': 'application/json'\n    },\n    body: JSON.stringify({ token, operation })\n  }\n);\nif (!response.ok) return denyAccess();`}</pre>
              <small>
                Keep this access check on your application server. The runnable
                examples are in examples/batchstudio and
                examples/provider-reference.mjs. Independent seller payouts are
                not enabled.
              </small>
              <button className="mk-btn outline" onClick={() => setStep(4)}>
                My application is running
                <ArrowRight size={15} />
              </button>
            </>
          ) : step === 4 ? (
            <>
              <p>
                These checks call your running reference provider and its real
                server-side access check. They use isolated test entitlements,
                never Gemini or a PayPal purchase. An image sample contract
                checks the actual returned image ZIP.
              </p>
              <div className="mk-note">
                The site operator must approve the exact provider origin in
                PROVIDER_ALLOWED_ORIGINS. Only approved origins are called;
                redirects and oversized results are rejected.
              </div>
              <button
                className="mk-btn"
                disabled={busy || !draftId || dirty}
                onClick={() => void test()}
              >
                {busy ? <Spin /> : <ShieldCheck size={16} />}Run integration
                checks
              </button>
              {dirty && (
                <p className="mk-note">
                  Save your changed manifest in step 1 first.
                </p>
              )}
              {checks && (
                <div className="mk-contract-results">
                  <h3>
                    {checks.passed
                      ? "The connection checks passed."
                      : "Something needs another look."}
                  </h3>
                  <small>
                    Tested {new Date(checks.testedAt).toLocaleString()} ·
                    manifest v{checks.manifestVersion}
                  </small>
                  {checks.checks.map((c: any) => (
                    <div key={c.name}>
                      <span>
                        {c.passed ? (
                          <CheckCircle2 size={15} />
                        ) : (
                          <X size={15} />
                        )}
                      </span>
                      <strong>{c.name.replaceAll("-", " ")}</strong>
                      <span>
                        {c.expected} → {c.actual}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : step === 5 ? (
            <>
              <p>
                This is the information buyers will see. Accurate limits matter
                more than broad claims.
              </p>
              <div className="mk-listing-preview">
                <span className="mk-kicker">INDEPENDENT WEBSITE</span>
                <h3>{form.title}</h3>
                <p>{form.description}</p>
                <div className="mk-cap-tags">
                  {form.capabilities.map((c) => (
                    <span key={c}>{c.replaceAll("-", " ")}</span>
                  ))}
                </div>
                <p>
                  Input: {form.inputs.join(", ")}
                  <br />
                  Output: {form.outputs.join(", ")}
                </p>
                <a
                  href={form.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Try provider preview
                  <ArrowUpRight size={14} />
                </a>
                <span className="mk-small-pill">
                  {checks?.passed
                    ? operatedDemo
                      ? "Integration checked · TaskSlice-operated demo"
                      : "Integration checked · seller onboarding pending"
                    : "Preview only"}
                </span>
              </div>
              <p>
                {operatedDemo
                  ? "This is explicitly configured as a TaskSlice-operated sandbox demo. Its $6 access package uses the same configured reference seller after connection checks pass."
                  : "Paid checkout stays disabled for independent providers until supported PayPal seller onboarding is available. Your buyers will not be charged by the demo merchant for your software."}
              </p>
            </>
          ) : (
            <>
              <p>
                Publishing adds your website to this marketplace. It does not
                publish code to the internet or create a seller payment account.
              </p>
              <div className="mk-publish-checks">
                <p>
                  <Check size={15} />
                  Working application URL supplied
                </p>
                <p>
                  {checks?.passed ? (
                    <Check size={15} />
                  ) : (
                    <CircleHelp size={15} />
                  )}
                  Contract checks:{" "}
                  {checks?.passed
                    ? "passed for this configuration"
                    : "not verified"}
                </p>
                <p>
                  <LockKeyhole size={15} />
                  {operatedDemo
                    ? "TaskSlice-operated sandbox demo: $6 / 30 days after verified connection"
                    : "Independent-provider checkout: not enabled"}
                </p>
              </div>
              <button
                className="mk-btn"
                disabled={busy || !draftId || dirty}
                onClick={() => void publish()}
              >
                {busy ? <Spin /> : <ArrowUpRight size={16} />}Publish listing
              </button>
              <small>
                A listing alone cannot enforce payment inside somebody else’s
                website. That boundary stays visible to buyers.
              </small>
            </>
          )}
          {notice && (
            <p className="mk-notice" role="status">
              {notice}
            </p>
          )}
          <div className="mk-tutorial-bottom">
            <button
              className="mk-text"
              disabled={step === 1}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft size={14} />
              Previous
            </button>
            <button
              className="mk-text"
              disabled={step === 6}
              onClick={() => setStep(step + 1)}
            >
              Next step
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
      <section className="mk-builder-requests">
        <h2>Feature request inbox</h2>
        {!requests.length && (
          <p className="mk-note">
            No requests yet. Requests for applications you own appear here with
            their attached examples.
          </p>
        )}
        {session.referenceOwner && (
          <p className="mk-note">
            This account also receives requests for TaskSlice’s reference
            applications.
          </p>
        )}
        {!session.referenceInboxConfigured && (
          <details className="mk-owner-setup">
            <summary>Connect the TaskSlice reference-app inbox</summary>
            <p>
              The site operator can connect this account by setting
              TASKSLICE_REFERENCE_OWNER_ACCOUNT_ID in Render to the account
              reference below. This does not grant you ownership by itself.
            </p>
            <code>{session.account.id}</code>
          </details>
        )}
        {requests.map((r) => {
          const body = JSON.parse(r.body);
          return (
            <div className="mk-panel" key={r.id}>
              <h3>{body.toolTitle}</h3>
              <p>{body.request}</p>
              <SampleAttachment record={r} />
              {r.response && (
                <p className="mk-note">Your response: {r.response}</p>
              )}
              <textarea
                aria-label="Your adaptation response"
                value={response[r.id] || ""}
                onChange={(e) =>
                  setResponse({ ...response, [r.id]: e.target.value })
                }
                placeholder="Scope, price estimate and expected delivery…"
              />
              <button
                className="mk-text"
                disabled={(response[r.id] || "").length < 10}
                onClick={async () => {
                  try {
                    await send(`/market/adaptations/${r.id}/respond`, {
                      response: response[r.id],
                    });
                    await refresh();
                    setNotice("Response saved for the buyer.");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Reply to buyer
                <ArrowUpRight size={14} />
              </button>
            </div>
          );
        })}
      </section>
    </section>
  );
}
function Workspace({
  session,
  requireAccount,
  nav,
  logout,
}: {
  session: Session;
  requireAccount: () => boolean;
  nav: (s: string) => void;
  logout: () => Promise<void>;
}) {
  const [data, setData] = useState<any>(null),
    [requests, setRequests] = useState<any[]>([]),
    [error, setError] = useState(""),
    [tab, setTab] = useState("tools");
  useEffect(() => {
    if (session.account)
      Promise.all([api("/market/library"), api("/market/adaptations")])
        .then(([lib, req]) => {
          setData(lib);
          setRequests(req);
        })
        .catch((e) => setError(e.message));
  }, [session.account?.id]);
  if (!session.account)
    return (
      <section className="mk-empty mk-workspace-empty">
        <UserRound size={35} />
        <h1>Your useful things, together.</h1>
        <p>
          Sign in to return to purchased applications, booking pages and private
          trial outputs.
        </p>
        <button className="mk-btn" onClick={requireAccount}>
          Sign in to your workspace
          <ArrowUpRight size={15} />
        </button>
      </section>
    );
  return (
    <section className="mk-workspace">
      <span className="mk-kicker">A PLACE TO PICK UP WHERE YOU LEFT OFF</span>
      <div className="mk-section-heading">
        <div>
          <h1>A little head start, {session.account.name.split(" ")[0]}.</h1>
          <p>Applications, projects and the next thing you’re making.</p>
        </div>
        <button className="mk-text" onClick={() => void logout()}>
          <LogOut size={14} />
          Sign out
        </button>
      </div>
      <div className="mk-workspace-tabs">
        {[
          ["tools", "My applications"],
          ["jobs", "Trial outputs"],
          ["boards", "Booking pages"],
          ["requests", "Feature requests"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "selected" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorBox text={error} />
      {!data ? (
        <div className="mk-loading">
          <Spin />
          Opening your workspace…
        </div>
      ) : tab === "tools" ? (
        data.tools.length ? (
          <div className="mk-owned-grid">
            {data.tools.map((t: MarketTool) => (
              <div className="mk-owned-card" key={t.id}>
                <span className="mk-square-icon">
                  {t.family === "booking-pages" ? (
                    <CalendarDays size={24} />
                  ) : (
                    <Folder size={24} />
                  )}
                </span>
                <h3>{t.title}</h3>
                <p>
                  Active {(t as any).source === "demo" ? "demo " : ""}access ·
                  expires {new Date(t.expires!).toLocaleDateString()}
                </p>
                <button
                  className="mk-btn outline"
                  onClick={() =>
                    void launchApplication(t, nav).catch((e) =>
                      setError(e.message),
                    )
                  }
                >
                  Open application
                  <ArrowUpRight size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyMarket
            title="Your next useful application starts here."
            text="Try a working solution, then purchase an access package to keep using it."
            onClick={() => nav("/")}
            action="Explore solutions"
          />
        )
      ) : tab === "jobs" ? (
        data.jobs.length ? (
          <div className="mk-results-grid">
            {data.jobs.map((r: any) => (
              <TrialResult
                key={r.id}
                result={r}
                onOpen={() => nav(`/tools/${r.toolId}`)}
              />
            ))}
          </div>
        ) : (
          <EmptyMarket
            title="A little proof before you buy."
            text="Run a sample to see actual outputs. Files expire after 24 hours."
            action="Try a sample"
            onClick={() => nav("/")}
          />
        )
      ) : tab === "boards" ? (
        data.boards.length ? (
          <div className="mk-workspace-list">
            {data.boards.map((b: any) => (
              <button key={b.id} onClick={() => nav("/apps/booking-board")}>
                <CalendarDays size={23} />
                <span>
                  <strong>{b.title}</strong>
                  <small>
                    {b.reserved}/{b.capacity} reserved ·{" "}
                    {new Date(b.date).toLocaleString()}
                  </small>
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyMarket
            title="Make room for your next workshop."
            text="Booking Board creates persistent pages with real capacity checks."
            action="Explore Booking Board"
            onClick={() => nav("/tools/booking-board")}
          />
        )
      ) : requests.length ? (
        <div className="mk-request-list">
          {requests.map((r) => {
            const body = JSON.parse(r.body);
            return (
              <div className="mk-panel" key={r.id}>
                <span className="mk-small-pill">{r.status}</span>
                <h3>{body.toolTitle}</h3>
                <p>{body.request}</p>
                {body.guidedDemo && (
                  <span className="mk-small-pill">
                    Guided practice · both roles are yours
                  </span>
                )}
                <SampleAttachment record={r} />
                {r.response ? (
                  <div className="mk-note">Builder response: {r.response}</div>
                ) : (
                  <small>
                    {r.provider?.startsWith("reference:") &&
                    !session.referenceInboxConfigured
                      ? "Saved; the TaskSlice owner inbox is awaiting setup."
                      : "Waiting for the builder’s response."}
                  </small>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyMarket
          title="Your feature requests appear here."
          text="Open a tool, run a sample, and tell its builder what should be different. The saved request and reply stay together here."
          action="Find a tool to try"
          onClick={() => nav("/")}
        />
      )}
      <div className="mk-workspace-foot">
        <LockKeyhole size={13} />
        Your account owns these records. Sign in again after clearing browser
        cookies.
      </div>
    </section>
  );
}
function EmptyMarket({
  title,
  text,
  action,
  onClick,
}: {
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="mk-empty">
      <Layers size={30} />
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="mk-btn" onClick={onClick}>
        {action}
        <ArrowUpRight size={15} />
      </button>
    </div>
  );
}
