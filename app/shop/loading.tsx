export default function ShopLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 h-9 w-48 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </main>
  );
}
