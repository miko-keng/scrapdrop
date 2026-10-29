import test from "node:test";
import assert from "node:assert/strict";
import {
  searchDirectory,
  browseProducts,
  productCategories,
  shopDescription,
  type DirectoryShop,
} from "../src/restorecart/directory";
const shops: DirectoryShop[] = [
  {
    slug: "studio",
    name: "Sunday Studio",
    description: "Mugs and cotton totes.",
    categories: ["Home & kitchen", "Bags & accessories"],
    productCount: 2,
    availableProductCount: 2,
    preview: { sku: "mug", name: "Blue mug" },
    products: [
      {
        sku: "mug",
        name: "Blue mug",
        description: "Stoneware cup",
        price: "20.00",
        currency: "USD",
        available: 1,
        categories: ["Home & kitchen"],
      },
      {
        sku: "tote",
        name: "Natural tote",
        description: "Everyday cotton carryall",
        price: "12.00",
        currency: "USD",
        available: 2,
        categories: ["Bags & accessories"],
      },
    ],
  },
  {
    slug: "bakery",
    name: "Bread Corner",
    description: "Fresh sourdough bread.",
    categories: ["Food & drink"],
    productCount: 1,
    availableProductCount: 0,
    preview: null,
    products: [
      {
        sku: "bread",
        name: "Sourdough loaf",
        description: "Fresh baked bread",
        price: "6.00",
        currency: "USD",
        available: 0,
        categories: ["Food & drink"],
      },
    ],
  },
];
test("RestoreCart directory searches every product, including non-preview totes", () => {
  for (const query of [
    "tote",
    "TOTE",
    " tote bag ",
    "bags",
    "cotton",
    "natural to",
  ]) {
    const result = searchDirectory(shops, query);
    assert.deepEqual(
      result.products.map((p) => p.product.sku),
      ["tote"],
      query,
    );
    assert.equal(result.products[0].shop.name, "Sunday Studio");
    assert.equal(result.products[0].product.price, "12.00");
  }
});
test("RestoreCart directory keyword results preserve shop identity, categories and sold-out state", () => {
  assert.deepEqual(
    searchDirectory(shops, "mugs").products.map((p) => p.product.sku),
    ["mug"],
  );
  assert.equal(searchDirectory(shops, "Sunday Studio").products.length, 2);
  assert.equal(searchDirectory(shops, "food").products[0].shop.slug, "bakery");
  assert.equal(
    searchDirectory(shops, "sourdough").products[0].product.available,
    0,
  );
  assert.equal(searchDirectory(shops, "blue tote").products.length, 0);
  assert.equal(searchDirectory(shops, "no-such-product").shops.length, 0);
  assert.equal(searchDirectory(shops, " ").shops.length, 2);
});
test("RestoreCart directory derives category labels from published product text with a neutral fallback", () => {
  assert.deepEqual(
    productCategories({ name: "Natural tote", description: "Cotton" }),
    ["Bags & accessories"],
  );
  assert.deepEqual(
    productCategories({ name: "Blue mug", description: "Stoneware" }),
    ["Home & kitchen"],
  );
  assert.deepEqual(
    productCategories({ name: "Bread loaf", description: "Fresh" }),
    ["Food & drink"],
  );
  assert.deepEqual(
    productCategories({ name: "Unknown object", description: "" }),
    ["General goods"],
  );
  assert.match(shopDescription(shops[0].products), /Natural tote/);
});

test("RestoreCart product browsing sorts numeric prices in both directions without losing results", () => {
  const before = JSON.stringify(shops);
  assert.deepEqual(
    browseProducts(shops, "", { sort: "price-asc" }).map(
      (p) => p.product.price,
    ),
    ["6.00", "12.00", "20.00"],
  );
  assert.deepEqual(
    browseProducts(shops, "", { sort: "price-desc" }).map(
      (p) => p.product.price,
    ),
    ["20.00", "12.00", "6.00"],
  );
  assert.deepEqual(
    browseProducts(shops, "", { sort: "name" }).map((p) => p.product.sku),
    ["mug", "tote", "bread"],
  );
  assert.equal(browseProducts(shops, "", { sort: "relevance" }).length, 3);
  assert.equal(JSON.stringify(shops), before);
});
test("RestoreCart product browsing combines search, category and real stock filters", () => {
  assert.equal(browseProducts(shops, "", { inStock: true }).length, 2);
  assert.equal(
    browseProducts(shops, "", { category: "Food & drink", inStock: true })
      .length,
    0,
  );
  assert.deepEqual(
    browseProducts(shops, "bag", {
      category: "Bags & accessories",
      inStock: true,
      sort: "price-asc",
    }).map((p) => p.product.sku),
    ["tote"],
  );
  assert.equal(
    browseProducts(shops, "mug", { category: "Food & drink" }).length,
    0,
  );
});
