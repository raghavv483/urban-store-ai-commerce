// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductCard } from "./product-card";
import type { ProductListItem } from "@/types/product";

const product: ProductListItem = {
  id: "p1",
  slug: "thinkpad-x",
  name: "ThinkPad X",
  category: "Laptops",
  priceInPaise: 7_499_900,
  stock: 12,
  imageUrl: null,
};

describe("ProductCard", () => {
  it("renders the name and the formatted price", () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText("ThinkPad X")).toBeDefined();
    expect(screen.getByText("₹74,999")).toBeDefined();
  });

  it("links to the product detail page", () => {
    render(<ProductCard product={product} />);
    const link = screen.getByRole("link", { name: /thinkpad x/i });
    expect(link.getAttribute("href")).toBe("/shop/thinkpad-x");
  });

  it("shows an in-stock indicator when stock is available", () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText(/12 in stock/i)).toBeDefined();
  });

  it("shows out of stock when stock is zero", () => {
    render(<ProductCard product={{ ...product, stock: 0 }} />);
    expect(screen.getByText(/out of stock/i)).toBeDefined();
  });
});
