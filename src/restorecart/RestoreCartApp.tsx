import { SellerWorkspace } from "./SellerWorkspace";
import { Basket } from "./Basket";
import { AccountForm, BuyerAccount } from "./Accounts";
import {
  MappingPanel,
  ReadinessPanel,
  CustomerPanel,
  RecoveryPanel,
  KitPanel,
} from "./Continuity";
import { useEffect, useState, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  HeartHandshake,
  ImagePlus,
  Layers3,
  LoaderCircle,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Upload,
  X,
  Zap,
} from "lucide-react";
import "./style.css";
import { EntryPage, ShopDirectory } from "./PublicPages";

let csrf = "";
async function api(path: string, body?: unknown, method?: string) {
  const response = await fetch("/api/restorecart" + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(body === undefined ? {} : { "x-csrf-token": csrf }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error?.message || "Request did not finish.");
  if (
    body !== undefined &&
    (path.endsWith("/cart") || path.endsWith("/basket-items"))
  )
    window.dispatchEvent(new Event("rc-basket-changed"));
  return data;
}
const dollars = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    c / 100,
  );
function Brand() {
  return (
    <span className="rc-brand">
      <span className="rc-brandmark">
        <ShoppingBag size={21} />
      </span>
      restorecart<span className="rc-brand-dot">.</span>
    </span>
  );
}
function Artwork({
  sku = "",
  image,
  slug,
}: {
  sku?: string;
  image?: string;
  slug?: string;
}) {
  return (
    <div
      className={`rc-art ${sku.includes("RED") ? "red" : sku.includes("TOTE") ? "sand" : "blue"}`}
    >
      {image ? (
        <img
          alt="Product"
          src={
            slug
              ? `/api/restorecart/shops/${slug}/images/${image}`
              : `/api/restorecart/sources/${image}`
          }
        />
      ) : sku === "TOTE-NAT" ? (
        <div className="rc-tote">
          <i />
        </div>
      ) : ["MUG-BLU", "MUG-RED"].includes(sku) ? (
        <div className="rc-mug">
          <i />
          <span />
        </div>
      ) : (
        <Package size={42} aria-label="No product photo" />
      )}
      <span className="rc-art-label">
        {image
          ? ""
          : ["MUG-BLU", "MUG-RED", "TOTE-NAT"].includes(sku)
            ? "Illustrative preview"
            : "No product photo provided"}
      </span>
    </div>
  );
}
function Pill({ children, kind = "" }: { children: ReactNode; kind?: string }) {
  return <span className={`rc-pill ${kind}`}>{children}</span>;
}
function ShareQR({ url }: { url: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then((q) =>
        q.toDataURL(url, {
          width: 150,
          margin: 1,
          color: { dark: "#263c35", light: "#ffffff" },
        }),
      )
      .then((value) => {
        if (alive) setSrc(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);
  return src ? (
    <img className="rc-qr" src={src} alt="QR code for this rescue shop" />
  ) : null;
}
function StepHeading({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rc-stepheading">
      <span>{number}</span>
      <div>
        <h2>{title}</h2>
        {children && <p>{children}</p>}
      </div>
    </div>
  );
}

export default function RestoreCartApp() {
  const [path, setPath] = useState(location.pathname),
    [session, setSession] = useState<any>(null),
    [incidents, setIncidents] = useState<any[]>([]),
    [current, setCurrent] = useState<any>(null),
    [tab, setTab] = useState("Reconstruct"),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [dirty, setDirty] = useState(false);
  const [newName, setNewName] = useState(""),
    [evidence, setEvidence] = useState<any>(null),
    [exports, setExports] = useState<any[]>([]),
    [exportPreview, setExportPreview] = useState<any>(null),
    [orders, setOrders] = useState<any[]>([]);
  const [basketUnits, setBasketUnits] = useState(0);
  const isBasket = path === "/restorecart/basket";
  const isAccount = path === "/restorecart/account",
    isShop = path.startsWith("/s/"),
    isReceipt = path.startsWith("/restorecart/receipt/"),
    isSeller =
      path === "/restorecart/seller" || path.startsWith("/restorecart/seller/"),
    isDirectory =
      path === "/restorecart/shops" || path === "/restorecart/shops/",
    isEntry = path === "/restorecart" || path === "/restorecart/";
  const publicHome =
    isSeller || isEntry ? "/restorecart" : "/restorecart/shops";
  const go = (url: string) => {
    history.pushState({}, "", url);
    setPath(location.pathname);
    setError("");
    setNotice("");
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    const fn = () => setPath(location.pathname);
    window.addEventListener("popstate", fn);
    document.title = "RestoreCart — Keep your business moving";
    return () => window.removeEventListener("popstate", fn);
  }, []);
  useEffect(() => {
    if (!evidence || !isSeller) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEvidence(null);
      if (event.key !== "Tab") return;
      const items = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".rc-modal button, .rc-modal a[href]",
        ),
      );
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", key);
    };
  }, [evidence, isSeller]);
  async function refreshSession() {
    const s = await api(isSeller ? "/seller-session" : "/session");
    csrf = s.csrf;
    setSession(s);
    return s;
  }
  async function authenticated() {
    setCurrent(null);
    setIncidents([]);
    setOrders([]);
    const s = await refreshSession();
    if (s.seller) {
      const all = await loadList();
      if (all.length) await load(all[0].id);
      go("/restorecart/seller");
    } else go("/restorecart/shops");
  }
  useEffect(() => {
    if (!session) return;
    let alive = true;
    const update = () =>
      api("/basket")
        .then((b) => {
          if (alive) setBasketUnits(b.units);
        })
        .catch(() => {});
    update();
    window.addEventListener("rc-basket-changed", update);
    return () => {
      alive = false;
      window.removeEventListener("rc-basket-changed", update);
    };
  }, [session?.user?.id, path, session?.csrf]);
  async function loadList() {
    const all = await api("/incidents");
    setIncidents(all);
    return all;
  }
  async function load(id: string) {
    const i = await api(`/incidents/${id}`);
    setCurrent(i);
    setDirty(false);
    sessionStorage.setItem("rc-current", id);
    return i;
  }
  useEffect(() => {
    let alive = true;
    api(isSeller ? "/seller-session" : "/session")
      .then((s) => {
        if (!alive) return;
        csrf = s.csrf;
        setSession(s);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [isSeller]);
  useEffect(() => {
    if (!session?.seller || !isSeller || current) return;
    let alive = true;
    loadList()
      .then(async (all) => {
        if (!alive) return;
        const id = sessionStorage.getItem("rc-current");
        if (all.length)
          await load(all.some((i: any) => i.id === id) ? id! : all[0].id);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [session?.seller, isSeller]);
  useEffect(() => {
    if (!session || !isSeller) return;
    const next = session.seller
      ? "/restorecart/seller"
      : "/restorecart/seller/sign-in";
    if (path !== next) {
      history.replaceState({}, "", next);
      setPath(next);
    }
  }, [session?.seller, isSeller, path]);
  useEffect(() => {
    if (!current || !session?.seller || !isSeller) return;
    let alive = true;
    if (tab === "Orders")
      api(`/orders?incident=${current.id}`)
        .then((items) => {
          if (alive) setOrders(items);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    if (tab === "Recover")
      api(`/incidents/${current.id}/exports`)
        .then((items) => {
          if (alive) setExports(items);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [tab, current?.id, current?.revision, session?.seller, isSeller]);
  async function run(label: string, fn: () => Promise<any>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      window.scrollTo({ top: 0, behavior: "auto" });
    } finally {
      setBusy("");
    }
  }
  function edit(values: any) {
    setCurrent((i: any) => ({ ...i, ...values }));
    setDirty(true);
  }
  function editProduct(index: number, values: any) {
    edit({
      products: current.products.map((p: any, j: number) =>
        j === index ? { ...p, ...values } : p,
      ),
    });
  }
  async function saveDraft() {
    const { revision, name, pickup, originalUrl, products } = current;
    const i = await api(
      `/incidents/${current.id}`,
      {
        revision,
        name,
        pickup,
        originalUrl,
        products: products.map(({ issues, available, ...p }: any) => p),
      },
      "PATCH",
    );
    setCurrent(i);
    setDirty(false);
    return i;
  }
  async function upload(files: FileList | null) {
    if (!files) return;
    await run("Reading your files", async () => {
      for (const file of [...files]) {
        if (file.size > 5 * 1024 * 1024)
          throw Error("Each source must be at most 5 MB.");
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(Error("Could not read file."));
          reader.readAsDataURL(file);
        });
        await api(`/incidents/${current.id}/sources`, {
          name: file.name,
          data,
        });
      }
      await load(current.id);
      setNotice(
        "Sources saved privately. Reconstruct your catalog when you’re ready.",
      );
    });
  }
  if (!session || (isSeller && !session.ai))
    return (
      <div className="rc rc-loading">
        <LoaderCircle className="rc-spin" />
        <p>{error || "Opening RestoreCart…"}</p>
      </div>
    );
  return (
    <MotionConfig reducedMotion="user">
      <div className="rc">
        <header className="rc-header">
          <a
            href={publicHome}
            onClick={(e) => {
              e.preventDefault();
              go(publicHome);
            }}
            aria-label="RestoreCart home"
          >
            <Brand />
          </a>
          <div className="rc-header-right">
            <nav
              className="rc-header-navigation"
              aria-label="Platform navigation"
            >
              {isSeller ? (
                <>
                  <span className="rc-role-label">Seller workspace</span>
                </>
              ) : !isEntry ? (
                <a
                  href={isDirectory ? "/restorecart" : "/restorecart/shops"}
                  onClick={(e) => {
                    e.preventDefault();
                    go(isDirectory ? "/restorecart" : "/restorecart/shops");
                  }}
                >
                  {isDirectory ? "Home" : "All shops"}
                </a>
              ) : null}
            </nav>
            {!isSeller && (
              <a
                className="rc-basket-link"
                href="/restorecart/basket"
                aria-label={`Shopping basket, ${basketUnits} items`}
                onClick={(e) => {
                  e.preventDefault();
                  go("/restorecart/basket");
                }}
              >
                <ShoppingBasket size={23} />
                <span>Basket</span>
                <b aria-hidden="true">{basketUnits}</b>
              </a>
            )}
            {!isSeller && (
              <>
                <a
                  className="rc-account-link"
                  href="/restorecart/account"
                  onClick={(e) => {
                    e.preventDefault();
                    go("/restorecart/account");
                  }}
                >
                  {session.user ? "Your orders" : "Sign in"}
                </a>
              </>
            )}
            <Pill kind="sandbox">
              <span className="rc-dot" />
              PayPal sandbox
            </Pill>
            {(session.user || session.seller) && (
              <button
                className="rc-iconbutton"
                aria-label="Sign out"
                onClick={() =>
                  run("Signing out", async () => {
                    await api("/logout", {});
                    setCurrent(null);
                    setIncidents([]);
                    setOrders([]);
                    setExports([]);
                    setExportPreview(null);
                    setEvidence(null);
                    setDirty(false);
                    await refreshSession();
                    go(
                      isSeller
                        ? "/restorecart/seller/sign-in"
                        : "/restorecart/account",
                    );
                  })
                }
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </header>
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rc-alert"
              role="alert"
            >
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={17} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {notice && (
          <div className="rc-notice" role="status">
            <CheckCircle2 size={18} />
            {notice}
          </div>
        )}
        {isBasket ? (
          <Basket
            api={api}
            run={run}
            busy={busy}
            ready={session.paypalReady}
            go={go}
          />
        ) : isAccount ? (
          <BuyerAccount
            api={api}
            run={run}
            busy={busy}
            go={go}
            onAuthenticated={authenticated}
            role="buyer"
            user={session.user}
          />
        ) : isEntry ? (
          <EntryPage />
        ) : isDirectory ? (
          <ShopDirectory
            loadShops={() => api("/shops")}
            busy={!!busy}
            addToBasket={(slug, sku) =>
              run("Adding to basket", async () => {
                await api(`/shops/${encodeURIComponent(slug)}/basket-items`, {
                  sku,
                  quantity: 1,
                });
                setNotice("Added to basket.");
              })
            }
            renderArt={(shop, product) => (
              <Artwork
                sku={product?.sku || shop.preview?.sku}
                image={
                  product ? product.imageSourceId : shop.preview?.imageSourceId
                }
                slug={shop.slug}
              />
            )}
          />
        ) : !isShop && !isReceipt && !isSeller ? (
          <main className="rc-receipt">
            <h1>Page not found.</h1>
            <a className="rc-button" href="/restorecart">
              Choose where to go
              <ArrowRight size={17} />
            </a>
          </main>
        ) : isShop ? (
          <Shop
            key={`${path}:${session.user?.id || "guest"}`}
            slug={decodeURIComponent(path.split("/")[2])}
            ready={session.paypalReady}
            go={go}
            run={run}
            busy={busy}
          />
        ) : isReceipt ? (
          <Receipt id={path.split("/")[3]} go={go} run={run} busy={busy} />
        ) : !session.seller ? (
          <main className="rc-landing">
            <section>
              <a className="rc-seller-return" href="/restorecart/shops">
                Here to shop? Browse public shops <ArrowRight size={15} />
              </a>
              <div className="rc-eyebrow">
                <span className="rc-dot" /> A SMALL SETBACK. A QUICK COMEBACK.
              </div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                Your shop is down.
                <br />
                <em>Your story isn’t over.</em>
              </motion.h1>
              <p className="rc-lede">
                Turn the files you already have into a working rescue shop. Keep
                selling, take payments, and bring every order home.
              </p>
              <div className="rc-benefits">
                <span>
                  <FolderOpen size={18} />
                  Bring your catalog
                </span>
                <ArrowRight size={16} />
                <span>
                  <Sparkles size={18} />
                  Find the missing pieces
                </span>
                <ArrowRight size={16} />
                <span>
                  <ShoppingBag size={18} />
                  Open for business
                </span>
              </div>
              <AccountForm
                api={api}
                run={run}
                busy={busy}
                go={go}
                onAuthenticated={authenticated}
                role="seller"
              />
            </section>
            <aside className="rc-landing-art">
              <div className="rc-tape" />
              <div className="rc-floating rc-float-one">
                <FileText size={19} />
                <span>catalog.pdf</span>
                <Pill>Saved</Pill>
              </div>
              <div className="rc-demo-shop">
                <div className="rc-demo-shop-top">
                  <span className="rc-mini-flower">✳</span>
                  <b>Sunday Studio</b>
                  <Pill kind="green">Back in business</Pill>
                </div>
                <Artwork sku="MUG-BLU" />
                <div className="rc-demo-price">
                  <div>
                    <small>THE LITTLE THINGS, CONTINUED.</small>
                    <h3>Blue stoneware mug</h3>
                  </div>
                  <b>$20</b>
                </div>
                <div className="rc-demo-paid">
                  <CheckCircle2 size={20} />
                  <span>One more order. One less worry.</span>
                </div>
              </div>
              <div className="rc-floating rc-float-two">
                <ShieldCheck size={21} />
                <div>
                  <b>Your business. Your records.</b>
                  <small>Every sale finds its way home.</small>
                </div>
              </div>
              <p className="rc-handnote">
                a little resilience goes a long way ↗
              </p>
            </aside>
          </main>
        ) : (
          <SellerWorkspace
            current={current}
            incidents={incidents}
            session={session}
            api={api}
            run={run}
            busy={busy}
            load={load}
            loadList={loadList}
          />
        )}
        <footer className="rc-footer">
          <Brand />
          <span>A little resilience. A lot of possibility.</span>
          <span>Sandbox prototype · pickup only</span>
        </footer>
        <AnimatePresence>
          {busy && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rc-working"
              role="status"
            >
              <LoaderCircle size={18} className="rc-spin" />
              {busy}…
            </motion.div>
          )}
        </AnimatePresence>
        {isSeller && evidence && (
          <div className="rc-modal-backdrop" onClick={() => setEvidence(null)}>
            <section
              className="rc-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="evidence-title"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                autoFocus
                className="rc-iconbutton rc-modal-close"
                aria-label="Close evidence"
                onClick={() => setEvidence(null)}
              >
                <X />
              </button>
              <div className="rc-eyebrow">FOLLOW THE SOURCE</div>
              <h2 id="evidence-title">
                {evidence.field}: {evidence.value}
              </h2>
              <p>
                {evidence.source?.name} · {evidence.location}
              </p>
              <blockquote>{evidence.excerpt}</blockquote>
              <a
                className="rc-button secondary"
                href={`/api/restorecart/sources/${evidence.sourceId}`}
                target="_blank"
                rel="noreferrer"
              >
                Open original source
                <ExternalLink size={16} />
              </a>
              <p>
                Source evidence helps you check a value. It does not confirm
                that an old price or stock count is current.
              </p>
            </section>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}

function Shop({
  slug,
  ready,
  go,
  run,
  busy,
}: {
  slug: string;
  ready: boolean;
  go: (p: string) => void;
  run: (l: string, f: () => Promise<any>) => Promise<void>;
  busy: string;
}) {
  const [shop, setShop] = useState<any>(null),
    [cart, setCart] = useState<Record<string, number>>({}),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [cartLoaded, setCartLoaded] = useState(false),
    [cartSaving, setCartSaving] = useState(false),
    [cartError, setCartError] = useState(""),
    [noticeLocal, setNoticeLocal] = useState("");
  const cartRef = useRef<Record<string, number>>({});
  const [localError, setLocalError] = useState("");
  useEffect(() => {
    let alive = true;
    api(`/shops/${encodeURIComponent(slug)}`)
      .then((shop) => {
        if (!alive) return;
        setShop(shop);
        const target = decodeURIComponent(location.hash.slice(1));
        const selected = shop.products.find(
          (p: any) => `product-${p.sku}` === target && p.available > 0,
        );
        const quantities = selected ? { [selected.sku]: 1 } : {};
        setCart(quantities);
        cartRef.current = quantities;
        setKey(crypto.randomUUID());
        setCartLoaded(true);
      })
      .catch((e) => {
        if (alive) setLocalError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [slug]);
  useEffect(() => {
    if (!shop || !location.hash) return;
    try {
      document
        .getElementById(decodeURIComponent(location.hash.slice(1)))
        ?.scrollIntoView({ block: "center", behavior: "instant" });
    } catch {
      /* An invalid URL fragment does not prevent shopping. */
    }
  }, [shop]);
  function changeQuantity(sku: string, quantity: number) {
    const quantities = { ...cartRef.current, [sku]: quantity },
      requestKey = crypto.randomUUID();
    cartRef.current = quantities;
    setCart(quantities);
    setKey(requestKey);
    setCartError("");
    setNoticeLocal("");
  }

  if (!shop)
    return (
      <main className="rc-shop">
        <p role={localError ? "alert" : "status"}>
          {localError || "Opening this little shop…"}
        </p>
      </main>
    );
  const lines = shop.products.filter((p: any) => cart[p.sku] > 0),
    total = lines.reduce(
      (s: number, p: any) =>
        s + Math.round(Number(p.price) * 100) * cart[p.sku],
      0,
    );
  return (
    <main className="rc-shop">
      <div className="rc-shop-intro">
        <Pill kind={shop.state === "live" ? "green" : ""}>
          <span className="rc-dot green" />
          {shop.state === "live"
            ? "A TEMPORARY HOME. THE SAME GOOD THINGS."
            : "THIS RESCUE SHOP IS CLOSED TO NEW ORDERS"}
        </Pill>
        <h1>
          {shop.name}
          <span>✳</span>
        </h1>
        <p>
          {shop.contact?.status ||
            "Our original website is taking a little break. You can still find your favorites here."}
        </p>
        {(shop.contact?.contact || shop.contact?.hours) && (
          <p>
            {shop.contact.hours && `Hours: ${shop.contact.hours}`}
            {shop.contact.hours && shop.contact.contact ? " · " : ""}
            {shop.contact.contact && `Contact: ${shop.contact.contact}`}
          </p>
        )}
        {shop.state !== "live" && shop.originalUrl && (
          <a href={shop.originalUrl} className="rc-button secondary">
            Visit original shop
            <ExternalLink size={16} />
          </a>
        )}
      </div>
      <div className="rc-shop-layout">
        <div className="rc-store-products">
          {shop.products.map((p: any) => (
            <motion.article
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              key={p.sku}
              id={`product-${p.sku}`}
              className="rc-store-product"
            >
              <Artwork sku={p.sku} image={p.imageSourceId} slug={slug} />
              <div className="rc-store-product-details">
                <div>
                  <h2>{p.name}</h2>
                  <b>{dollars(Math.round(Number(p.price) * 100))}</b>
                </div>
                <p>{p.description}</p>
                <div className="rc-store-product-bottom">
                  <span>
                    {p.available > 0 ? `${p.available} available` : "Sold out"}
                  </span>
                  <label>
                    Quantity
                    <input
                      aria-label={`Quantity for ${p.name}`}
                      type="number"
                      min={0}
                      max={Math.min(p.available, 100)}
                      value={cart[p.sku] || 0}
                      disabled={
                        shop.state !== "live" || p.available === 0 || !!busy
                      }
                      onChange={(e) => {
                        changeQuantity(
                          p.sku,
                          Math.max(
                            0,
                            Math.min(
                              p.available,
                              100,
                              Math.trunc(Number(e.target.value) || 0),
                            ),
                          ),
                        );
                      }}
                    />
                  </label>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
        <aside className="rc-cart">
          <span className="rc-cart-icon">
            <ShoppingBag size={24} />
          </span>
          <h2>Your selection</h2>
          <p role="status">
            {cartSaving
              ? "Saving your cart…"
              : "Choose quantities, then buy now or add them to your basket."}
          </p>
          {cartError && <p role="alert">{cartError}</p>}
          <a href="/restorecart/basket">View basket →</a>
          {!lines.length ? (
            <p>Choose something you love. It will appear here.</p>
          ) : (
            lines.map((p: any) => (
              <div className="rc-cart-line" key={p.sku}>
                <span>
                  {cart[p.sku]} × {p.name}
                </span>
                <b>
                  {dollars(Math.round(Number(p.price) * 100) * cart[p.sku])}
                </b>
              </div>
            ))
          )}
          <div className="rc-cart-total">
            <span>Total · USD</span>
            <b>{dollars(total)}</b>
          </div>
          <div className="rc-pickup">
            <Package size={18} />
            <div>
              <b>Pickup only</b>
              <p>{shop.pickup}</p>
            </div>
          </div>
          <p className="rc-cart-fine">
            No added shipping or separately calculated tax in this sandbox
            prototype. Checkout reserves these units for 10 minutes.
          </p>
          <button
            className="rc-button"
            disabled={
              !!busy ||
              cartSaving ||
              !cartLoaded ||
              cartError.startsWith("Cart could not") ||
              !lines.length ||
              !ready ||
              shop.state !== "live"
            }
            onClick={() =>
              run("Reserving your items", async () => {
                const o = await api(`/shops/${slug}/orders`, {
                  requestKey: key,
                  revision: shop.revision,
                  lines: lines.map((p: any) => ({
                    sku: p.sku,
                    quantity: cart[p.sku],
                  })),
                });
                if (o.snapshot.approvalUrl)
                  location.assign(o.snapshot.approvalUrl);
                else go(o.receiptUrl);
              })
            }
          >
            Checkout with PayPal
            <ArrowRight size={17} />
          </button>
          <button
            className="rc-button secondary rc-add-selection"
            disabled={!!busy || !lines.length || shop.state !== "live"}
            onClick={() =>
              run("Adding to basket", async () => {
                setCartSaving(true);
                try {
                  await api(`/shops/${encodeURIComponent(slug)}/basket-items`, {
                    lines: lines.map((p: any) => ({
                      sku: p.sku,
                      quantity: cart[p.sku],
                    })),
                  });
                  setNoticeLocal("Added to basket.");
                } finally {
                  setCartSaving(false);
                }
              })
            }
          >
            <ShoppingBasket size={18} /> Add to basket
          </button>
          {noticeLocal && (
            <p role="status">
              {noticeLocal} <a href="/restorecart/basket">View basket →</a>
            </p>
          )}
          <small>
            <ShieldCheck size={14} />
            Sandbox test funds. No real charge.
          </small>
          {!ready && (
            <p className="rc-warning">
              PayPal sandbox needs configuration before checkout is available.
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
function Receipt({
  id,
  go,
  run,
  busy,
}: {
  id: string;
  go: (p: string) => void;
  run: (l: string, f: () => Promise<any>) => Promise<void>;
  busy: string;
}) {
  const [o, setOrder] = useState<any>(null),
    [error, setError] = useState("");
  const access = new URLSearchParams(location.search).get("access") || "";
  const query = `?access=${encodeURIComponent(access)}`;
  const refresh = async () => {
    const data = await api(`/orders/${id}${query}`);
    setOrder(data);
    return data;
  };
  useEffect(() => {
    let alive = true;
    api(`/orders/${id}${query}`)
      .then(async (data) => {
        if (!alive) return;
        setOrder(data);
        if (new URLSearchParams(location.search).has("cancel")) {
          await api(`/orders/${id}/cancel${query}`, {}).then(
            (v) => alive && setOrder(v),
          );
        } else if (!["paid", "failed", "canceled"].includes(data.state)) {
          await api(`/orders/${id}/check${query}`, {}).then(
            (v) => alive && setOrder(v),
          );
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);
  useEffect(() => {
    if (
      !o ||
      ![
        "capture_requested",
        "pending",
        "needs_reconciliation",
        "creating",
        "awaiting_buyer",
      ].includes(o.state)
    )
      return;
    const timer = setInterval(() => refresh().catch(() => {}), 6000);
    return () => clearInterval(timer);
  }, [o?.state]);
  if (!o)
    return (
      <main className="rc-receipt">
        <p role={error ? "alert" : "status"}>
          {error || "Checking your order…"}
        </p>
      </main>
    );
  const paid = o.state === "paid",
    title = o.refunded
      ? "A financial adjustment was recorded."
      : paid
        ? "A little order. A big thank you."
        : o.state === "canceled"
          ? "Your checkout was canceled."
          : o.state === "failed"
            ? "Payment did not complete."
            : "Let’s check your payment.";
  return (
    <main className="rc-receipt">
      <div className={`rc-receipt-symbol ${paid ? "paid" : ""}`}>
        {paid ? <CheckCircle2 size={38} /> : <ShoppingBag size={38} />}
      </div>
      <Pill kind={paid ? "green" : ""}>{o.state.replaceAll("_", " ")}</Pill>
      <h1>{title}</h1>
      <p>
        {paid && !o.refunded
          ? "Your PayPal sandbox payment is verified. Keep this receipt for pickup."
          : "This page reflects the server’s payment record. Approval alone does not mean payment is complete."}
      </p>
      {error && (
        <p role="alert" className="rc-warning">
          {error}
        </p>
      )}
      <section className="rc-panel">
        <div className="rc-orderhead">
          <h2>{o.snapshot.name}</h2>
          <strong>{dollars(o.amount)}</strong>
        </div>
        {o.snapshot.lines.map((l: any) => (
          <div className="rc-cart-line" key={l.sku}>
            <span>
              {l.quantity} × {l.name}
            </span>
            <b>{dollars(l.unitCents * l.quantity)}</b>
          </div>
        ))}
        <div className="rc-receipt-meta">
          <span>
            Order <code>{o.id.slice(-12)}</code>
          </span>
          <span>
            Pickup <b>{o.fulfillment.replaceAll("_", " ")}</b>
          </span>
          {o.capture && (
            <span>
              Sandbox capture <code>{o.capture}</code>
            </span>
          )}
          {o.refunded > 0 && (
            <span>
              Financial adjustments <b>{dollars(o.refunded)}</b>
            </span>
          )}
        </div>
        <div className="rc-pickup">
          <Package size={20} />
          <div>
            <b>Pickup instructions</b>
            <p>{o.snapshot.pickup}</p>
          </div>
        </div>
        <div className="rc-buttonrow">
          <button
            className="rc-button secondary"
            disabled={!!busy}
            onClick={() =>
              run("Checking payment status", async () => {
                setOrder(await api(`/orders/${id}/check${query}`, {}));
              })
            }
          >
            <RefreshCw size={16} />
            Check payment status
          </button>
          {o.state === "awaiting_buyer" && o.snapshot.approvalUrl && (
            <a className="rc-button" href={o.snapshot.approvalUrl}>
              Continue to PayPal
              <ArrowUpRight size={16} />
            </a>
          )}
          {["creating", "awaiting_buyer"].includes(o.state) && (
            <button
              className="rc-link"
              disabled={!!busy}
              onClick={() =>
                run("Canceling checkout", async () =>
                  setOrder(await api(`/orders/${id}/cancel${query}`, {})),
                )
              }
            >
              Cancel checkout
            </button>
          )}
        </div>
      </section>
      <button
        className="rc-link"
        onClick={() => go(o.shopUrl || "/restorecart/shops")}
      >
        Back to shop
        <ArrowRight size={16} />
      </button>
    </main>
  );
}
