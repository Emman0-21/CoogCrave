export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
        <div className="h-10 w-2/3 rounded-control bg-surface" />
        <div className="h-4 w-1/2 rounded-control bg-surface" />
        <div className="h-48 w-full rounded-control bg-surface" />
      </div>
    </div>
  );
}
