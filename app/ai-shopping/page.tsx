import { prisma } from "@/lib/db";
import { getStorefrontMerchantId } from "@/lib/merchant";
import { Chat } from "./chat";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "AI Shopping · Urban Store",
  description: "Shop Urban Store by talking to it.",
};

export default async function AiShoppingPage() {
  const merchantId = await getStorefrontMerchantId();

  // Pick up an existing active cart so the conversation can continue one.
  const cart = await prisma.cart.findFirst({
    where: { merchantId, status: "active" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  return <Chat initialCartId={cart?.id ?? null} />;
}
