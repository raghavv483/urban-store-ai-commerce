import { NextResponse } from "next/server";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { buildAgentCatalog } from "@/db/queries/agent-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Machine-readable catalog — Track 01's "agent-readable storefront".
 *
 * Deliberately unauthenticated: a storefront window is public, and an autonomous
 * buyer has to be able to discover the shop before it has any relationship with
 * it. Nothing here is private — the same data renders on /shop. Every mutating
 * endpoint under /api/agent does require a bearer key.
 *
 * The document itself is built by `buildAgentCatalog`, shared with the human
 * readable view at /agent-catalog so the two can never disagree.
 */
export async function GET() {
  try {
    const merchantId = await getStorefrontMerchantId();
    const catalog = await buildAgentCatalog(merchantId);
    return NextResponse.json(catalog, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[agent-catalog] failed:", error);
    return NextResponse.json({ error: "Catalog unavailable." }, { status: 500 });
  }
}
