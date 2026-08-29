import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Db = Prisma.TransactionClient | typeof prisma;

export type PricedLine = {
  productId: string;
  slug: string;
  name: string;
  quantity: number;
  /** The AUTHORITATIVE unit price: read from products at checkout time. */
  unitPriceInPaise: number;
  /** What the cart recorded when the item was added. Kept for drift reporting only. */
  priceAtAddInPaise: number;
  stock: number;
};

export type PricedCart = {
  cartId: string;
  merchantId: string;
  customerId: string | null;
  lines: PricedLine[];
  subtotalInPaise: number;
  totalInPaise: number;
  /** True when a live product price differs from what the cart recorded. */
  priceDrift: boolean;
};

export class CartError extends Error {
  constructor(
    message: string,
    readonly code:
      | "CART_NOT_FOUND"
      | "CART_EMPTY"
      | "CART_NOT_ACTIVE"
      | "PRODUCT_UNAVAILABLE",
  ) {
    super(message);
    this.name = "CartError";
  }
}

export class InventoryError extends Error {
  constructor(
    message: string,
    readonly shortfalls: Array<{ slug: string; requested: number; available: number }>,
  ) {
    super(message);
    this.name = "InventoryError";
  }
}

/**
 * Spine steps 2 + 3 — fetch the cart and compute the authoritative total.
 *
 * The total is derived ONLY from rows in this database: quantity from `cart_items`
 * and unit price from `products`. No caller-supplied amount is accepted anywhere in
 * this file, and there is deliberately no `amount` parameter to pass one in.
 * If a buyer or an agent says "charge ₹1" and the cart is ₹74,999, this returns
 * ₹74,999 (CLAUDE.md safety rule 1).
 *
 * Unit price comes from the LIVE product row rather than `cart_items.price_at_time_paise`,
 * because the snapshot is writable by whoever added the item and can go stale. The
 * snapshot is still returned so callers can report price drift to the buyer.
 *
 * `merchantId` is a required first argument and is always in the where clause
 * (CLAUDE.md safety rule 6).
 */
export async function priceCart(
  db: Db,
  merchantId: string,
  cartId: string,
): Promise<PricedCart> {
  const cart = await db.cart.findFirst({
    where: { id: cartId, merchantId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              slug: true,
              name: true,
              priceInPaise: true,
              stock: true,
              active: true,
              merchantId: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!cart) {
    throw new CartError(`Cart ${cartId} not found for this merchant.`, "CART_NOT_FOUND");
  }
  if (cart.status !== "active") {
    throw new CartError(
      `Cart ${cartId} is ${cart.status}, not active.`,
      "CART_NOT_ACTIVE",
    );
  }
  if (cart.items.length === 0) {
    throw new CartError(`Cart ${cartId} is empty.`, "CART_EMPTY");
  }

  const lines: PricedLine[] = [];
  let priceDrift = false;

  for (const item of cart.items) {
    const p = item.product;

    // A product from another merchant, or a delisted one, must never be priced.
    if (p.merchantId !== merchantId || !p.active) {
      throw new CartError(
        `Product ${p.slug} is not available for purchase.`,
        "PRODUCT_UNAVAILABLE",
      );
    }
    if (item.quantity <= 0) {
      throw new CartError(
        `Cart line for ${p.slug} has a non-positive quantity.`,
        "PRODUCT_UNAVAILABLE",
      );
    }

    if (p.priceInPaise !== item.priceAtTimePaise) priceDrift = true;

    lines.push({
      productId: p.id,
      slug: p.slug,
      name: p.name,
      quantity: item.quantity,
      unitPriceInPaise: p.priceInPaise,
      priceAtAddInPaise: item.priceAtTimePaise,
      stock: p.stock,
    });
  }

  const subtotalInPaise = lines.reduce(
    (sum, l) => sum + l.unitPriceInPaise * l.quantity,
    0,
  );

  if (!Number.isSafeInteger(subtotalInPaise) || subtotalInPaise <= 0) {
    throw new CartError(
      `Computed a non-positive or unsafe total (${subtotalInPaise} paise).`,
      "CART_EMPTY",
    );
  }

  // Day 2 has no shipping, tax or discounts, so total === subtotal. Kept as a
  // separate field so those can be added without changing every caller.
  return {
    cartId: cart.id,
    merchantId: cart.merchantId,
    customerId: cart.customerId,
    lines,
    subtotalInPaise,
    totalInPaise: subtotalInPaise,
    priceDrift,
  };
}

/**
 * Spine step 4 — verify inventory. Throws with every shortfall listed, so the buyer
 * sees all problems at once rather than one per retry.
 */
export function verifyInventory(cart: PricedCart): void {
  const shortfalls = cart.lines
    .filter((l) => l.stock < l.quantity)
    .map((l) => ({ slug: l.slug, requested: l.quantity, available: l.stock }));

  if (shortfalls.length > 0) {
    const detail = shortfalls
      .map((s) => `${s.slug} (want ${s.requested}, have ${s.available})`)
      .join(", ");
    throw new InventoryError(`Not enough stock: ${detail}`, shortfalls);
  }
}
