"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-16 sm:px-8">
      <h1 className="font-display text-3xl font-extrabold">This page didn&apos;t load</h1>
      <p className="mt-3 max-w-prose text-ink-muted">
        Something went wrong on our side. Try again, and if it keeps happening, share this reference with the
        team: <span className="font-bold text-ink">{error.digest ?? "unavailable"}</span>
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-control bg-action px-5 py-2.5 font-bold text-action-ink hover:bg-action-hover"
      >
        Try again
      </button>
    </main>
  );
}
