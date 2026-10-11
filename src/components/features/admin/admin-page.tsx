import type { ReactNode } from "react";

/** The frame every admin page shares: one heading, an optional line of context, then the content. */
export function AdminPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-6 pb-16 sm:px-8 md:pt-10">
      <h1 className="font-display text-4xl leading-[1.05] font-black font-wide sm:text-5xl">{title}</h1>
      {intro && <p className="mt-3 max-w-prose text-lg text-ink-muted">{intro}</p>}
      {children}
    </main>
  );
}
