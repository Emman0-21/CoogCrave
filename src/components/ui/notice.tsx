import type { ReactNode } from "react";

import { cn } from "./cn";

type Tone = "success" | "error" | "info";

const TONES: Record<Tone, { box: string; label: string; icon: string }> = {
  success: {
    box: "border-success-700 bg-success-50",
    label: "Done",
    icon: "M6.5 11.2 3.3 8l1-1 2.2 2.2 5.2-5.2 1 1-6.2 6.2Z",
  },
  error: {
    box: "border-danger-700 bg-danger-50",
    label: "Problem",
    icon: "M7.25 3.5h1.5v6h-1.5v-6Zm0 7.25h1.5v1.5h-1.5v-1.5Z",
  },
  info: {
    box: "border-info-700 bg-info-50",
    label: "Note",
    icon: "M7.25 7h1.5v5.5h-1.5V7Zm0-3h1.5v1.5h-1.5V4Z",
  },
};

/**
 * A message box. Errors use role="alert" so they're announced immediately; others use role="status".
 * The tone is carried by an icon and a hidden text label as well as color.
 */
export function Notice({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-control border-l-4 px-4 py-3 text-ink", t.box, className)}
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 size-5 shrink-0 fill-current">
        <path d={t.icon} />
      </svg>
      <div className="min-w-0 space-y-1">
        <span className="sr-only">{t.label}: </span>
        {children}
      </div>
    </div>
  );
}
