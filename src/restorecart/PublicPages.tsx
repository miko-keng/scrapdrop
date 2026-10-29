import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  FolderOpen,
  Package,
  Search,
  ShoppingBag,
  Store,
} from "lucide-react";
import "./public.css";

import {
  browseProducts,
  type ProductSort,
  type DirectoryShop,
  type DirectoryProduct,
} from "./directory";

export function EntryPage() {
  return (
    <main className="rc-entry">
      <div className="rc-eyebrow">ONE LITTLE BUSINESS. TWO WAYS IN.</div>
      <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        Good things keep going<span>.</span>
      </motion.h1>
      <p className="rc-entry-lede">
        A temporary home for small businesses and the people who love them.
        Choose where you’d like to go.
      </p>
      <div className="rc-entry-cards">
        <motion.a
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          href="/restorecart/shops"
          className="rc-entry-card buyer"
        >
          <span className="rc-entry-icon">
            <ShoppingBag size={29} />
          </span>
          <span className="rc-eyebrow">FOR BUYERS</span>
          <h2>I’m here to shop.</h2>
          <p>
            Discover published rescue shops, find your favorites and check out
            with PayPal sandbox.
          </p>
          <span className="rc-entry-action">
            Browse rescue shops
            <ArrowRight size={20} />
          </span>
          <small>Public storefronts · No RestoreCart sign-in needed</small>
        </motion.a>
        <motion.a
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          href="/restorecart/seller"
          className="rc-entry-card seller"
        >
          <span className="rc-entry-icon">
            <Store size={29} />
          </span>
          <span className="rc-eyebrow">FOR SELLERS</span>
          <h2>I’m keeping my shop going.</h2>
          <p>
            Upload your files, check product details and publish a rescue shop.
            Manage every order in your workspace.
          </p>
          <span className="rc-entry-action">
            Open seller workspace
            <ArrowUpRight size={20} />
          </span>
          <small>Seller sign-in required · Uploads stay private</small>
        </motion.a>
      </div>
      <div className="rc-entry-note">
        <FolderOpen size={19} />
        <span>
          One project connects both sides. Sellers publish; buyers see only the
          published shop.
        </span>
      </div>
    </main>
  );
}

