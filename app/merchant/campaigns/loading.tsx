import { Shimmer, TableSkeleton } from "@/components/skeletons";

export default function CampaignsLoading() {
  return (
    <main className="py-8">
      <Shimmer className="h-3 w-24" />

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl flex-1 space-y-2">
          <Shimmer className="h-3 w-full" />
          <Shimmer className="h-3 w-4/5" />
        </div>
        <Shimmer className="h-10 w-56 rounded-lg" />
      </div>

      <Shimmer className="mt-8 h-3 w-40" />
      <div className="mt-4 rounded-2xl border bg-card p-5">
        <div className="flex items-baseline justify-between">
          <Shimmer className="h-4 w-52" />
          <Shimmer className="h-4 w-28 rounded-full" />
        </div>
        <div className="mt-5 grid gap-4 rounded-xl bg-muted/40 p-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <Shimmer className="h-2.5 w-20" />
              <Shimmer className="mt-2.5 h-4 w-24" />
            </div>
          ))}
        </div>
        <Shimmer className="mt-5 h-20 w-full rounded-lg" />
        <div className="mt-4 flex gap-2">
          <Shimmer className="h-9 w-24 rounded-lg" />
          <Shimmer className="h-9 w-24 rounded-lg" />
          <Shimmer className="h-9 w-20 rounded-lg" />
        </div>
      </div>

      <Shimmer className="mt-8 h-3 w-20" />
      <div className="mt-4">
        <TableSkeleton rows={3} cols={6} />
      </div>
    </main>
  );
}
