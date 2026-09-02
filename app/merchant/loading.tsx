import {
  StatTileSkeleton,
  TableSkeleton,
  Shimmer,
} from "@/components/skeletons";

export default function MerchantLoading() {
  return (
    <main className="py-8">
      <Shimmer className="h-3 w-20" />
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
      <Shimmer className="mt-4 h-14 w-full rounded-lg" />
      <div className="mt-10">
        <Shimmer className="mb-3 h-3 w-28" />
        <TableSkeleton />
      </div>
    </main>
  );
}
