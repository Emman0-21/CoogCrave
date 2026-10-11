import type { ComponentProps } from "react";

import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "quiet";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-action text-action-ink hover:bg-action-hover",
  secondary: "border border-line-strong bg-canvas text-ink hover:bg-surface",
  quiet: "px-0 text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink",
};

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-5 py-2.5 font-bold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60";

/** Classes for a button, also used to style a link that acts like one. */
export function buttonClasses(variant: ButtonVariant = "primary", className?: string): string {
  return cn(BASE, VARIANTS[variant], className);
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}
