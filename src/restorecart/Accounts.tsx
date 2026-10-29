import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { OrderProgress } from "./OrderProgress";

type Props = {
  api: (path: string, body?: any, method?: string) => Promise<any>;
  run: (label: string, fn: () => Promise<any>) => Promise<void>;
  busy: string;
  go: (url: string) => void;
  onAuthenticated: () => Promise<void>;
  role: "buyer" | "seller";
};
export function AccountForm(p: Props) {
  const [register, setRegister] = useState(false),
    [identifier, setIdentifier] = useState(""),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState("");
  return (
    <motion.div
      className="rc-signin"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2>
        {register ? "Create your " + p.role + " account" : "Welcome back."}
      </h2>
      <p>
        {p.role === "seller"
          ? "Your own catalog, rescue kits and orders."
          : "Keep your carts and purchases together."}
      </p>
      <div className="rc-account-tabs" aria-label="Account action">
        <button
          className="rc-link"
          aria-pressed={!register}
          onClick={() => setRegister(false)}
        >
          Sign in
        </button>
        <button
          className="rc-link"
          aria-pressed={register}
          onClick={() => setRegister(true)}
        >
          Register
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          p.run(register ? "Creating account" : "Signing in", async () => {
            await p.api(
              register ? "/register" : "/login",
              register
                ? { email: identifier, username, password, role: p.role }
                : { email: identifier, password },
            );
            setPassword("");
            await p.onAuthenticated();
          });
        }}
      >
        <label>
          {register ? "Email" : "Email or username"}
          <input
            type={register ? "email" : "text"}
            autoComplete={register ? "email" : "username"}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            maxLength={200}
          />
        </label>
        {register && (
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={40}
              pattern="[a-z0-9][a-z0-9_-]{2,39}"
              title="3–40 lowercase letters, numbers, underscores or hyphens"
            />
          </label>
        )}
        <label>
          Password
          <input
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={register ? 10 : undefined}
            maxLength={200}
          />
        </label>
        {register && (
          <p>
            Use at least 10 characters. This prototype has no email verification
            or password reset yet.
          </p>
        )}
        <button className="rc-button" disabled={!!p.busy}>
          {p.busy || (register ? "Create " + p.role + " account" : "Sign in")}
        </button>
      </form>
      <a
        href={
          p.role === "seller"
            ? "/restorecart/account"
            : "/restorecart/seller/sign-in"
        }
      >
        {p.role === "seller"
          ? "Here to buy? Buyer sign-in"
          : "Here to sell? Seller sign-in"}
      </a>
    </motion.div>
  );
}
export function BuyerAccount(p: Props & { user: any }) {
  const [orders, setOrders] = useState<any[]>([]),
    [carts, setCarts] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (!p.user) return;
    let alive = true;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      Promise.all([p.api("/my-orders"), p.api("/my-carts")])
        .then(([orders, carts]) => {
          if (alive) {
            setOrders(orders);
            setCarts(carts);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [p.user?.id]);
  return (
    <main className="rc-account-page">
      {p.user ? (
        <>
          <span className="rc-eyebrow">YOUR ACCOUNT</span>
          <h1>Your orders</h1>
          <p>{p.user.email}</p>
          <a className="rc-button" href="/restorecart/shops">
            Continue shopping →
          </a>
          {p.user.role === "seller" && (
            <p>
              <a href="/restorecart/seller">Open your seller workspace →</a>
            </p>
          )}
          <h2>Your purchases</h2>
          <p>
            Pickup status updates automatically every 15 seconds. This prototype
            supports collection, not delivery tracking.
          </p>
          {error && <p role="alert">{error}</p>}
          {orders.length ? (
            orders.map((o) => (
              <article className="rc-panel" key={o.id}>
                <h3>{o.shopName}</h3>
                <OrderProgress order={o} />
                <p>
                  {o.state} · {o.fulfillment} · ${(o.amount / 100).toFixed(2)}{" "}
                  USD
                  {o.refunded > 0
                    ? ` · Refunded $${(o.refunded / 100).toFixed(2)}`
                    : ""}
                </p>
                <a href={o.receiptUrl}>View order {o.id.slice(-8)} →</a>
              </article>
            ))
          ) : (
            <p>
              No purchases yet. Your orders will appear here after checkout.
            </p>
          )}
        </>
      ) : (
        <AccountForm {...p} />
      )}
    </main>
  );
}
