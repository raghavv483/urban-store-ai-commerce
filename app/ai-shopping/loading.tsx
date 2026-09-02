import { Shimmer } from "@/components/skeletons";

export default function AiShoppingLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-6 py-8">
          <div className="py-10">
            <Shimmer className="h-2.5 w-40" />
            <Shimmer className="mt-4 h-10 w-96 max-w-full" />
            <Shimmer className="mt-4 h-3.5 w-full max-w-xl" />
            <Shimmer className="mt-2 h-3.5 w-3/4 max-w-lg" />
            <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Shimmer key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="border-t">
        <div className="mx-auto w-full max-w-3xl px-6 py-4">
          <Shimmer className="h-14 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
