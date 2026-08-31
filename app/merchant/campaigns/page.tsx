import { guardMerchantPage } from "@/auth/merchant-guard";
import { listCampaigns } from "@/db/queries/campaigns";
import { CampaignBoard, type CampaignView } from "./campaign-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns · Urban Store Merchant" };

export default async function CampaignsPage() {
  const session = await guardMerchantPage();
  const campaigns = await listCampaigns(session.merchantId);

  // Dates cross the server/client boundary as strings; the board only displays them.
  const view: CampaignView[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    content: c.content,
    createdByAgent: c.createdByAgent,
    approvedBy: c.approvedBy,
    createdAt: c.createdAt.toISOString(),
    target: c.target,
  }));

  return (
    <main className="py-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Campaigns
      </h2>
      <div className="mt-4">
        <CampaignBoard campaigns={view} />
      </div>
    </main>
  );
}
