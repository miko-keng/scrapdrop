/** Public catalog metadata and keyword search. Never pass private draft records here. */
export type DirectoryProduct = {
  sku: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  imageSourceId?: string;
  available: number;
  categories: string[];
};
export type DirectoryShop = {
  slug: string;
  name: string;
  description: string;
  categories: string[];
  productCount: number;
  availableProductCount: number;
  preview: { sku: string; name: string; imageSourceId?: string } | null;
  products: DirectoryProduct[];
};
const groups = [
  {
    label: "Home & kitchen",
    words:
      /\b(mug|cup|plate|bowl|ceramic|stoneware|kitchen|candle|vase|homeware)s?\b/,
  },
  {
    label: "Bags & accessories",
    words:
      /\b(tote|bag|backpack|purse|wallet|jewellery|jewelry|accessor(?:y|ies))s?\b/,
  },
  {
    label: "Food & drink",
    words:
      /\b(food|bread|cake|cookie|chocolate|snack|coffee|tea|juice|vegetable|fruit|pastry|meal)s?\b/,
  },
  {
    label: "Clothing",
    words: /\b(shirt|dress|jacket|trouser|sock|hoodie|clothing|apparel)s?\b/,
  },
  {
    label: "Art & stationery",
    words: /\b(print|painting|notebook|stationery|sticker|bookmark|card)s?\b/,
  },
];
export function productCategories(product: {
  name: string;
  description: string;
}) {
  const text = `${product.name} ${product.description}`.toLowerCase();
  const found = groups.filter((g) => g.words.test(text)).map((g) => g.label);
  return found.length ? found : ["General goods"];
}
export function shopDescription(products: { name: string }[]) {
  const names = products.slice(0, 3).map((p) => p.name);
  return names.length
    ? `Discover ${names.join(", ")}${products.length > 3 ? " and more" : ""}.`
    : "Explore this shop’s published collection.";
}
function tokens(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : word,
    );
}
function keywords(text: string) {
  const words = new Set(tokens(text));
  // Tote and tote bag are common names for the same product type.
  if (words.has("tote")) words.add("bag");
  return words;
}
export function searchDirectory(shops: DirectoryShop[], query: string) {
  const terms = tokens(query);
  const matches = (text: string) => {
    const haystack = keywords(text);
    return terms.every((term) =>
      [...haystack].some((word) => word.startsWith(term)),
    );
  };
  const products = shops
    .flatMap((shop) =>
      shop.products
        .filter((p) =>
          matches(
            `${p.name} ${p.description} ${p.sku} ${p.categories.join(" ")} ${shop.name}`,
          ),
        )
        .map((product) => ({ shop, product })),
    )
    .sort((a, b) => {
      const score = (p: DirectoryProduct) =>
        terms.reduce((n, t) => n + (keywords(p.name).has(t) ? 2 : 0), 0);
      return (
        score(b.product) - score(a.product) ||
        Number(b.product.available > 0) - Number(a.product.available > 0)
      );
    });
  return {
    products,
    shops: shops.filter(
      (s) =>
        matches(`${s.name} ${s.description} ${s.categories.join(" ")}`) ||
        products.some((p) => p.shop.slug === s.slug),
    ),
  };
}

export type ProductSort = "relevance" | "price-asc" | "price-desc" | "name";
export function browseProducts(
  shops: DirectoryShop[],
  query: string,
  options: {
    sort?: ProductSort;
    category?: string;
    inStock?: boolean;
  } = {},
) {
  const products = searchDirectory(shops, query).products.filter(
    ({ product }) =>
      (!options.category || product.categories.includes(options.category)) &&
      (!options.inStock || product.available > 0),
  );
  if (options.sort && options.sort !== "relevance") {
    products.sort((a, b) => {
      const nameOrder =
        a.product.name.localeCompare(b.product.name) ||
        a.shop.name.localeCompare(b.shop.name) ||
        a.product.sku.localeCompare(b.product.sku);
      if (options.sort === "name") return nameOrder;
      // Catalog currently supports USD only. Never compare unlike currencies as if equal.
      return (
        a.product.currency.localeCompare(b.product.currency) ||
        (Number(a.product.price) - Number(b.product.price)) *
          (options.sort === "price-desc" ? -1 : 1) ||
        nameOrder
      );
    });
  }
  return products;
}