export function ShopDirectory({
  loadShops,
  renderArt,
  addToBasket,
  busy = false,
}: {
  loadShops: () => Promise<DirectoryShop[]>;
  addToBasket?: (slug: string, sku: string) => Promise<any>;
  busy?: boolean;
  renderArt: (shop: DirectoryShop, product?: DirectoryProduct) => ReactNode;
}) {
  const initial = new URLSearchParams(location.search);
  const [shops, setShops] = useState<DirectoryShop[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(() => initial.get("q") || "");
  const [sort, setSort] = useState<ProductSort>(() => {
    const value = initial.get("sort");
    return value === "price-asc" || value === "price-desc" || value === "name"
      ? value
      : "relevance";
  });
  const [category, setCategory] = useState(() => initial.get("category") || "");
  const [inStock, setInStock] = useState(() => initial.get("stock") === "1");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setError("");
    loadShops()
      .then((s) => {
        if (alive) setShops(s);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (sort !== "relevance") params.set("sort", sort);
    if (category) params.set("category", category);
    if (inStock) params.set("stock", "1");
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${params.size ? `?${params}` : ""}`,
    );
  }, [query, sort, category, inStock]);
  const products = browseProducts(shops || [], query, {
    sort,
    category,
    inStock,
  });
  const categories = [
    ...new Set((shops || []).flatMap((s) => s.categories)),
  ].sort();
  const price = (p: DirectoryProduct) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: p.currency,
    }).format(Number(p.price));
  const reset = () => {
    setQuery("");
    setCategory("");
    setInStock(false);
    setSort("relevance");
  };
  return (
    <main className="rc-directory rc-product-browser">
      <div className="rc-browse-intro">
        <div>
          <div className="rc-eyebrow">GOOD THINGS. STILL HERE.</div>
          <h1>
            Find your next <em>little favorite.</em>
          </h1>
          <p>
            Shop published collections from businesses keeping things moving.
          </p>
        </div>
        <span className="rc-browse-assurance">
          <ShoppingBag size={17} /> Pickup only · PayPal sandbox
        </span>
      </div>
      <label className="rc-shop-search">
        <Search size={20} />
        <span className="rc-sr">Search shops and products</span>
        <input
          type="search"
          aria-label="Search shops and products"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products, categories or shops…"
        />
      </label>
      <div className="rc-browse-toolbar">
        <label className="rc-browse-select">
          Category
          <select
            aria-label="Product category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {category && !categories.includes(category) && (
              <option value={category}>{category}</option>
            )}
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="rc-stock-filter">
          <input
            type="checkbox"
            checked={inStock}
            onChange={(e) => setInStock(e.target.checked)}
          />{" "}
          In stock only
        </label>
        <label className="rc-browse-select rc-sort-select">
          Sort by
          <select
            aria-label="Sort products"
            value={sort}
            onChange={(e) => setSort(e.target.value as ProductSort)}
          >
            <option value="relevance">Best match</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="name">Name: A–Z</option>
          </select>
        </label>
      </div>
      {error ? (
        <section className="rc-panel rc-directory-empty" role="alert">
          <h2>We couldn’t load the products.</h2>
          <p>{error}</p>
          <button
            className="rc-button secondary"
            onClick={() => setAttempt(attempt + 1)}
          >
            Try again
          </button>
        </section>
      ) : !shops ? (
        <p role="status">Opening the product collections…</p>
      ) : (
        <>
          <div className="rc-browse-results-heading">
            <h2>
              {query.trim()
                ? `Results for “${query.trim()}”`
                : "Explore products"}
            </h2>
            <p role="status" aria-live="polite">
              {products.length} product{products.length === 1 ? "" : "s"}
            </p>
          </div>
          {!products.length ? (
            <section className="rc-panel rc-directory-empty">
              <Package size={35} />
              <h2>No matching products.</h2>
              <p>
                {query || category || inStock
                  ? "Try another keyword or clear the filters to see more products."
                  : "Products appear here once a seller publishes their collection."}
              </p>
              {(query || category || inStock) && (
                <button className="rc-link" onClick={reset}>
                  Clear search & filters <ArrowRight size={16} />
                </button>
              )}
            </section>
          ) : (
            <div className="rc-directory-grid rc-market-grid">
              {products.map(({ shop, product }, index) => {
                const productUrl = `/s/${encodeURIComponent(shop.slug)}#${encodeURIComponent(`product-${product.sku}`)}`;
                return (
                  <motion.article
                    key={`${shop.slug}-${product.sku}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.03, 0.15) }}
                    className="rc-market-card"
                  >
                    <a
                      href={productUrl}
                      className="rc-market-image"
                      aria-label={`View ${product.name} from ${shop.name}`}
                    >
                      {renderArt(shop, product)}
                    </a>
                    <div className="rc-market-details">
                      <a
                        className="rc-market-shop"
                        href={`/s/${encodeURIComponent(shop.slug)}`}
                        aria-label={`Visit ${shop.name}`}
                      >
                        <Store size={16} />
                        <span>
                          <small>SHOP</small>
                          {shop.name}
                        </span>
                        <ArrowUpRight size={15} />
                      </a>
                      <h3>
                        <a href={productUrl}>{product.name}</a>
                      </h3>
                      <strong className="rc-market-price">
                        {price(product)} <small>{product.currency}</small>
                      </strong>
                      <p className="rc-market-description">
                        {product.description}
                      </p>
                      <div className="rc-category-tags">
                        {product.categories.map((c) => (
                          <span key={c}>{c}</span>
                        ))}
                      </div>
                      <div className="rc-market-bottom">
                        <span
                          className={
                            product.available
                              ? "rc-stock-available"
                              : "rc-stock-unavailable"
                          }
                        >
                          {product.available > 0
                            ? `${product.available} available`
                            : "Sold out"}
                        </span>
                        <a href={productUrl}>
                          View item <ArrowRight size={15} />
                        </a>
                      </div>
                      {addToBasket && (
                        <button
                          className="rc-button secondary rc-market-add"
                          disabled={busy || product.available <= 0}
                          onClick={() => addToBasket(shop.slug, product.sku)}
                          aria-label={`Add ${product.name} from ${shop.name} to basket`}
                        >
                          <ShoppingBag size={17} /> Add to basket
                        </button>
                      )}
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
        </>
      )}
      <a href="/restorecart" className="rc-link rc-directory-home">
        Back to RestoreCart <ArrowRight size={16} />
      </a>
    </main>
  );
}
