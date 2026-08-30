import "server-only";
import { redirect } from "next/navigation";
import {
  requireMerchantAdmin,
  ForbiddenError,
  UnauthorizedError,
  type SessionContext,
} from "@/auth/session";

/**
 * Role gate for every /merchant page.
 *
 * Called inside each page, not only in the layout: ARCHITECTURE §7 says
 * authorization happens on the server and route-level protection is never
 * trusted alone. `proxy.ts` forces sign-in for /merchant(.*), the layout renders
 * the shell, and this is what actually decides whether the data may be read.
 *
 * A signed-in customer is bounced to the storefront rather than shown an error —
 * being the wrong role is not a fault they can fix.
 */
export async function guardMerchantPage(): Promise<SessionContext> {
  try {
    return await requireMerchantAdmin();
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthorizedError) {
      redirect("/shop");
    }
    throw error;
  }
}
