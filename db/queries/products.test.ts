import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { seed } from "@/db/seed";
import { MERCHANT_SLUG, SEED_PRODUCTS } from "@/db/seed-data";
import { listProducts, listCategories, getProductBySlug } from "./products";

const OTHER_SLUG = "test-rival-store";
let merchantId: string;
let otherMerchantId: string;

beforeAll(async () => {
  await seed();
  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { slug: MERCHANT_SLUG },
  });
  merchantId = merchant.id;

  const other = await prisma.merchant.upsert({
    where: { slug: OTHER_SLUG },
    update: {},
    create: { slug: OTHER_SLUG, name: "Rival Store" },
  });
  otherMerchantId = other.id;

  await prisma.product.upsert({
    where: {
      merchantId_slug: { merchantId: otherMerchantId, slug: "thinkpad-x" },
    },
    update: {},
    create: {
      merchantId: otherMerchantId,
      slug: "thinkpad-x",
      name: "Rival ThinkPad X",
      category: "Laptops",
      priceInPaise: 1_000_000,
      stock: 5,
      sku: "RIVAL-TPX",
    },
  });
});

afterAll(async () => {
  await prisma.merchant.delete({ where: { id: otherMerchantId } });
  await prisma.$disconnect();
});

describe("listProducts", () => {
  // Counts come from the seed rather than a literal: the point of these two is
  // merchant isolation and category filtering, not how big the catalogue is.
  it("returns only the requested merchant's products", async () => {
    const products = await listProducts(merchantId, {});
    expect(products).toHaveLength(SEED_PRODUCTS.length);
    expect(products.every((p) => p.name !== "Rival ThinkPad X")).toBe(true);
  });

  it("filters by category", async () => {
    const expected = SEED_PRODUCTS.filter(
      (p) => p.category === "Laptops",
    ).length;
    const laptops = await listProducts(merchantId, { category: "Laptops" });
    expect(laptops).toHaveLength(expected);
    expect(laptops.every((p) => p.category === "Laptops")).toBe(true);
  });

  it("searches by name, case-insensitively", async () => {
    const results = await listProducts(merchantId, { q: "thinkpad" });
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe("thinkpad-x");
  });

  it("returns an empty array when nothing matches, never throws", async () => {
    const results = await listProducts(merchantId, { q: "zzzznothing" });
    expect(results).toEqual([]);
  });

  it("excludes inactive products", async () => {
    try {
      await prisma.product.update({
        where: { merchantId_slug: { merchantId, slug: "wireless-mouse" } },
        data: { active: false },
      });
      const products = await listProducts(merchantId, {});
      expect(products.some((p) => p.slug === "wireless-mouse")).toBe(false);
    } finally {
      await prisma.product.update({
        where: { merchantId_slug: { merchantId, slug: "wireless-mouse" } },
        data: { active: true },
      });
    }
  });
});

describe("listCategories", () => {
  it("returns the merchant's distinct categories, sorted", async () => {
    const categories = await listCategories(merchantId);
    expect(categories).toEqual(["Accessories", "Audio", "Laptops", "Monitors"]);
  });
});

describe("getProductBySlug", () => {
  it("returns the product detail for the correct merchant", async () => {
    const product = await getProductBySlug(merchantId, "thinkpad-x");
    expect(product?.name).toBe("ThinkPad X");
    expect(product?.priceInPaise).toBe(7_499_900);
    expect(product?.specifications).toMatchObject({ ram: "16GB" });
  });

  it("does not return another merchant's product with the same slug", async () => {
    const product = await getProductBySlug(otherMerchantId, "thinkpad-x");
    expect(product?.name).toBe("Rival ThinkPad X");
  });

  it("returns null for an unknown slug rather than throwing", async () => {
    expect(await getProductBySlug(merchantId, "does-not-exist")).toBeNull();
  });

  it("returns null for a delisted (inactive) product", async () => {
    try {
      await prisma.product.update({
        where: { merchantId_slug: { merchantId, slug: "wireless-mouse" } },
        data: { active: false },
      });
      expect(await getProductBySlug(merchantId, "wireless-mouse")).toBeNull();
    } finally {
      await prisma.product.update({
        where: { merchantId_slug: { merchantId, slug: "wireless-mouse" } },
        data: { active: true },
      });
    }
  });
});
