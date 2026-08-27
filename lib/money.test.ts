import { describe, it, expect } from "vitest";
import { formatPaise, paiseToRupees } from "./money";

describe("formatPaise", () => {
  it("formats whole rupees without decimals", () => {
    expect(formatPaise(7_499_900)).toBe("₹74,999");
  });

  it("uses the Indian digit grouping", () => {
    // 10_000_000 paise = ₹100,000 (1 lakh), which Indian grouping renders
    // as "1,00,000" rather than the Western "100,000".
    expect(formatPaise(10_000_000)).toBe("₹1,00,000");
  });

  it("shows paise when the amount is not a whole rupee", () => {
    expect(formatPaise(129_950)).toBe("₹1,299.50");
  });

  it("formats zero", () => {
    expect(formatPaise(0)).toBe("₹0");
  });

  it("throws on a non-integer, since paise are always whole", () => {
    expect(() => formatPaise(1299.5)).toThrow(/integer/i);
  });
});

describe("paiseToRupees", () => {
  it("divides by one hundred", () => {
    expect(paiseToRupees(7_499_900)).toBe(74_999);
  });
});
