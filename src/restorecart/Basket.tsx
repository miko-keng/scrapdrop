import { useEffect, useState } from "react";
import { ShoppingBasket, Package, Trash2, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
type Props = {
  api: (path: string, body?: any, method?: string) => Promise<any>;
  run: (label: string, fn: () => Promise<any>) => Promise<void>;
  busy: string;
  ready: boolean;
  go: (path: string) => void;
};
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n / 100,
  );
export function Basket(p: Props) {
  const [basket, setBasket] = useState<any>(null),
    [error, setError] = useState("");
  async function load() {
    setBasket(await p.api("/basket"));
  }
  useEffect(() => {
    let alive = true;
    p.api("/basket")
      .then((b) => {
        if (alive) setBasket(b);
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
    };
  }, []);
  function change(shop: any, sku: string, quantity: number) {
    p.run("Updating basket", async () => {
      const quantities = Object.fromEntries(
        shop.lines.map((l: any) => [
          l.sku,
          l.sku === sku ? quantity : l.quantity,
        ]),
      );
      await p.api(
        `/shops/${encodeURIComponent(shop.slug)}/cart`,
        { quantities, requestKey: crypto.randomUUID() },
        "PUT",
      );
      await load();
    });
  }
  return (
    <main className="rc-basket-page">
      <div className="rc-basket-heading">
        <div>
          <span className="rc-eyebrow">READY WHEN YOU ARE</span>
          <h1>Your basket</h1>
          <p>
            {basket?.units || 0} items · {money(basket?.total || 0)} USD
          </p>
        </div>
        <a href="/restorecart/shops">Continue shopping →</a>
      </div>
      {error && <p role="alert">{error}</p>}
      {!basket && !error ? (
        <p role="status">Loading your basket…</p>
      ) : basket && !basket.shops.length ? (
        <section className="rc-panel rc-basket-empty">
          <ShoppingBasket size={45} />
          <h2>Your basket is empty.</h2>
          <p>Find something you like and add it here.</p>
          <a className="rc-button" href="/restorecart/shops">
            Explore products <ArrowRight size={18} />
          </a>
        </section>
      ) : (
        basket?.shops.map((shop: any) => (
          <motion.section
            className="rc-panel rc-basket-group"
            key={shop.slug}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <header>
              <h2>
                <a href={`/s/${shop.slug}`}>{shop.name}</a>
              </h2>
              <span>
                {shop.state === "live" ? "Pickup only" : "Closed to new orders"}
              </span>
            </header>
            {shop.lines.map((line: any) => (
              <div className="rc-basket-item" key={line.sku}>
                <a
                  className="rc-basket-thumb"
                  aria-label={`View ${line.name}`}
                  href={`/s/${shop.slug}#product-${encodeURIComponent(line.sku)}`}
                >
                  {line.imageSourceId ? (
                    <img
                      src={`/api/restorecart/shops/${encodeURIComponent(shop.slug)}/images/${encodeURIComponent(line.imageSourceId)}`}
                      alt={line.name}
                    />
                  ) : (
                    <Package size={30} />
                  )}
                </a>
                <div>
                  <h3>
                    <a
                      href={`/s/${shop.slug}#product-${encodeURIComponent(line.sku)}`}
                    >
                      {line.name}
                    </a>
                  </h3>
                  <p>{money(line.unitCents)} each</p>
                  {line.quantity > line.available && (
                    <p className="rc-warning">
                      Only {line.available} available. Update your quantity
                      before checkout.
                    </p>
                  )}
                  <label>
                    Quantity{" "}
                    <select
                      aria-label={`Quantity for ${line.name} from ${shop.name}`}
                      value={line.quantity}
                      disabled={!!p.busy}
                      onChange={(e) =>
                        change(shop, line.sku, Number(e.target.value))
                      }
                    >
                      {Array.from(
                        {
                          length: Math.max(
                            1,
                            Math.min(
                              100,
                              Math.max(line.available, line.quantity),
                            ),
                          ),
                        },
                        (_, i) => (
                          <option value={i + 1} key={i}>
                            {i + 1}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <button
                    className="rc-link"
                    aria-label={`Remove ${line.name} from ${shop.name}`}
                    disabled={!!p.busy}
                    onClick={() => change(shop, line.sku, 0)}
                  >
                    <Trash2 size={15} /> Remove
                  </button>
                </div>
                <strong>{money(line.unitCents * line.quantity)}</strong>
              </div>
            ))}
            <footer>
              <p>
                <Package size={17} /> {shop.pickup}
              </p>
              <div>
                <span>
                  Seller subtotal <strong>{money(shop.total)}</strong>
                </span>
                <button
                  className="rc-button"
                  disabled={
                    !!p.busy ||
                    !p.ready ||
                    shop.state !== "live" ||
                    shop.lines.some((l: any) => l.quantity > l.available)
                  }
                  onClick={() =>
                    p.run("Reserving your items", async () => {
                      const order = await p.api(
                        `/shops/${encodeURIComponent(shop.slug)}/orders`,
                        {
                          requestKey: shop.requestKey,
                          revision: shop.revision,
                          lines: shop.lines.map((l: any) => ({
                            sku: l.sku,
                            quantity: l.quantity,
                          })),
                        },
                      );
                      await p.api(
                        `/shops/${encodeURIComponent(shop.slug)}/cart`,
                        { quantities: {}, requestKey: crypto.randomUUID() },
                        "PUT",
                      );
                      if (order.snapshot.approvalUrl)
                        location.assign(order.snapshot.approvalUrl);
                      else p.go(order.receiptUrl);
                    })
                  }
                >
                  Checkout with PayPal <ArrowRight size={17} />
                </button>
              </div>
            </footer>
          </motion.section>
        ))
      )}
      {basket?.shops.length > 0 && (
        <p className="rc-basket-note">
          Checkout is separate for each seller. Saving items does not reserve
          stock. PayPal sandbox uses test funds.
        </p>
      )}
    </main>
  );
}
