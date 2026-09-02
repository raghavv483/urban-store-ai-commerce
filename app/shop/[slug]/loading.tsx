import { Shimmer } from "@/components/skeletons";

export default function ProductLoading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Shimmer className="h-3 w-52" />

      <div className="mt-7 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <Shimmer className="aspect-[4/3] w-full rounded-2xl" />

        <div>
          <Shimmer className="h-2.5 w-20" />
          <Shimmer className="mt-3 h-8 w-3/4" />
          <div className="mt-6 flex items-baseline gap-4">
            <Shimmer className="h-8 w-36" />
            <Shimmer className="h-3 w-20" />
          </div>
          <Shimmer className="mt-6 h-3.5 w-full" />
          <Shimmer className="mt-2 h-3.5 w-5/6" />
          <Shimmer className="mt-7 h-11 w-full max-w-sm rounded-lg" />
          <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Shimmer className="h-2.5 w-16" />
                <Shimmer className="mt-2 h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <Shimmer className="mt-12 h-3 w-32" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer key={i} className="h-9 w-full" />
        ))}
      </div>
    </main>
  );
}
