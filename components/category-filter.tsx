import Link from "next/link";

export function CategoryFilter({
  categories,
  active,
}: {
  categories: string[];
  active?: string;
}) {
  const pill = (isActive: boolean) =>
    `rounded-full border px-4 py-1.5 text-sm transition-colors ${
      isActive
        ? "border-foreground bg-foreground text-background"
        : "border-border hover:bg-muted"
    }`;

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Filter by category">
      <Link href="/shop" className={pill(!active)}>
        All
      </Link>
      {categories.map((category) => (
        <Link
          key={category}
          href={`/shop?category=${encodeURIComponent(category)}`}
          className={pill(active === category)}
        >
          {category}
        </Link>
      ))}
    </nav>
  );
}
