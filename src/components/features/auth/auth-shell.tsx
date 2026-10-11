import type { ReactNode } from "react";

/**
 * Layout for account screens: the title and one sentence of context on the left, the form on a
 * ticket stub on the right (stacked on phones). The perforated stub is the same motif as the order ticket.
 */
export function AuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 items-start gap-8 px-5 pt-6 pb-16 sm:px-8 md:grid-cols-[1fr_minmax(0,27rem)] md:gap-16 md:pt-14">
      <div className="max-w-md">
        <h1 className="font-display text-4xl leading-[1.05] font-black text-balance font-wide sm:text-5xl">
          {title}
        </h1>
        <div className="mt-4 text-lg leading-relaxed text-ink-muted">{intro}</div>
      </div>
      <div>
        <div className="rounded-ticket bg-surface px-5 pt-9 pb-10 ticket-edges sm:px-7">{children}</div>
        {footer && <div className="mt-5 px-1 text-ink-muted">{footer}</div>}
      </div>
    </main>
  );
}
