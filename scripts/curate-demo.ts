/**
 * Curate the demo dataset.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/curate-demo.ts --dry-run
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/curate-demo.ts --apply
 *
 * Days of manual testing leave the database honest but messy — eight abandoned
 * carts where the seed made three, duplicate orders, half-finished checkouts.
 * Nothing is wrong, but the numbers on screen look accidental rather than
 * composed, which is the wrong impression for a demo.
 *
 * This keeps ONE clean representative of every state a judge should see and
 * removes the duplicates. It is destructive, so it refuses to run without
 * --apply and prints exactly what it would delete first.
 *
 * It never touches products, the knowledge base, or the seeded abandoned carts.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const APPLY = process.argv.includes("--apply");
const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;

type Plan = { label: string; ids: string[]; kind: "order" | "cart" | "campaign" };

async function main() {
  const merchant = await prisma.merchant.findFirstOrThrow({
    where: { slug: "urban-store" },
    select: { id: true },
  });
  const merchantId = merchant.id;
  const plans: Plan[] = [];

  // ---- Orders: keep the newest of each (status, source) pair ----
  const orders = await prisma.order.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, source: true, totalInPaise: true },
  });

  const keptOrders = new Map<string, string>();
  const dropOrders: string[] = [];
  for (const o of orders) {
    const key = `${o.status}:${o.source}`;
    if (keptOrders.has(key)) dropOrders.push(o.id);
    else keptOrders.set(key, o.id);
  }
  // Orders stuck mid-checkout tell no story; keep none of them.
  const stuck = orders.filter((o) => o.status === "created" || o.status === "pending");
  for (const o of stuck) if (!dropOrders.includes(o.id)) dropOrders.push(o.id);

  plans.push({
    label: `orders — keep one per state, drop ${dropOrders.length} duplicate/stuck`,
    ids: dropOrders,
    kind: "order",
  });

  // ---- Abandoned carts: keep the three seeded ones, drop test leftovers ----
  const abandoned = await prisma.cart.findMany({
    where: { merchantId, status: "abandoned" },
    select: { id: true, sessionId: true, totalInPaise: true },
  });
  const dropCarts = abandoned
    .filter((c) => !(c.sessionId ?? "").startsWith("seed-abandoned-"))
    .map((c) => c.id);
  plans.push({
    label: `abandoned carts — keep the 3 seeded, drop ${dropCarts.length} test leftovers`,
    ids: dropCarts,
    kind: "cart",
  });

  // ---- Stale active carts from testing ----
  const activeCarts = await prisma.cart.findMany({
    where: { merchantId, status: "active" },
    select: { id: true, sessionId: true },
  });
  plans.push({
    label: `active carts — drop ${activeCarts.length} left open by testing`,
    ids: activeCarts.map((c) => c.id),
    kind: "cart",
  });

  // ---- Campaigns: keep one active and one rejected ----
  const campaigns = await prisma.campaign.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });
  const keptCampaigns = new Set<string>();
  const dropCampaigns: string[] = [];
  for (const c of campaigns) {
    if (keptCampaigns.has(c.status)) dropCampaigns.push(c.id);
    else keptCampaigns.add(c.status);
  }
  plans.push({
    label: `campaigns — keep one per status, drop ${dropCampaigns.length}`,
    ids: dropCampaigns,
    kind: "campaign",
  });

  console.log("\n  DEMO DATASET CURATION");
  console.log("  " + "─".repeat(60));
  for (const p of plans) console.log(`  ${p.label}`);

  const kept = orders.filter((o) => !dropOrders.includes(o.id));
  console.log("\n  Orders that will remain:");
  for (const o of kept) {
    console.log(`    ${o.source.padEnd(9)} ${o.status.padEnd(10)} ${rupees(o.totalInPaise)}`);
  }

  if (!APPLY) {
    console.log("\n  Dry run. Nothing deleted. Re-run with --apply to make these changes.\n");
    return;
  }

  // Order matters: children before parents, and orders before the carts they
  // reference, or the foreign keys refuse.
  const orderIds = plans.find((p) => p.kind === "order")!.ids;
  if (orderIds.length) await prisma.order.deleteMany({ where: { id: { in: orderIds } } });

  const cartIds = plans.filter((p) => p.kind === "cart").flatMap((p) => p.ids);
  if (cartIds.length) {
    // Any surviving order still pointing at a doomed cart loses the link rather
    // than being deleted with it.
    await prisma.order.updateMany({
      where: { cartId: { in: cartIds } },
      data: { cartId: null },
    });
    await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
  }

  const campaignIds = plans.find((p) => p.kind === "campaign")!.ids;
  if (campaignIds.length) {
    await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
  }

  const [finalOrders, finalCarts, finalCampaigns, runs] = await Promise.all([
    prisma.order.count({ where: { merchantId } }),
    prisma.cart.count({ where: { merchantId } }),
    prisma.campaign.count({ where: { merchantId } }),
    prisma.agentRun.count({ where: { merchantId } }),
  ]);

  console.log("\n  Applied.");
  console.log(`    orders ${finalOrders} · carts ${finalCarts} · campaigns ${finalCampaigns}`);
  console.log(`    agent_runs ${runs} (kept — the audit trail is the exhibit)\n`);
}

main()
  .catch((e) => {
    console.error("\n  Curation failed:", e instanceof Error ? e.message : e, "\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
