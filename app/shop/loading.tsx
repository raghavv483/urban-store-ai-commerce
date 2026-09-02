import { ProductGridSkeleton, Shimmer } from "@/components/skeletons";

export default function ShopLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-3">
          <Shimmer className="h-9 w-56" />
          <Shimmer className="h-4 w-80" />
        </div>
        <Shimmer className="h-16 w-64 rounded-xl" />
      </div>
      <div className="mb-8 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Shimmer key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <ProductGridSkeleton />
    </main>
  );
}
