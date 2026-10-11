"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestJson } from "@/client/api";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { TRANSPORT_MODES, type TransportMode } from "@/shared/enums";
import type { CourierProfileView } from "@/shared/schemas/delivery";

import { TRANSPORT_LABEL } from "./transport";

/** Courier application (PRD DLV-1). The server always records it as pending review. */
export function CourierApplyForm() {
  const router = useRouter();
  const [mode, setMode] = useState<TransportMode | "">("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!mode || !agreed) {
      setError(!mode ? "Choose how you'll get around campus." : "Agree to the courier guidelines to apply.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await requestJson<CourierProfileView>("/api/v1/courier/application", {
      body: { transportMode: mode, acceptGuidelines: true },
    });
    setBusy(false);
    if (result.ok) router.refresh();
    else setError(result.error.message);
  }

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && <Notice tone="error">{error}</Notice>}
      <fieldset>
        <legend className="font-bold">How will you get around campus?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TRANSPORT_MODES.map((m) => (
            <label
              key={m}
              className="cursor-pointer rounded-full border border-line-strong px-4 py-2 has-checked:border-ink has-checked:bg-ink has-checked:text-canvas has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-action"
            >
              <input
                type="radio"
                name="transportMode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                className="sr-only"
              />
              {TRANSPORT_LABEL[m]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-control border border-line-strong px-4 py-3">
        <h2 className="font-bold">Courier guidelines</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
          <li>Take one delivery at a time and keep food sealed.</li>
          <li>Meet customers at the building entrance they chose. Don&apos;t go into rooms.</li>
          <li>Use a customer&apos;s name and note only for their delivery.</li>
          <li>If you can&apos;t finish a delivery, give it back before pickup or report it with a reason.</li>
          <li>Earnings shown in this demo are simulated. No one is paid.</li>
        </ul>
        <label className="mt-3 flex items-start gap-3">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 size-5 accent-action"
          />
          <span>I agree to the courier guidelines.</span>
        </label>
      </div>

      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Apply to deliver"}
      </Button>
    </form>
  );
}
