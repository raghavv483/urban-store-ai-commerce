import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resolveSessionContext, resolveSessionContextSafely } from "./session";
import { seed } from "@/db/seed";
import { MERCHANT_SLUG } from "@/db/seed-data";
import { env } from "@/lib/env";

const CUSTOMER_CLERK_ID = "test_clerk_customer";
const ADMIN_CLERK_ID = "test_clerk_admin";

beforeAll(async () => {
  await seed();
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { clerkId: { in: [CUSTOMER_CLERK_ID, ADMIN_CLERK_ID] } },
  });
  await prisma.$disconnect();
});

describe("resolveSessionContext", () => {
  it("returns null when there is no signed-in user", async () => {
    const ctx = await resolveSessionContext(null, async () => null);
    expect(ctx).toBeNull();
  });

  it("creates a local user row on first sign-in and defaults to customer", async () => {
    const ctx = await resolveSessionContext(CUSTOMER_CLERK_ID, async () => ({
      id: CUSTOMER_CLERK_ID,
      primaryEmail: "shopper@example.com",
    }));

    expect(ctx).not.toBeNull();
    expect(ctx!.role).toBe("customer");
    expect(ctx!.email).toBe("shopper@example.com");

    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { slug: MERCHANT_SLUG } });
    expect(ctx!.merchantId).toBe(merchant.id);
  });

  it("promotes the configured merchant admin email to merchant_admin", async () => {
    // `users.email` is unique. Once a real person has signed up with
    // MERCHANT_ADMIN_EMAIL, inventing a second clerkId for that same address hits
    // a P2002 and this test fails on real data rather than on a defect. Reuse the
    // existing identity when there is one — the assertion is about the role the
    // email earns, not about which clerkId carries it.
    const existing = await prisma.user.findUnique({
      where: { email: env.MERCHANT_ADMIN_EMAIL },
      select: { clerkId: true },
    });
    const clerkId = existing?.clerkId ?? ADMIN_CLERK_ID;

    const ctx = await resolveSessionContext(clerkId, async () => ({
      id: clerkId,
      primaryEmail: env.MERCHANT_ADMIN_EMAIL,
    }));

    expect(ctx!.role).toBe("merchant_admin");
  });

  it("is idempotent — a second sign-in reuses the same user row", async () => {
    const first = await resolveSessionContext(CUSTOMER_CLERK_ID, async () => ({
      id: CUSTOMER_CLERK_ID,
      primaryEmail: "shopper@example.com",
    }));
    const second = await resolveSessionContext(CUSTOMER_CLERK_ID, async () => ({
      id: CUSTOMER_CLERK_ID,
      primaryEmail: "shopper@example.com",
    }));

    expect(second!.userId).toBe(first!.userId);
    const count = await prisma.user.count({ where: { clerkId: CUSTOMER_CLERK_ID } });
    expect(count).toBe(1);
  });

  it("returns null when Clerk has a session but no email on the user", async () => {
    const ctx = await resolveSessionContext("test_clerk_noemail", async () => ({
      id: "test_clerk_noemail",
      primaryEmail: null,
    }));
    expect(ctx).toBeNull();
  });
});

describe("resolveSessionContextSafely", () => {
  it("degrades to null and logs instead of propagating when resolveSessionContext throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("simulated syncUser failure (e.g. missing merchant or P2002)");

    const ctx = await resolveSessionContextSafely("test_clerk_boom", async () => {
      throw failure;
    });

    expect(ctx).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]).toContain(failure);

    consoleError.mockRestore();
  });

  it("behaves exactly like resolveSessionContext on the happy path", async () => {
    const ctx = await resolveSessionContextSafely(CUSTOMER_CLERK_ID, async () => ({
      id: CUSTOMER_CLERK_ID,
      primaryEmail: "shopper@example.com",
    }));

    expect(ctx).not.toBeNull();
    expect(ctx!.role).toBe("customer");
  });
});
