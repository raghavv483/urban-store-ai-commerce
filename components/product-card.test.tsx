// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductCard } from "./product-card";
import type { ProductListItem } from "@/types/product";

// The card renders <AddToCart>, which calls useRouter() to re-read the server
// cart after a successful add. There is no app router mounted in a bare render,
// so stub it — these tests are about what the card displays, not about routing.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

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
    expect(screen.getByText(/^in stock$/i)).toBeDefined();
  });

  it("warns when stock is low rather than just saying in stock", () => {
    render(<ProductCard product={{ ...product, stock: 3 }} />);
    expect(screen.getByText(/only 3 left/i)).toBeDefined();
  });

  it("shows out of stock when stock is zero", () => {
    render(<ProductCard product={{ ...product, stock: 0 }} />);
    expect(screen.getByText(/out of stock/i)).toBeDefined();
  });
});
