import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { resolveSessionContext } from "./session";
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
    const ctx = await resolveSessionContext(ADMIN_CLERK_ID, async () => ({
      id: ADMIN_CLERK_ID,
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
