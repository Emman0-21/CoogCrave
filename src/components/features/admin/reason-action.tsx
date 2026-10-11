"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { requestJson } from "@/client/api";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export interface ReasonActionProps {
  /** The button that opens the form, e.g. "Suspend". */
  label: string;
  /** Names the target for screen readers when several rows have the same button, e.g. "Suspend Sam Lee". */
  accessibleLabel?: string;
  variant?: ButtonVariant;
  /** The form's submit button, e.g. "Suspend account". */
  submitLabel: string;
  reasonLabel: string;
  reasonHint?: string;
  reasonRequired: boolean;
  maxLength: number;
  url: string;
  method?: "POST" | "PATCH";
  /** The request body; the reason is added under `reasonField` when one was typed. */
  body: Record<string, unknown>;
  reasonField: string;
  /** Shown after success, before the page refreshes with the new state. */
  doneText: string;
}

/**
 * An admin action that asks for a reason (or note) first: suspend, approve, cancel, unassign. One
 * component so every such action behaves the same way: the reason is required where the server
 * requires it, errors are shown next to the form, and the page reloads its data after success.
 */
export function ReasonAction(props: ReasonActionProps) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await requestJson(props.url, {
      method: props.method ?? "POST",
      body: { ...props.body, ...(reason.trim() ? { [props.reasonField]: reason.trim() } : {}) },
    });
    setBusy(false);
    if (result.ok) {
      setOpen(false);
      setReason("");
      setDone(true);
      router.refresh();
    } else {
      setError(result.error.message);
      // Someone else changed it first: show the current state behind the message.
      if (result.error.code === "INVALID_TRANSITION" || result.error.code === "STALE_STATE") router.refresh();
    }
  }

  if (!open) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <Button
          variant={props.variant ?? "secondary"}
          aria-label={props.accessibleLabel}
          onClick={() => {
            setOpen(true);
            setDone(false);
            setError(null);
          }}
        >
          {props.label}
        </Button>
        <span role="status" className="text-sm">
          {done ? props.doneText : ""}
        </span>
      </span>
    );
  }

  return (
    <form
      className="w-full max-w-md space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor={`${id}-reason`} className="block font-bold">
        {props.reasonLabel}
        {!props.reasonRequired && <span className="font-normal text-ink-muted"> (optional)</span>}
      </label>
      {props.reasonHint && (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {props.reasonHint}
        </p>
      )}
      <textarea
        id={`${id}-reason`}
        value={reason}
        rows={2}
        maxLength={props.maxLength}
        required={props.reasonRequired}
        aria-describedby={props.reasonHint ? `${id}-hint` : undefined}
        onChange={(e) => setReason(e.target.value)}
        className="block w-full rounded-control border border-line-strong bg-canvas px-3.5 py-2.5"
      />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || (props.reasonRequired && !reason.trim())}>
          {props.submitLabel}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Never mind
        </Button>
      </div>
    </form>
  );
}
