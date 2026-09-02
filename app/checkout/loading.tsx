import { Shimmer } from "@/components/skeletons";

export default function CheckoutLoading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Shimmer className="h-3 w-32" />
      <Shimmer className="mt-5 h-8 w-40" />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div className="divide-y rounded-2xl border bg-card">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex gap-4 p-5">
              <Shimmer className="h-20 w-24 shrink-0 rounded-xl" />
              <div className="flex-1">
                <div className="flex justify-between gap-4">
                  <Shimmer className="h-4 w-48" />
                  <Shimmer className="h-4 w-20" />
                </div>
                <Shimmer className="mt-2.5 h-3 w-24" />
                <Shimmer className="mt-4 h-7 w-32 rounded-lg" />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <Shimmer className="h-2.5 w-28" />
          <Shimmer className="mt-5 h-3 w-full" />
          <Shimmer className="mt-2.5 h-3 w-2/3" />
          <div className="mt-5 flex items-baseline justify-between border-t pt-4">
            <Shimmer className="h-4 w-14" />
            <Shimmer className="h-6 w-28" />
          </div>
          <Shimmer className="mt-5 h-11 w-full rounded-lg" />
        </div>
      </div>
    </main>
  );
}
