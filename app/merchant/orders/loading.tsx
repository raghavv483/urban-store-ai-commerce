import { Shimmer, TableSkeleton } from "@/components/skeletons";

export default function OrdersLoading() {
  return (
    <main className="py-8">
      <div className="flex items-baseline justify-between">
        <Shimmer className="h-3 w-16" />
        <div className="flex gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Shimmer key={i} className="h-6 w-16 rounded-full" />
          ))}
        </div>
      </div>
      <div className="mt-4">
        <TableSkeleton rows={8} cols={7} />
      </div>
    </main>
  );
}
