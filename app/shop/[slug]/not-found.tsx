import Link from "next/link";

export default function ProductNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20 text-center">
      <h1 className="text-2xl font-bold">We could not find that product.</h1>
      <p className="mt-2 text-muted-foreground">
        It may have been removed from the catalog.
      </p>
      <Link href="/shop" className="mt-6 inline-block underline">
        Back to shop
      </Link>
    </main>
  );
}
