import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-16 sm:px-8">
      <h1 className="font-display text-3xl font-extrabold">We couldn&apos;t find that page</h1>
      <p className="mt-3 max-w-prose text-ink-muted">The link may be old, or the page may not exist yet.</p>
      <Link
        href="/"
        className="mt-6 inline-block font-bold text-action underline underline-offset-4 hover:text-action-hover"
      >
        Go to the home page
      </Link>
    </main>
  );
}
