import { Shimmer, TimelineSkeleton } from "@/components/skeletons";

export default function AgentActivityLoading() {
  return (
    <main className="py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Shimmer className="h-3 w-28" />
          <Shimmer className="mt-3 h-3 w-96 max-w-full" />
          <Shimmer className="mt-2 h-3 w-72 max-w-full" />
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Shimmer key={i} className="h-6 w-24 rounded-full" />
          ))}
        </div>
      </div>
      <TimelineSkeleton />
    </main>
  );
}
