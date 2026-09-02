import { guardMerchantPage } from "@/auth/merchant-guard";
import { listCampaigns, getCampaignOutcome } from "@/db/queries/campaigns";
import { CampaignBoard, type CampaignView } from "./campaign-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns · Urban Store Merchant" };

export default async function CampaignsPage() {
  const session = await guardMerchantPage();
  const campaigns = await listCampaigns(session.merchantId);

  // Dates cross the server/client boundary as strings; the board only displays them.
  // Outcomes are derived on every render rather than stored, so the number on
  // screen is current rather than a snapshot that can drift.
  const outcomes = await Promise.all(
    campaigns.map((c) => getCampaignOutcome(session.merchantId, c)),
  );

  const view: CampaignView[] = campaigns.map((c, i) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    content: c.content,
    createdByAgent: c.createdByAgent,
    approvedBy: c.approvedBy,
    createdAt: c.createdAt.toISOString(),
    target: c.target,
    outcome: outcomes[i]
      ? {
          targetCartCount: outcomes[i]!.targetCartCount,
          recoveredCartCount: outcomes[i]!.recoveredCartCount,
          recoveredInPaise: outcomes[i]!.recoveredInPaise,
          recoveryRatePercent: outcomes[i]!.recoveryRatePercent,
          measuredSince: outcomes[i]!.measuredSince.toISOString(),
        }
      : null,
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
