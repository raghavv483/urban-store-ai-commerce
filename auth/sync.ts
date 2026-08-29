import { Prisma } from "@prisma/client";
import type { User, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { MERCHANT_SLUG } from "@/db/seed-data";

/** The shape this module needs from Clerk — kept minimal so it is easy to fake in tests. */
export type ClerkUserLike = {
  id: string;
  primaryEmail: string | null;
};

/** Trims and lowercases an email so storage and comparison always agree. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function roleForEmail(email: string): UserRole {
  return normalizeEmail(email) === normalizeEmail(env.MERCHANT_ADMIN_EMAIL)
    ? "merchant_admin"
    : "customer";
}

/**
 * Just-in-time upsert of a Clerk identity into the local users table.
 * Returns null when the Clerk user has no usable email address.
 */
export async function syncUser(clerkUser: ClerkUserLike): Promise<User | null> {
  if (!clerkUser.primaryEmail) return null;

  const merchant = await prisma.merchant.findUnique({ where: { slug: MERCHANT_SLUG } });
  if (!merchant) {
    throw new Error(
      `Merchant "${MERCHANT_SLUG}" not found. Run \`npm run db:seed\` before signing in.`,
    );
  }

  // `users.email` is a case-sensitive unique index and `MERCHANT_ADMIN_EMAIL`
  // is not guaranteed to be trimmed, so normalize once here — the same
  // normalized value both decides the role and is what gets stored, so the
  // two can never disagree.
  const email = normalizeEmail(clerkUser.primaryEmail);
  const role = roleForEmail(email);

  try {
    return await prisma.user.upsert({
      where: { clerkId: clerkUser.id },
      update: { email, role },
      create: {
        clerkId: clerkUser.id,
        email,
        role,
        merchantId: merchant.id,
      },
    });
  } catch (error) {
    // `email` is also unique. If this Clerk identity's email changed to one
    // already held by a different local user row, the upsert hits a raw
    // Prisma P2002 instead of updating/creating cleanly. Surface a clear,
    // actionable message instead of leaking the Prisma error/stack trace.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error(
        `Cannot sync user: the email "${email}" is already in use by a different account.`,
      );
    }
    throw error;
  }
}
