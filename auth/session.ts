import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import type { UserRole } from "@prisma/client";
import { syncUser, type ClerkUserLike } from "./sync";

export type SessionContext = {
  userId: string;
  clerkId: string;
  email: string;
  merchantId: string;
  role: UserRole;
};

/**
 * Pure core: takes the Clerk id and a loader for the Clerk user, so it can be
 * tested without Next.js request context.
 */
export async function resolveSessionContext(
  clerkId: string | null,
  loadClerkUser: () => Promise<ClerkUserLike | null>,
): Promise<SessionContext | null> {
  if (!clerkId) return null;

  const clerkUser = await loadClerkUser();
  if (!clerkUser) return null;

  const user = await syncUser(clerkUser);
  if (!user) return null;

  return {
    userId: user.id,
    clerkId: user.clerkId,
    email: user.email,
    merchantId: user.merchantId,
    role: user.role,
  };
}

/**
 * Next.js-bound wrapper. Use this from server components and route handlers.
 * Wrapped in `cache` so repeated calls within a single render pass (e.g. the
 * header plus the page it wraps) hit the database once instead of re-running
 * the merchant lookup and user upsert on every call.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const { userId } = await auth();
  return resolveSessionContext(userId, async () => {
    const user = await currentUser();
    if (!user) return null;
    return {
      id: user.id,
      primaryEmail: user.primaryEmailAddress?.emailAddress ?? null,
    };
  });
});

export class UnauthorizedError extends Error {
  constructor(message = "You must be signed in to do that.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireSessionContext(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw new UnauthorizedError();
  return ctx;
}

export async function requireMerchantAdmin(): Promise<SessionContext> {
  const ctx = await requireSessionContext();
  if (ctx.role !== "merchant_admin") throw new ForbiddenError();
  return ctx;
}
