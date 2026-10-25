import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { motion, MotionConfig, useReducedMotion } from "motion/react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Scissors,
  Package,
  Check,
  Plus,
  Minus,
  X,
  RotateCcw,
  Layers,
  Maximize2,
  Sparkles,
  ShoppingBag,
  MapPin,
  Clock,
  Leaf,
  ChevronDown,
  LoaderCircle,
  LogOut,
  Upload,
  CheckCircle2,
  BookOpen,
} from "lucide-react";
import { api, getConfig, send, setCSRF } from "../api";
import {
  buildKit,
  defaultConfig,
  templates,
  money,
  type Kit,
  type KitConfig,
  type Material,
  type TemplateId,
} from "./model";
import type { Config } from "../shared/types";
import "./style.css";
import "./studio-theme.css";
import { Art, CutDiagram } from "./ProjectArt";
const KitViewer = lazy(() => import("./KitViewer"));
const Loader = () => <LoaderCircle size={17} className="sd-spin" />;
type Shop = {
  inventory: Material[];
  pickupSlots: { id: string; label: string; available: number }[];
  operator: boolean;
  operatorConfigured: boolean;
  accountId: string | null;
  demo: boolean;
  paypalReady: boolean;
  ai: {
    mode: string;
    available: boolean;
    budget: number;
    liveRequests: number;
  };
  pickup: string;
  hours: string;
};
type Account = { id: string; name: string; email: string };
function Auth({
  close,
  done,
}: {
  close: () => void;
  done: () => Promise<void>;
}) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    box.current?.querySelector<HTMLInputElement>("input")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const list = Array.from(
          box.current?.querySelectorAll<HTMLElement>("button,input") || [],
        );
        if (e.shiftKey && document.activeElement === list[0]) {
          e.preventDefault();
          list.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
          e.preventDefault();
          list[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div className="sd-overlay">
      <div
        ref={box}
        className="sd-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sd-auth-title"
      >
        <button
          className="sd-icon sd-close"
          onClick={close}
          aria-label="Close sign in"
        >
          <X />
        </button>
        <span className="sd-kicker">A LITTLE SPACE FOR YOUR NEXT PROJECT</span>
        <h2 id="sd-auth-title">
          {register ? "Make yourself at home." : "Welcome back."}
        </h2>
        <p>Save your kits, purchases and collection details.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const data = new FormData(e.currentTarget);
            try {
              const r = await send(
                "/market/auth/" + (register ? "register" : "login"),
                {
                  email: data.get("email"),
                  password: data.get("password"),
                  ...(register ? { name: data.get("name") } : {}),
                },
              );
              setCSRF(r.csrf);
              await done();
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {register && (
            <label>
              Your name
              <input name="name" required minLength={2} maxLength={60} />
            </label>
          )}
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
            />
          </label>
          <small>
            At least 10 characters. Use a separate ScrapDrop password.
          </small>
          {error && (
            <p className="sd-error" role="alert">
              {error}
            </p>
          )}
          <button className="sd-btn full" disabled={busy}>
            {busy ? <Loader /> : null}
            {register ? "Create account" : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
        <button className="sd-text" onClick={() => setRegister(!register)}>
          {register
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
        <small>Prototype accounts · email recovery is not connected yet.</small>
      </div>
    </div>
  );
}
export default function ScrapDropApp() {
  const [shop, setShop] = useState<Shop | null>(null),
    [account, setAccount] = useState<Account | null>(null),
    [config, setConfig] = useState<Config | null>(null),
    [path, setPath] = useState(location.pathname),
    [auth, setAuth] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<KitConfig | null>(null);
  async function refresh() {
    const [s, m] = await Promise.all([
      api<Shop>("/scrapdrop/shop"),
      api<any>("/market/session"),
    ]);
    setShop(s);
    setAccount(m.account);
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
  function nav(p: string) {
    history.pushState({}, "", p);
    setPath(p);
    setError("");
    window.scrollTo({ top: 0, behavior: "instant" });
    void refresh().catch((e) => setError(e.message));
  }
  const requireAccount = () => {
    if (account) return true;
    setAuth(true);
    return false;
  };
  const hero = useMemo(() => {
    try {
      return shop
        ? buildKit(
            defaultConfig("giftbox", shop.inventory),
            shop.inventory,
            false,
          )
        : null;
    } catch {
      return null;
    }
  }, [shop]);
  function open(c: KitConfig) {
    setSelected(c);
    nav("/studio");
  }
  const orderId = path.startsWith("/orders/") ? path.split("/")[2] : null;
  return (
    <MotionConfig reducedMotion="user">
      <div className="sd-app">
        <header className="sd-header">
          <button
            className="sd-brand"
            onClick={() => nav("/")}
            aria-label="ScrapDrop home"
          >
            <span className="sd-brand-mark">
              <Scissors size={22} />
            </span>
            scrapdrop<span className="sd-brand-dot">.</span>
          </button>
          <nav aria-label="Main navigation">
            <button
              className={path === "/" || path === "/studio" ? "active" : ""}
              onClick={() => nav("/")}
            >
              Make something
            </button>
            <button
              className={path.startsWith("/orders") ? "active" : ""}
              onClick={() => {
                if (requireAccount()) nav("/orders");
              }}
            >
              My kits
            </button>
            <button
              className={path === "/shop" ? "active" : ""}
              onClick={() => {
                if (requireAccount()) nav("/shop");
              }}
            >
              Shop workspace
            </button>
          </nav>
          <div className="sd-account">
            {account ? (
              <>
                <span>{account.name.split(" ")[0]}</span>
                <button
                  aria-label="Sign out"
                  className="sd-icon"
                  onClick={async () => {
                    try {
                      const r = await send("/market/auth/logout", {});
                      setCSRF(r.csrf);
                      setAccount(null);
                      nav("/");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <button
                className="sd-btn small outline"
                onClick={() => setAuth(true)}
              >
                Sign in
                <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        </header>
        {error && (
          <div className="sd-top-error" role="alert">
            {error}
            <button
              className="sd-icon"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!shop || !config ? (
          <main className="sd-loading">
            <Loader />
            <p>
              {error
                ? "Unable to connect. Refresh to try again."
                : "Gathering a few good possibilities…"}
            </p>
          </main>
        ) : path === "/studio" ? (
          <Studio
            shop={shop}
            initial={selected || defaultConfig("giftbox", shop.inventory)}
            config={config}
            requireAccount={requireAccount}
            openOrder={(id) => nav("/orders/" + id)}
            back={() => nav("/")}
            refresh={refresh}
          />
        ) : orderId ? (
          <OrderPage
            id={orderId}
            shop={shop}
            back={() => nav("/orders")}
            config={config}
          />
        ) : path === "/orders" ? (
          <Orders
            onOpen={(id) => nav("/orders/" + id)}
            onMake={() => nav("/")}
          />
        ) : path === "/shop" ? (
          <ShopWorkspace shop={shop} refresh={refresh} />
        ) : (
          <>
            <main>
              <section className="sd-hero">
                <div className="sd-hero-copy">
                  <span className="sd-kicker">
                    <span className="sd-asterisk">✳</span> GOOD THINGS DESERVE
                    ANOTHER BEGINNING.
                  </span>
                  <h1>
                    Small scraps.
                    <br />
                    <em>Big possibilities.</em>
                  </h1>
                  <p>
                    Turn the studio’s leftover materials into your next lovely
                    thing. Choose a project, make it yours in 3D, and collect a
                    kit with every piece.
                  </p>
                  <div className="sd-hero-actions">
                    <button
                      className="sd-btn"
                      onClick={() =>
                        document.getElementById("make-a-kit")?.scrollIntoView({
                          behavior: matchMedia(
                            "(prefers-reduced-motion:reduce)",
                          ).matches
                            ? "auto"
                            : "smooth",
                        })
                      }
                    >
                      Find my next project
                      <ArrowRight size={18} />
                    </button>
                    <span>
                      <Leaf size={15} />
                      Small pieces. Real possibilities.
                    </span>
                  </div>
                  <div className="sd-hero-foot">
                    <span>01 Tell us your idea</span>
                    <i />
                    <span>02 Make it yours in 3D</span>
                    <i />
                    <span>03 Pick up your kit</span>
                  </div>
                </div>
                {hero ? (
                  <HeroProject kit={hero} onOpen={() => open(hero.config)} />
                ) : (
                  <div className="sd-hero-stage sd-stage-loading">
                    <Package size={90} />
                    <p>More materials are on their way.</p>
                  </div>
                )}
              </section>
              <section className="sd-intro-row">
                <span className="sd-kicker">
                  A GOOD IDEA STARTS WITH WHAT'S HERE.
                </span>
                <p>
                  Actual materials. A project that fits.
                  <br />A finished result you can explore before buying.
                </p>
                <span className="sd-sample">Sample shop · PayPal sandbox</span>
              </section>
              <Brief shop={shop} onOpen={open} />
              <section className="sd-stock-strip">
                <div>
                  <span className="sd-kicker">
                    THE SMALL PIECES BEHIND THE POSSIBILITIES
                  </span>
                  <h2>A shelf full of second chances.</h2>
                  <p>Each color is a real choice in this sample inventory.</p>
                </div>
                <div className="sd-material-shelf">
                  {shop.inventory
                    .filter((m) => m.active && m.confirmed)
                    .map((m) => (
                      <div className="sd-stock-mini" key={m.id}>
                        <div
                          className={"sd-scrap " + m.type}
                          style={{ backgroundColor: m.color }}
                        />
                        <strong>{m.shade}</strong>
                        <small>
                          {m.available}{" "}
                          {m.type === "ribbon" ? "segments" : "pieces"}{" "}
                          available
                        </small>
                      </div>
                    ))}
                </div>
              </section>
              <section className="sd-how">
                <span className="sd-kicker">
                  FROM LEFTOVER TO LOOK-WHAT-I-MADE.
                </span>
                <div>
                  <article>
                    <span>01</span>
                    <h3>A little inspiration.</h3>
                    <p>
                      Tell us what you want to make. We match the idea to
                      materials actually on the shelf.
                    </p>
                  </article>
                  <article>
                    <span>02</span>
                    <h3>Your own finishing touch.</h3>
                    <p>
                      Turn it around in 3D. Pick a shade. See every piece that
                      goes into your project.
                    </p>
                  </article>
                  <article>
                    <span>03</span>
                    <h3>Make a good thing happen.</h3>
                    <p>
                      Buy the exact kit, collect it from the studio, and follow
                      your personal assembly guide.
                    </p>
                  </article>
                </div>
              </section>
            </main>
          </>
        )}
        <footer className="sd-footer">
          <button className="sd-brand" onClick={() => nav("/")}>
            <Scissors size={20} />
            scrapdrop.
          </button>
          <span>Less left behind. More made by you.</span>
          <small>
            Sandbox prototype · Original sample stock ·{" "}
            {shop?.ai.mode === "fixture"
              ? "AI examples use local fixtures"
              : "AI runs only on request"}
          </small>
        </footer>
        {auth && <Auth close={() => setAuth(false)} done={refresh} />}
      </div>
    </MotionConfig>
  );
}
function HeroProject({ kit, onOpen }: { kit: Kit; onOpen: () => void }) {
  const [play, setPlay] = useState(0),
    [exploded, setExploded] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    setExploded(true);
    const timer = setTimeout(() => setExploded(false), 1900);
    return () => clearTimeout(timer);
  }, [play, reduced]);
  return (
    <div className="sd-hero-stage">
      <div className="sd-stage-orbit" aria-hidden="true" />
      <span className="sd-stage-label">THE SCRAP → THE POSSIBILITY</span>
      <span className="sd-maker-seal" aria-hidden="true">
        a little
        <br />
        <b>RE-MADE</b>
        <br />
        by you ✳
      </span>
      <div className="sd-material-ticket">
        <span className="sd-ticket-pieces" aria-hidden="true">
          <i style={{ backgroundColor: kit.materials[0].color }} />
          <i style={{ backgroundColor: kit.materials[1].color }} />
        </span>
        <span>
          {kit.materials[0].shade} card
          <br />
          <b>+ {kit.materials[1].shade.toLowerCase()} ribbon</b>
        </span>
        <ArrowRight size={18} />
      </div>
      <Suspense
        fallback={
          <div className="sd-stage-loading">
            <Loader />
          </div>
        }
      >
        <KitViewer kit={kit} exploded={exploded} presentation />
      </Suspense>
      <button
        className="sd-transform-play"
        onClick={() =>
          reduced ? setExploded((v) => !v) : setPlay((n) => n + 1)
        }
        aria-label={
          reduced
            ? exploded
              ? "Show the finished gift box"
              : "Inspect the separate pieces"
            : "Replay scraps assembling into the gift box"
        }
      >
        <RotateCcw size={13} />
        {reduced
          ? exploded
            ? "Show finished box"
            : "Inspect the pieces"
          : "See it come together"}
      </button>
      <div className="sd-hero-project">
        <div>
          <small>FROM TWO MATERIALS TO…</small>
          <strong>{kit.template.title}</strong>
          <span>Make it yours · {money(kit.total)}</span>
        </div>
        <button
          className="sd-round"
          onClick={onOpen}
          aria-label="Customize the gift box"
        >
          <ArrowUpRight />
        </button>
      </div>
      <span className="sd-stage-footnote">
        Interactive design illustration · drag to explore
      </span>
    </div>
  );
}

function Brief({
  shop,
  onOpen,
}: {
  shop: Shop;
  onOpen: (c: KitConfig) => void;
}) {
  const [text, setText] = useState(
      "A thoughtful little birthday gift I can make in an afternoon.",
    ),
    [budget, setBudget] = useState(12),
    [minutes, setMinutes] = useState(30),
    [tools, setTools] = useState(["scissors", "ruler", "glue", "hole punch"]),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<any>(null),
    [error, setError] = useState("");
  const examples = useMemo(
    () =>
      templates
        .map((t) => {
          try {
            return buildKit(
              defaultConfig(t.id, shop.inventory),
              shop.inventory,
            );
          } catch {
            return null;
          }
        })
        .filter(Boolean) as Kit[],
    [shop.inventory],
  );
  return (
    <section className="sd-discover" id="make-a-kit">
      <div className="sd-section-heading">
        <div>
          <span className="sd-kicker">START WITH A LITTLE IDEA</span>
          <h2>What would you like to make?</h2>
        </div>
        <span className="sd-handwritten">Something you, perhaps. ↙</span>
      </div>
      <div className="sd-brief">
        <label className="sd-brief-label" htmlFor="sd-brief">
          Your next project
        </label>
        <textarea
          id="sd-brief"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
        />
        <div className="sd-brief-controls">
          <label>
            My budget
            <select
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            >
              {[5, 8, 12, 20, 30].map((v) => (
                <option key={v} value={v}>
                  Up to ${v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hands-on time
            <select
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {[15, 20, 30, 60].map((v) => (
                <option key={v} value={v}>
                  {v} minutes
                </option>
              ))}
            </select>
          </label>
          <details>
            <summary>
              Tools I already have
              <ChevronDown size={14} />
            </summary>
            <div className="sd-tool-options">
              {["scissors", "ruler", "glue", "hole punch"].map((t) => (
                <label key={t}>
                  <input
                    type="checkbox"
                    checked={tools.includes(t)}
                    onChange={(e) =>
                      setTools(
                        e.target.checked
                          ? [...tools, t]
                          : tools.filter((v) => v !== t),
                      )
                    }
                  />
                  {t}
                </label>
              ))}
            </div>
          </details>
          <button
            className="sd-btn"
            disabled={busy || text.trim().length < 5}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setResult(
                  await send("/scrapdrop/ideas", {
                    text,
                    budget: budget * 100,
                    minutes,
                    quantity: 1,
                    tools,
                  }),
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader /> : <Sparkles size={17} />}Find my possibilities
            <ArrowRight size={17} />
          </button>
        </div>
        <small>
          {shop.ai.mode === "fixture"
            ? "Local example matching · no Gemini request. Choose a project below, or try a different brief."
            : "AI interprets your brief only when you choose Find my possibilities. Material fit and price are checked by code."}
        </small>
      </div>
      {error && (
        <p className="sd-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <p className="sd-result-message" role="status">
          {result.source === "ai"
            ? "Gemini interpretation"
            : result.source === "fixture"
              ? "Local example interpretation"
              : "Manual interpretation"}{" "}
          · {result.explanation}
        </p>
      )}
      <div className="sd-project-grid">
        {(result ? result.kits : examples).map((kit: Kit, i: number) => (
          <motion.article
            className="sd-project-card"
            key={kit.template.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <button
              className={"sd-card-art " + kit.template.id}
              onClick={() => onOpen(kit.config)}
              aria-label={`Customize ${kit.template.title}`}
            >
              <Art kit={kit} scene />
              <span className="sd-scene-caption" aria-hidden="true">
                {kit.template.id === "giftbox"
                  ? "FOR SOMEONE SPECIAL"
                  : kit.template.id === "wrap"
                    ? "A NEW CHAPTER"
                    : "ONE MORE PAGE"}
              </span>
              <span className="sd-card-badge">
                <Clock size={12} />
                {kit.template.minutes} min hands-on
              </span>
              <span className="sd-card-arrow">
                <ArrowUpRight size={20} />
              </span>
            </button>
            <div className="sd-card-body">
              <span className="sd-kicker">
                {kit.template.type === "fabric"
                  ? "A LITTLE FABRIC, A FRESH START"
                  : "GOOD THINGS FROM SMALL PIECES"}
              </span>
              <button onClick={() => onOpen(kit.config)}>
                <h3>{kit.template.title}</h3>
              </button>
              <p>{kit.template.subtitle}</p>
              <div className="sd-card-bottom">
                <span>
                  <i style={{ background: kit.materials[0].color }} />
                  <i style={{ background: kit.materials[1].color }} />
                  {kit.lines.length} included materials
                </span>
                <strong>{money(kit.total)}</strong>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
      {result && !result.kits.length && (
        <div className="sd-empty">
          <Leaf />
          <h3>A small change could open a possibility.</h3>
          <p>Try increasing your time or budget, or add a tool you have.</p>
          <button className="sd-text" onClick={() => setResult(null)}>
            Browse supported projects
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
function Studio({
  shop,
  initial,
  config,
  requireAccount,
  openOrder,
  back,
  refresh,
}: {
  shop: Shop;
  initial: KitConfig;
  config: Config;
  requireAccount: () => boolean;
  openOrder: (id: string) => void;
  back: () => void;
  refresh: () => Promise<void>;
}) {
  const [pickupSlotId, setPickupSlotId] = useState(
    shop.pickupSlots[0]?.id || "",
  );
  const [value, setValue] = useState(initial),
    [exploded, setExploded] = useState(false),
    [selected, setSelected] = useState(""),
    [assembly, setAssembly] = useState(0),
    [reset, setReset] = useState(0),
    [validated, setValidated] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [quote, setQuote] = useState<any>(null);
  const last = useRef<Kit | null>(null);
  let kit: Kit | null = null,
    localError = "";
  try {
    kit = buildKit(value, shop.inventory, false);
    last.current = kit;
  } catch (e) {
    localError = (e as Error).message;
  }
  const display = kit || last.current;
  useEffect(() => {
    setValidated("");
    setError("");
    const controller = new AbortController(),
      timer = setTimeout(() => {
        api<Kit>("/scrapdrop/configurations/validate", {
          method: "POST",
          body: JSON.stringify(value),
          signal: controller.signal,
        })
          .then(() => setValidated(JSON.stringify(value)))
          .catch((e) => {
            if (e.name !== "AbortError") setError(e.message);
          });
      }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, shop.inventory]);
  function change(p: Partial<KitConfig>) {
    setValidated("");
    setValue((v) => ({ ...v, ...p }));
  }
  if (!display)
    return (
      <main className="sd-empty">
        <Package />
        <h2>These materials are no longer available.</h2>
        <p>Choose another project from the shelf.</p>
        <button className="sd-btn" onClick={back}>
          Back to projects
        </button>
      </main>
    );
  const t = display.template;
  return (
    <main className="sd-studio">
      <div className="sd-breadcrumb">
        <button className="sd-text" onClick={back}>
          <ArrowLeft size={15} />
          All possibilities
        </button>
        <span>
          01 Choose <ArrowRight size={12} />
          <b>02 Make it yours</b>
          <ArrowRight size={12} />
          03 Collect
        </span>
      </div>
      <div className="sd-studio-grid">
        <section className={"sd-studio-stage sd-scene-" + display.template.id}>
          <div className="sd-stage-top">
            <span className="sd-kicker">
              <span className="sd-live-dot" />
              YOUR FINISHED PROJECT
            </span>
            <button
              className="sd-icon"
              aria-label="Reset 3D camera"
              onClick={() => setReset((v) => v + 1)}
            >
              <RotateCcw size={18} />
            </button>
          </div>
          <Suspense
            fallback={
              <div className="sd-stage-loading">
                <Loader />
              </div>
            }
          >
            <KitViewer
              kit={display}
              exploded={exploded}
              selected={selected}
              step={assembly}
              reset={reset}
              onSelect={setSelected}
            />
          </Suspense>
          <div className="sd-stage-toolbar">
            <div className="sd-toggle">
              <button
                className={!exploded ? "selected" : ""}
                onClick={() => {
                  setExploded(false);
                  setAssembly(0);
                }}
              >
                <Package size={15} />
                Assembled
              </button>
              <button
                className={exploded ? "selected" : ""}
                onClick={() => {
                  setExploded(true);
                  setAssembly(0);
                }}
              >
                <Layers size={15} />
                See the parts
              </button>
            </div>
            <span>Drag to rotate · scroll to zoom</span>
          </div>
          <div className="sd-scene-note">
            <span>
              {value.width} × {value.depth} × {display.config.height} mm · final
              design
            </span>
            <small>Design preview · actual texture and shade may vary.</small>
          </div>
        </section>
        <section className="sd-customize">
          <span className="sd-kicker">SMALL PIECES. YOUR FINISHING TOUCH.</span>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
          <div className="sd-project-meta">
            <span>
              <Clock size={14} />
              {t.minutes} min + drying
            </span>
            <span>
              <MapPin size={14} />
              Studio pickup
            </span>
          </div>
          <div className="sd-option">
            <div className="sd-option-heading">
              <strong>
                01 / Pick your {t.type === "card" ? "card" : "fabric"}
              </strong>
              <span>{display.materials[0].shade}</span>
            </div>
            <div className="sd-swatches">
              {shop.inventory
                .filter((m) => m.type === t.type && m.active && m.confirmed)
                .map((m) => (
                  <button
                    key={m.id}
                    className={value.materialId === m.id ? "selected" : ""}
                    aria-pressed={value.materialId === m.id}
                    disabled={m.available < value.quantity}
                    title={`${m.name} · ${m.available} available`}
                    onClick={() => {
                      change({ materialId: m.id });
                      setSelected(m.id);
                    }}
                  >
                    <i style={{ backgroundColor: m.color }}>
                      {value.materialId === m.id && <Check size={20} />}
                    </i>
                    <span>{m.shade}</span>
                    <small>
                      {m.available < value.quantity
                        ? "Unavailable"
                        : `${m.available} left`}
                    </small>
                  </button>
                ))}
            </div>
          </div>
          <div className="sd-option">
            <div className="sd-option-heading">
              <strong>02 / Tie it together</strong>
              <span>{display.materials[1].shade}</span>
            </div>
            <div className="sd-swatches">
              {shop.inventory
                .filter((m) => m.type === "ribbon" && m.active && m.confirmed)
                .map((m) => (
                  <button
                    key={m.id}
                    className={value.ribbonId === m.id ? "selected" : ""}
                    aria-pressed={value.ribbonId === m.id}
                    disabled={m.available < value.quantity}
                    onClick={() => {
                      change({ ribbonId: m.id });
                      setSelected(m.id);
                    }}
                  >
                    <i style={{ backgroundColor: m.color }}>
                      {value.ribbonId === m.id && <Check size={20} />}
                    </i>
                    <span>{m.shade}</span>
                    <small>
                      {m.available < value.quantity
                        ? "Unavailable"
                        : `${m.available} left`}
                    </small>
                  </button>
                ))}
            </div>
          </div>
          <details className="sd-size">
            <summary>
              Make the size yours
              <Maximize2 size={15} />
            </summary>
            {(["width", "depth", "height"] as const).map((key, i) => (
              <label key={key}>
                {t.labels[i]}
                <span>
                  <input
                    type="number"
                    value={
                      t.id === "bookmark" && key === "height"
                        ? display.config.height
                        : value[key]
                    }
                    min={key === "height" ? 1 : 25}
                    max={key === "depth" ? 240 : key === "height" ? 80 : 200}
                    disabled={t.id === "bookmark" && key === "height"}
                    onChange={(e) => change({ [key]: Number(e.target.value) })}
                  />
                  mm
                </span>
              </label>
            ))}
            <small>
              Every change checks the cutting plan against the actual available
              piece.
            </small>
          </details>
          <label className="sd-pickup-select">
            Pick a collection window
            <select
              value={pickupSlotId}
              onChange={(e) => setPickupSlotId(e.target.value)}
            >
              {shop.pickupSlots.map((slot) => (
                <option
                  key={slot.id}
                  value={slot.id}
                  disabled={slot.available < value.quantity}
                >
                  {slot.label} · {slot.available} kit places
                </option>
              ))}
            </select>
            <small>
              Collect within your window after the shop marks the kit ready.
            </small>
          </label>
          <div className="sd-purchase-summary">
            <div>
              <strong>How many kits?</strong>
              <div className="sd-quantity">
                <button
                  className="sd-icon"
                  aria-label="One fewer kit"
                  disabled={value.quantity <= 1}
                  onClick={() => change({ quantity: value.quantity - 1 })}
                >
                  <Minus size={14} />
                </button>
                <span>{value.quantity}</span>
                <button
                  className="sd-icon"
                  aria-label="One more kit"
                  disabled={value.quantity >= 6}
                  onClick={() => change({ quantity: value.quantity + 1 })}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div>
              <span>Included materials</span>
              <span>{money(display.subtotal)}</span>
            </div>
            <div>
              <span>Kit preparation</span>
              <span>{money(display.preparation)}</span>
            </div>
            <div className="sd-total">
              <strong>Your kit total</strong>
              <strong>
                {money(display.total)}
                <small> USD</small>
              </strong>
            </div>
            <small>
              Pickup only · no delivery fee · sandbox total, tax $0.
            </small>
          </div>
          {(localError || error) && (
            <p className="sd-error" role="alert">
              {localError || error}
            </p>
          )}
          <button
            className="sd-btn full"
            disabled={
              busy || !!localError || validated !== JSON.stringify(value)
            }
            onClick={async () => {
              if (!requireAccount()) return;
              setBusy(true);
              setError("");
              try {
                setQuote(
                  await send("/scrapdrop/quotes", { ...value, pickupSlotId }),
                );
              } catch (e) {
                setError((e as Error).message);
                await refresh();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader /> : <ShoppingBag size={17} />}Review this kit
            <ArrowRight size={17} />
          </button>
          <small className="sd-center">
            {validated !== JSON.stringify(value) && !error && !localError
              ? "Checking the current materials…"
              : "Materials are reserved only when you begin payment."}
          </small>
        </section>
      </div>
      <section className="sd-kit-details">
        <div>
          <span className="sd-kicker">NO MYSTERY PIECES</span>
          <h2>What's coming home with you.</h2>
          <p>Tap a material to find it in your project.</p>
          <div className="sd-included">
            {display.materials.map((m, i) => (
              <button
                key={m.id}
                className={selected === m.id ? "selected" : ""}
                onClick={() => setSelected(selected === m.id ? "" : m.id)}
              >
                {m.imageId ? (
                  <img
                    src={"/api/scrapdrop/images/" + m.imageId}
                    alt={m.name}
                  />
                ) : (
                  <div
                    className={"sd-scrap " + m.type}
                    style={{ backgroundColor: m.color }}
                  />
                )}
                <span>
                  <strong>{m.name}</strong>
                  <small>
                    {m.width} × {m.length} mm · {display.lines[i].units} whole{" "}
                    {m.type === "ribbon" ? "segment" : "piece"}
                    {display.lines[i].units > 1 ? "s" : ""}
                  </small>
                  <small>
                    {i === 0
                      ? "Includes the unused portion of your allocated piece."
                      : "No extra ribbon needs to be bought."}
                  </small>
                </span>
                <CheckCircle2 size={19} />
              </button>
            ))}
          </div>
          <p className="sd-own-tools">
            <Scissors size={17} />
            <span>
              <strong>Bring your own:</strong> {t.tools.join(", ")}.
              {t.id === "wrap" ? " Your notebook is not included." : ""}
            </span>
          </p>
        </div>
        <div className="sd-assembly">
          <span className="sd-kicker">PIECE BY PIECE</span>
          <h2>See how it comes together.</h2>
          <div className="sd-assembly-steps">
            {t.guide.map((text, i) => (
              <button
                key={i}
                className={assembly === i + 1 ? "selected" : ""}
                onClick={() => {
                  setAssembly(assembly === i + 1 ? 0 : i + 1);
                  setExploded(false);
                  window.scrollTo({
                    top: 70,
                    behavior: matchMedia("(prefers-reduced-motion:reduce)")
                      .matches
                      ? "auto"
                      : "smooth",
                  });
                }}
              >
                <span>{i + 1}</span>
                <p>{text}</p>
              </button>
            ))}
          </div>
          <details>
            <summary>
              <BookOpen size={15} />
              Measured cutting guide
              <ChevronDown size={14} />
            </summary>
            <CutDiagram kit={display} />
            <small>
              Required rectangle: {display.cut.width} × {display.cut.height} mm.
              Solid lines cut; dashed lines fold. Supplied material may be
              larger.
            </small>
          </details>
        </div>
      </section>
      {quote && (
        <Checkout
          quote={quote}
          config={config}
          demo={shop.demo}
          close={() => setQuote(null)}
          onOrder={openOrder}
        />
      )}
    </main>
  );
}
function useDialog() {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const elements = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),a[href],iframe,select,textarea",
        ) || [],
      ).filter((el) => el.offsetParent !== null);
    elements()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = elements();
      if (e.shiftKey && document.activeElement === list[0]) {
        e.preventDefault();
        list.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
        e.preventDefault();
        list[0]?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return ref;
}
function Checkout({
  quote,
  config,
  demo,
  close,
  onOrder,
}: {
  quote: any;
  config: Config;
  demo: boolean;
  close: () => void;
  onOrder: (id: string) => void;
}) {
  const [ack, setAck] = useState(false);
  const dialog = useDialog();
  const target = useRef<HTMLDivElement>(null),
    key = useRef(crypto.randomUUID()),
    order = useRef(""),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let stopped = false,
      buttons: any;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", escape);
    async function setup() {
      if (!ack) {
        setStatus("Confirm your tools to continue.");
        return;
      }
      setStatus("");
      if (!config.paypalClientId) {
        setStatus("PayPal sandbox is not configured on this preview.");
        return;
      }
      try {
        const { loadSDK } = await import("../ToolCheckout");
        await loadSDK(config.paypalClientId);
        if (stopped) return;
        buttons = (window as any).paypal.Buttons({
          style: { layout: "vertical", shape: "pill", height: 48 },
          createOrder: async () => {
            const o = await send("/scrapdrop/checkout", {
              quoteId: quote.id,
              requestKey: key.current,
              toolsConfirmed: true,
            });
            order.current = o.id;
            if (!o.providerId) {
              onOrder(o.id);
              throw Error("Checking payment setup.");
            }
            return o.providerId;
          },
          onApprove: async () => {
            setStatus("Confirming payment and your exact materials…");
            try {
              await send(`/scrapdrop/orders/${order.current}/capture`, {});
              onOrder(order.current);
            } catch (e) {
              setError((e as Error).message);
            }
          },
          onCancel: () =>
            setStatus(
              "PayPal was closed. No payment has been confirmed. You can check or cancel your reservation.",
            ),
          onError: () =>
            setError(
              "PayPal could not finish. Check the existing order before trying again.",
            ),
        });
        await buttons.render(target.current);
      } catch {
        setError(
          "PayPal could not load. Refresh or check your existing order.",
        );
      }
    }
    void setup();
    return () => {
      stopped = true;
      document.removeEventListener("keydown", escape);
      try {
        buttons?.close();
      } catch {}
    };
  }, [ack]);
  return (
    <div className="sd-overlay">
      <section
        ref={dialog}
        className="sd-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sd-checkout-title"
      >
        <button
          className="sd-icon sd-close"
          aria-label="Close checkout"
          onClick={close}
        >
          <X />
        </button>
        <span className="sd-kicker">EXACTLY WHAT YOU PICKED</span>
        <h2 id="sd-checkout-title">A good thing, nearly yours.</h2>
        <div className="sd-checkout-art">
          <Art kit={quote.kit} />
        </div>
        <h3>
          {quote.kit.template.title} × {quote.kit.config.quantity}
        </h3>
        {quote.kit.lines.map((l: any) => (
          <p className="sd-receipt-line" key={l.itemId}>
            <span>
              {l.units} × {l.name}
            </span>
            <strong>{money(l.total)}</strong>
          </p>
        ))}
        <p className="sd-receipt-line">
          <span>Kit preparation</span>
          <strong>{money(quote.kit.preparation)}</strong>
        </p>
        <p className="sd-total sd-receipt-line">
          <strong>Total · USD</strong>
          <strong>{money(quote.kit.total)}</strong>
        </p>
        <p>
          <MapPin size={14} />
          {quote.kit.fulfillmentTerms?.location || "Studio collection desk"}.
          Collect only after your kit is marked ready.
          <br />
          {quote.kit.fulfillmentTerms?.label}
        </p>
        <p className="sd-own-tools">
          Bring your own {quote.kit.template.tools.join(", ")}.
          {quote.kit.template.id === "wrap" ? " Notebook not included." : ""}
        </p>
        <small>
          Quote valid for 5 minutes. Payment reserves materials for 10 minutes.
          Sandbox only; no real money.
        </small>
        <label className="sd-check" style={{ marginTop: 18 }}>
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          I have the listed tools
          {quote.kit.template.id === "wrap"
            ? " and the matching notebook"
            : ""}{" "}
          and will collect the kit from the studio.
        </label>
        <div ref={target} className="sd-paypal-target" />
        {status && <p role="status">{status}</p>}
        {error && (
          <p role="alert" className="sd-error">
            {error}
          </p>
        )}
        {order.current && (
          <button
            className="sd-btn outline full"
            onClick={() => onOrder(order.current)}
          >
            Check my reservation
            <ArrowRight size={15} />
          </button>
        )}
        {demo && (
          <button
            disabled={busy || !ack}
            className="sd-btn full outline"
            onClick={async () => {
              setBusy(true);
              try {
                const o = await send("/scrapdrop/demo-order", {
                  quoteId: quote.id,
                  requestKey: key.current,
                  toolsConfirmed: true,
                });
                onOrder(o.id);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader /> : null}Use simulated payment · demo only
          </button>
        )}
      </section>
    </div>
  );
}
function Orders({
  onOpen,
  onMake,
}: {
  onOpen: (id: string) => void;
  onMake: () => void;
}) {
  const [orders, setOrders] = useState<any[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<any[]>("/scrapdrop/orders")
      .then(setOrders)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="sd-page">
      <span className="sd-kicker">A LITTLE COLLECTION OF GOOD IDEAS</span>
      <h1>Your kits.</h1>
      <p>Everything you picked, from first idea to ready to make.</p>
      {error && <p className="sd-error">{error}</p>}
      {!orders ? (
        <Loader />
      ) : !orders.length ? (
        <div className="sd-empty">
          <Package size={35} />
          <h2>Your next project starts here.</h2>
          <p>
            When you reserve a kit, you'll find its progress and pickup details
            here.
          </p>
          <button className="sd-btn" onClick={onMake}>
            Find a possibility
            <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div className="sd-orders">
          {orders.map((o) => (
            <button
              className="sd-order-card"
              key={o.id}
              onClick={() => onOpen(o.id)}
            >
              <div>
                <Art kit={o.kit} />
              </div>
              <span>
                <small>
                  {new Date(o.created).toLocaleDateString()} ·{" "}
                  {o.source === "demo" ? "Simulated payment" : "PayPal sandbox"}
                </small>
                <h3>{o.kit.template.title}</h3>
                <p>
                  {o.kit.config.quantity} kit
                  {o.kit.config.quantity > 1 ? "s" : ""} · {statusLabel(o)}
                </p>
              </span>
              <strong>{money(o.kit.total)}</strong>
              <ArrowUpRight size={19} />
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
const statusLabel = (o: any) =>
  o.payment === "paid"
    ? (
        {
          preparing: "Paid · being prepared",
          ready: "Ready to collect",
          collected: "Collected",
          paid_needs_resolution: "Paid · shop needs to resolve stock",
        } as Record<string, string>
      )[o.fulfillment] || o.fulfillment
    : {
        creating: "Setting up payment",
        needs_creation: "Payment setup needs checking",
        awaiting_buyer: "Materials reserved · awaiting payment",
        capture_requested: "Checking payment",
        pending: "Payment pending",
        needs_reconciliation: "Checking payment",
        expired: "Reservation expired",
        canceled: "Reservation canceled",
        refunded: "Refunded",
        partially_refunded: "Partially refunded",
        reversed: "Payment reversed",
        denied: "Payment declined",
      }[o.payment as string] || o.payment;
function OrderPage({
  id,
  shop,
  back,
  config,
}: {
  id: string;
  shop: Shop;
  back: () => void;
  config: Config;
}) {
  const [order, setOrder] = useState<any>(null),
    [error, setError] = useState(""),
    [qr, setQr] = useState(""),
    [busy, setBusy] = useState(false),
    [timer, setTimer] = useState(Date.now()),
    [resume, setResume] = useState(false);
  async function reload() {
    try {
      setOrder(await api(`/scrapdrop/orders/${id}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void reload();
    const interval = setInterval(() => {
      void reload();
      setTimer(Date.now());
    }, 8000);
    return () => clearInterval(interval);
  }, [id]);
  useEffect(() => {
    if (!order?.pickupCode) {
      setQr("");
      return;
    }
    let done = false;
    import("qrcode")
      .then((q) =>
        q.toDataURL(order.pickupCode, {
          width: 220,
          margin: 2,
          color: { dark: "#284b3e", light: "#ffffff" },
        }),
      )
      .then((url) => {
        if (!done) setQr(url);
      });
    return () => {
      done = true;
    };
  }, [order?.pickupCode]);
  return (
    <main className="sd-page sd-order-page">
      <button className="sd-text" onClick={back}>
        <ArrowLeft size={15} />
        All my kits
      </button>
      {error && (
        <p className="sd-error" role="alert">
          {error}
        </p>
      )}
      {!order ? (
        <Loader />
      ) : (
        <>
          <span className="sd-kicker">
            {order.source === "demo"
              ? "SIMULATED PAYMENT · NOT A PAYPAL PURCHASE"
              : "PAYPAL SANDBOX · NO REAL MONEY"}
          </span>
          <h1>
            {order.fulfillment === "collected"
              ? "Time to make something lovely."
              : order.fulfillment === "ready"
                ? "Your little project is ready."
                : order.payment === "paid"
                  ? "A good choice, made yours."
                  : "Your kit reservation."}
          </h1>
          <p className="sd-order-status">
            <CheckCircle2 size={18} />
            {statusLabel(order)}
          </p>
          <div className="sd-order-layout">
            <section>
              <div className="sd-order-visual">
                <Suspense fallback={<Loader />}>
                  <KitViewer kit={order.kit} />
                </Suspense>
              </div>
              <h2>{order.kit.template.title}</h2>
              <p>
                {order.kit.config.width} × {order.kit.config.depth} ×{" "}
                {order.kit.config.height} mm · {order.kit.config.quantity} kit
                {order.kit.config.quantity > 1 ? "s" : ""}
              </p>
              <p>
                {order.kit.fulfillmentTerms?.label} ·{" "}
                {order.kit.fulfillmentTerms?.location}
              </p>
              <h3>Exactly what's in your kit</h3>
              {order.kit.lines.map((l: any) => (
                <p className="sd-receipt-line" key={l.itemId}>
                  <span>
                    {l.units} × {l.name}
                  </span>
                  <strong>{money(l.total)}</strong>
                </p>
              ))}
              <p className="sd-receipt-line">
                <span>Preparation</span>
                <strong>{money(order.kit.preparation)}</strong>
              </p>
              <p className="sd-total sd-receipt-line">
                <strong>Total</strong>
                <strong>{money(order.kit.total)} USD</strong>
              </p>
              <small>
                Purchased design snapshot · later stock or price changes don't
                alter this kit.
              </small>
            </section>
            <aside className="sd-pickup-panel">
              <span className="sd-kicker">FROM OUR STUDIO TO YOUR HANDS</span>
              <h2>
                {order.fulfillment === "collected"
                  ? "Collected. Enjoy making!"
                  : order.fulfillment === "ready"
                    ? "Ready when you are."
                    : "One good thing at a time."}
              </h2>
              <p>
                <MapPin size={16} />
                {shop.pickup}
              </p>
              <p>
                {order.fulfillment === "preparing"
                  ? "The shop is preparing the exact pieces you chose. Your pickup code appears when it is ready."
                  : order.fulfillment === "paid_needs_resolution"
                    ? "Payment is recorded, but the shop must resolve material availability before collection. Do not purchase again."
                    : order.fulfillment === "ready"
                      ? "Show this code at the desk. It can be used once."
                      : order.fulfillment === "collected"
                        ? "This pickup has been completed. Your assembly guide stays with your order."
                        : "Collection is available after confirmed payment and preparation."}
              </p>
              {order.pickupCode && (
                <div className="sd-pickup-code">
                  {qr && <img src={qr} alt="Private one-use pickup QR code" />}
                  <code>{order.pickupCode}</code>
                  <button
                    className="sd-text"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(order.pickupCode)
                        .catch(() =>
                          setError("Select and copy the pickup code manually."),
                        )
                    }
                  >
                    Copy pickup code
                  </button>
                </div>
              )}
              {["creating", "awaiting_buyer", "needs_creation"].includes(
                order.payment,
              ) && (
                <>
                  <p>
                    Reservation remaining:{" "}
                    {Math.max(0, Math.ceil((order.expires - timer) / 60000))}{" "}
                    min
                  </p>
                  <button
                    className="sd-btn full"
                    disabled={busy}
                    onClick={() => setResume(true)}
                  >
                    Continue PayPal checkout
                    <ArrowRight size={15} />
                  </button>
                  <button
                    className="sd-text"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await send(`/scrapdrop/orders/${id}/cancel`, {});
                        await reload();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Cancel this reservation
                  </button>
                </>
              )}
              {[
                "capture_requested",
                "pending",
                "needs_reconciliation",
              ].includes(order.payment) && (
                <p>
                  Payment is being checked. Your materials stay held while the
                  outcome is uncertain.
                </p>
              )}
              <button className="sd-text" onClick={reload}>
                <RotateCcw size={14} />
                Check status
              </button>
              <small>Order {order.id}</small>
            </aside>
          </div>
          {order.payment === "paid" &&
            order.fulfillment !== "paid_needs_resolution" && (
              <section className="sd-paid-guide">
                <div className="sd-section-heading">
                  <div>
                    <span className="sd-kicker">
                      LOOK WHAT YOU'RE GOING TO MAKE
                    </span>
                    <h2>Your assembly guide.</h2>
                  </div>
                  <button
                    className="sd-btn outline"
                    onClick={() => window.print()}
                  >
                    <BookOpen size={16} />
                    Print / save guide
                  </button>
                </div>
                <p>
                  Bring your own {order.kit.template.tools.join(", ")}.
                  {order.kit.template.id === "wrap"
                    ? " Your notebook is not included."
                    : ""}{" "}
                  Allow extra drying time.
                </p>
                <div className="sd-guide-grid">
                  <ol>
                    {order.kit.template.guide.map((s: string) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  <div>
                    <CutDiagram kit={order.kit} />
                    <small>
                      Cut layout: {order.kit.cut.width} × {order.kit.cut.height}{" "}
                      mm. Solid lines cut; dashed fold. Print scaling
                      varies—measure before cutting.
                    </small>
                  </div>
                </div>
              </section>
            )}
          {resume && (
            <ResumePayment
              order={order}
              config={config}
              close={() => {
                setResume(false);
                void reload();
              }}
            />
          )}
        </>
      )}
    </main>
  );
}
function ResumePayment({
  order,
  config,
  close,
}: {
  order: any;
  config: Config;
  close: () => void;
}) {
  const dialog = useDialog();
  const target = useRef<HTMLDivElement>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    let stopped = false,
      buttons: any;
    async function start() {
      try {
        if (!config.paypalClientId || !order.providerId)
          throw Error(
            "Payment setup is still pending. Check the order status shortly.",
          );
        const { loadSDK } = await import("../ToolCheckout");
        await loadSDK(config.paypalClientId);
        if (stopped) return;
        buttons = (window as any).paypal.Buttons({
          createOrder: () => order.providerId,
          onApprove: async () => {
            setMessage("Checking payment…");
            try {
              await send(`/scrapdrop/orders/${order.id}/capture`, {});
              close();
            } catch (e) {
              setMessage((e as Error).message);
            }
          },
          onCancel: close,
          onError: () =>
            setMessage(
              "PayPal could not finish. Check the existing order status.",
            ),
        });
        await buttons.render(target.current);
      } catch (e) {
        setMessage((e as Error).message);
      }
    }
    void start();
    return () => {
      stopped = true;
      try {
        buttons?.close();
      } catch {}
    };
  }, []);
  return (
    <div className="sd-overlay">
      <section
        ref={dialog}
        className="sd-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Resume sandbox payment"
      >
        <button
          className="sd-icon sd-close"
          onClick={close}
          aria-label="Close payment"
        >
          <X />
        </button>
        <h2>Your reserved kit.</h2>
        <p>
          {order.kit.template.title} · {money(order.kit.total)} USD
        </p>
        <div ref={target} />
        <p role="status">{message}</p>
      </section>
    </div>
  );
}
const blankMaterial = {
  name: "",
  type: "card" as Material["type"],
  color: "#7d8963",
  shade: "",
  width: 300,
  length: 420,
  thickness: 1,
  quantity: 1,
  price: 190,
  active: true,
  confirmed: true,
  imageId: null as string | null,
};
function ShopWorkspace({
  shop,
  refresh,
}: {
  shop: Shop;
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState("materials"),
    [form, setForm] = useState<any>(blankMaterial),
    [editing, setEditing] = useState(""),
    [orders, setOrders] = useState<any[]>([]),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [share, setShare] = useState(false),
    [suggestion, setSuggestion] = useState<any>(null);
  async function loadOrders() {
    try {
      setOrders(await api<any[]>("/scrapdrop/operator/orders"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (shop.operator) void loadOrders();
  }, [shop.operator, tab]);
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      if (
        !["image/png", "image/jpeg"].includes(file.type) ||
        file.size > 2 * 1024 * 1024
      )
        throw Error("Choose one JPEG or PNG up to 2 MB.");
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]);
        r.onerror = () => reject(Error("Unable to read this image."));
        r.readAsDataURL(file);
      });
      const image = await send("/scrapdrop/operator/images", {
        type: file.type,
        data,
      });
      setForm((f: any) => ({ ...f, imageId: image.id }));
      setSuggestion(null);
      setShare(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!shop.operator)
    return (
      <main className="sd-page">
        <span className="sd-kicker">SHOP WORKSPACE</span>
        <h1>A home for your materials.</h1>
        <p>
          Only the explicitly configured shop operator can manage stock and
          collect kits.
        </p>
        {!shop.operatorConfigured && (
          <div className="sd-setup">
            <h3>Connect the demo shop operator</h3>
            <p>
              Set this existing account ID as{" "}
              <code>SCRAPDROP_OPERATOR_ACCOUNT_ID</code> on the application
              server, then restart it. Creating an account does not
              automatically grant shop access.
            </p>
            <code>{shop.accountId}</code>
            <p>
              Keep the database persistent when changing hosted settings so this
              account survives the restart.
            </p>
          </div>
        )}
        <p>You can still customize and purchase kits as a buyer.</p>
      </main>
    );
  const field = (key: string, value: any) => {
    setConfirmed(false);
    setForm((f: any) => ({ ...f, [key]: value }));
  };
  return (
    <main className="sd-page sd-shop">
      <span className="sd-kicker">A SECOND BEGINNING STARTS ON YOUR SHELF</span>
      <h1>The studio desk.</h1>
      <p>
        Confirmed materials become possibilities. Paid orders become
        ready-to-make kits.
      </p>
      <div className="sd-tabs">
        <button
          className={tab === "materials" ? "selected" : ""}
          onClick={() => setTab("materials")}
        >
          <Leaf size={16} />
          Materials
        </button>
        <button
          className={tab === "orders" ? "selected" : ""}
          onClick={() => setTab("orders")}
        >
          <Package size={16} />
          Orders & pickup
        </button>
      </div>
      {error && (
        <p className="sd-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="sd-notice" role="status">
          {notice}
        </p>
      )}
      {tab === "materials" ? (
        <div className="sd-shop-grid">
          <section>
            <div className="sd-section-heading">
              <h2>What's on the shelf.</h2>
              <button
                className="sd-text"
                onClick={() => {
                  setEditing("");
                  setForm({ ...blankMaterial });
                  setConfirmed(false);
                  setSuggestion(null);
                }}
              >
                <Plus size={16} />
                New material
              </button>
            </div>
            <p className="sd-small">
              Sample pieces are synthetic demo inventory. New uploaded materials
              use your confirmed measurements.
            </p>
            <div className="sd-inventory-list">
              {shop.inventory.map((m) => (
                <button
                  className="sd-inventory-item"
                  key={m.id}
                  onClick={() => {
                    setEditing(m.id);
                    setForm({ ...m });
                    setConfirmed(false);
                    setSuggestion(null);
                  }}
                >
                  {m.imageId ? (
                    <img
                      src={"/api/scrapdrop/images/" + m.imageId}
                      alt={m.name}
                    />
                  ) : (
                    <div
                      className={"sd-scrap " + m.type}
                      style={{ backgroundColor: m.color }}
                    />
                  )}
                  <span>
                    <strong>{m.name}</strong>
                    <small>
                      {m.width} × {m.length} mm ·{" "}
                      {m.sample ? "sample stock" : "confirmed stock"}
                      {!m.active ? " · paused" : ""}
                    </small>
                    <small>
                      {m.available} available / {m.quantity} received
                    </small>
                  </span>
                  <strong>{money(m.price)}</strong>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          </section>
          <form
            className="sd-stock-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              setNotice("");
              try {
                if (editing)
                  await api("/scrapdrop/operator/inventory/" + editing, {
                    method: "PATCH",
                    body: JSON.stringify(form),
                  });
                else await send("/scrapdrop/operator/inventory", form);
                setNotice(
                  "Material saved. Project feasibility uses the new stock revision.",
                );
                setForm({ ...blankMaterial });
                setEditing("");
                setConfirmed(false);
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <span className="sd-kicker">
              {editing
                ? "UPDATE THE ACTUAL MATERIAL"
                : "BRING A LITTLE LEFTOVER"}
            </span>
            <h2>
              {editing ? "Check every detail." : "Give it a possibility."}
            </h2>
            <label className="sd-photo-upload">
              {form.imageId ? (
                <img
                  src={"/api/scrapdrop/images/" + form.imageId}
                  alt="Selected material"
                />
              ) : (
                <>
                  <Upload size={24} />
                  <strong>Add a material photo</strong>
                  <span>JPEG / PNG · up to 2 MB</span>
                </>
              )}
              <input
                aria-label="Upload a material photo"
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  if (e.target.files?.[0]) void upload(e.target.files[0]);
                }}
              />
            </label>
            {form.imageId && (
              <div className="sd-ai-label">
                <label className="sd-check">
                  <input
                    type="checkbox"
                    checked={share}
                    onChange={(e) => setShare(e.target.checked)}
                  />
                  Allow this selected photo to be sent to Gemini for labeling.
                </label>
                <button
                  type="button"
                  className="sd-text"
                  disabled={busy || !share}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const s = await send(
                        `/scrapdrop/operator/images/${form.imageId}/suggest`,
                        { shareWithAI: true },
                      );
                      setSuggestion(s);
                      if (s.type !== "unknown")
                        setForm((f: any) => ({ ...f, type: s.type }));
                      setConfirmed(false);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Sparkles size={15} />
                  Suggest material label
                </button>
                {suggestion && (
                  <p>
                    {suggestion.source === "fixture"
                      ? "Local example, not live image analysis"
                      : "AI suggestion"}
                    : {suggestion.type} · {suggestion.shade}.{" "}
                    {suggestion.notice}
                  </p>
                )}
              </div>
            )}
            <label>
              Material name
              <input
                required
                maxLength={100}
                minLength={3}
                value={form.name}
                onChange={(e) => field("name", e.target.value)}
              />
            </label>
            <div className="sd-form-row">
              <label>
                Material type
                <select
                  value={form.type}
                  onChange={(e) => field("type", e.target.value)}
                >
                  <option value="card">Cardstock</option>
                  <option value="fabric">Fabric</option>
                  <option value="ribbon">Ribbon segment</option>
                </select>
              </label>
              <label>
                Shade name
                <input
                  required
                  minLength={2}
                  maxLength={40}
                  value={form.shade}
                  onChange={(e) => field("shade", e.target.value)}
                />
              </label>
              <label>
                Preview color
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => field("color", e.target.value)}
                />
              </label>
            </div>
            <div className="sd-form-row">
              <label>
                Usable width · mm
                <input
                  type="number"
                  min={1}
                  max={2000}
                  required
                  value={form.width}
                  onChange={(e) => field("width", Number(e.target.value))}
                />
              </label>
              <label>
                Usable length · mm
                <input
                  type="number"
                  min={1}
                  max={3000}
                  required
                  value={form.length}
                  onChange={(e) => field("length", Number(e.target.value))}
                />
              </label>
            </div>
            <div className="sd-form-row">
              <label>
                Identical pieces received
                <input
                  type="number"
                  min={0}
                  max={1000}
                  required
                  value={form.quantity}
                  onChange={(e) => field("quantity", Number(e.target.value))}
                />
              </label>
              <label>
                Price per piece · USD
                <input
                  type="number"
                  min={0}
                  max={1000}
                  step="0.01"
                  required
                  value={form.price / 100}
                  onChange={(e) =>
                    field("price", Math.round(Number(e.target.value) * 100))
                  }
                />
              </label>
            </div>
            <label>
              Sheet or ribbon thickness · mm
              <input
                type="number"
                min="0.1"
                max="10"
                step="0.1"
                required
                value={form.thickness}
                onChange={(e) => field("thickness", Number(e.target.value))}
              />
            </label>
            <small>
              These recipes support sheets up to 1.5 mm and ribbon up to 2 mm
              thick.
            </small>
            <label className="sd-check">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => field("active", e.target.checked)}
              />
              Offer this material in new kits.
            </label>
            <label className="sd-check">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I confirmed the material, usable dimensions, quantity, shade and
              price. Saving publishes the photo when the material is active.
            </label>
            <small>
              Only group pieces with matching dimensions and condition. Reserved
              or sold pieces cannot be removed or changed silently.
            </small>
            <button className="sd-btn full" disabled={busy || !confirmed}>
              {busy ? <Loader /> : <Check size={16} />}Confirm and save material
            </button>
          </form>
        </div>
      ) : (
        <>
          <section className="sd-pickup-redeem">
            <div>
              <h2>One code. One happy pickup.</h2>
              <p>
                Confirm the exact kit is ready, then enter the buyer's pickup
                code.
              </p>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await send("/scrapdrop/operator/pickups/redeem", {
                    code: code.trim(),
                  });
                  setNotice("Kit collected. This code cannot be used again.");
                  setCode("");
                  await loadOrders();
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <input
                aria-label="Buyer pickup code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste the pickup code"
                required
                minLength={20}
              />
              <button className="sd-btn" disabled={busy}>
                Confirm collection
                <Check size={16} />
              </button>
            </form>
          </section>
          <div className="sd-fulfillment-list">
            {!orders.length ? (
              <div className="sd-empty">
                <Package />
                <h3>Nothing to pack just yet.</h3>
              </div>
            ) : (
              orders.map((o) => (
                <article key={o.id}>
                  <div className="sd-order-card">
                    <div>
                      <Art kit={o.kit} />
                    </div>
                    <span>
                      <small>
                        {o.source === "demo"
                          ? "Simulated payment"
                          : "PayPal sandbox"}{" "}
                        · {o.id}
                      </small>
                      <h3>
                        {o.kit.template.title} × {o.kit.config.quantity}
                      </h3>
                      <p>{statusLabel(o)}</p>
                    </span>
                    <strong>{money(o.kit.total)}</strong>
                  </div>
                  <details>
                    <summary>
                      Exact pick list and purchased design
                      <ChevronDown size={15} />
                    </summary>
                    {o.kit.lines.map((l: any) => (
                      <p key={l.itemId}>
                        {l.units} × {l.name} · {l.itemId}
                      </p>
                    ))}
                    <p>
                      Final dimensions: {o.kit.config.width} ×{" "}
                      {o.kit.config.depth} × {o.kit.config.height} mm
                    </p>
                    <small>
                      {o.kit.fulfillmentTerms?.label}
                      <br />
                      Pack the original allocated pieces. Do not substitute a
                      different shade.
                    </small>
                  </details>
                  {o.payment === "paid" && o.fulfillment === "preparing" && (
                    <button
                      className="sd-btn outline"
                      onClick={async () => {
                        try {
                          await send(
                            `/scrapdrop/operator/orders/${o.id}/ready`,
                            {},
                          );
                          await loadOrders();
                          setNotice(
                            "Kit is ready. The buyer can now see their pickup code.",
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      <Check size={16} />
                      Packed exactly · mark ready
                    </button>
                  )}
                  {["refunded", "partially_refunded", "reversed"].includes(
                    o.payment,
                  ) && (
                    <div className="sd-restock">
                      <p>
                        Refunds do not automatically restock physical materials.
                        Confirm only whole original allocations that have
                        actually returned usable.
                      </p>
                      {o.kit.lines.map((l: any) => (
                        <button
                          className="sd-text"
                          key={l.itemId}
                          onClick={async () => {
                            try {
                              await send(
                                `/scrapdrop/operator/orders/${o.id}/return`,
                                { itemId: l.itemId, units: l.units },
                              );
                              await refresh();
                              setNotice(
                                "Returned usable units restored to availability.",
                              );
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          Confirm returned: {l.units} × {l.name}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </>
      )}
    </main>
  );
}
