"use client";

import { type ComponentProps, type ReactNode, useState } from "react";

import { cn } from "./cn";

interface FieldChrome {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
}

const CONTROL =
  "block w-full rounded-control border bg-canvas px-3.5 py-2.5 text-base text-ink placeholder:text-ink-muted";

function describedBy(id: string, hint?: ReactNode, error?: string): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

function FieldText({ id, hint, error }: Pick<FieldChrome, "id" | "hint" | "error">) {
  return (
    <>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="flex gap-1.5 text-sm font-bold text-danger-700">
          <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 fill-current">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm-.75 3.5h1.5v5h-1.5v-5Zm0 6.25h1.5v1.5h-1.5v-1.5Z" />
          </svg>
          {error}
        </p>
      )}
    </>
  );
}

/** Labeled text input. Hint and error text are announced with the field (aria-describedby). */
export function TextField({
  id,
  label,
  hint,
  error,
  className,
  ...input
}: FieldChrome & ComponentProps<"input">) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block font-bold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(CONTROL, error ? "border-danger-700" : "border-line-strong")}
        {...input}
      />
      <FieldText id={id} hint={hint} error={error} />
    </div>
  );
}

/** Password input with a show/hide toggle, so people can check what they typed. */
export function PasswordField({
  id,
  label,
  hint,
  error,
  className,
  ...input
}: FieldChrome & ComponentProps<"input">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="block font-bold">
          {label}
        </label>
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-controls={id}
          // Explicit name: the visible word ("Show") plus what it acts on, for screen readers.
          aria-label={visible ? "Hide password" : "Show password"}
          className="text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      <input
        id={id}
        type={visible ? "text" : "password"}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(CONTROL, error ? "border-danger-700" : "border-line-strong")}
        {...input}
      />
      <FieldText id={id} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  className,
  children,
  ...select
}: FieldChrome & ComponentProps<"select">) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block font-bold">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(CONTROL, "appearance-auto", error ? "border-danger-700" : "border-line-strong")}
        {...select}
      >
        {children}
      </select>
      <FieldText id={id} hint={hint} error={error} />
    </div>
  );
}

/** Multi-line text with a live character count, so people see the limit before they hit it. */
export function TextAreaField({
  id,
  label,
  hint,
  error,
  className,
  maxLength,
  value,
  ...textarea
}: FieldChrome & ComponentProps<"textarea"> & { value: string }) {
  const remaining = maxLength === undefined ? null : maxLength - value.length;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="block font-bold">
          {label}
        </label>
        {remaining !== null && (
          <span id={`${id}-count`} className="text-sm text-ink-muted">
            {remaining} left
          </span>
        )}
      </div>
      <textarea
        id={id}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [describedBy(id, hint, error), remaining !== null ? `${id}-count` : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        className={cn(CONTROL, "min-h-24", error ? "border-danger-700" : "border-line-strong")}
        {...textarea}
      />
      <FieldText id={id} hint={hint} error={error} />
    </div>
  );
}
