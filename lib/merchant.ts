import { cache } from "react";
import { prisma } from "@/lib/db";
import { MERCHANT_SLUG } from "@/db/seed-data";

/**
 * Resolves the storefront's merchant. Public pages have no session, so the
 * merchant comes from the store's own slug — never from a query parameter.
 * `cache` dedupes this within a single render pass.
 */
export const getStorefrontMerchantId = cache(async (): Promise<string> => {
  const merchant = await prisma.merchant.findUnique({
    where: { slug: MERCHANT_SLUG },
    select: { id: true },
  });

  if (!merchant) {
    throw new Error(
      `Storefront merchant "${MERCHANT_SLUG}" is missing. Run \`npm run db:seed\`.`,
    );
  }

  return merchant.id;
});
