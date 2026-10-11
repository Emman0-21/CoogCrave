"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestJson } from "@/client/api";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { DEMO_RESET_PHRASE, type DemoResetView } from "@/shared/schemas/admin";

/**
 * Demo reset (PRD ADM-10). Shown only where the server allows it. Typing the phrase is the confirmation,
 * because this deletes the demo accounts' orders.
 */
export function DemoReset() {
  const router = useRouter();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function reset() {
    setBusy(true);
    setMessage(null);
    const result = await requestJson<DemoResetView>("/api/v1/admin/demo/reset", {
      body: { confirm: phrase },
    });
    setBusy(false);
    if (result.ok) {
      const { removed } = result.data;
      setPhrase("");
      setMessage({
        tone: "success",
        text: `Demo data reset. Removed ${removed.orders} ${removed.orders === 1 ? "order" : "orders"} and ${removed.carts} ${removed.carts === 1 ? "cart" : "carts"}; restored the demo accounts and the sample restaurants.`,
      });
      router.refresh();
    } else {
      setMessage({ tone: "error", text: result.error.message });
    }
  }

  return (
    <form
      className="max-w-md space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void reset();
      }}
    >
      <label htmlFor="demo-reset-phrase" className="block font-bold">
        Type {DEMO_RESET_PHRASE} to confirm
      </label>
      <input
        id="demo-reset-phrase"
        value={phrase}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setPhrase(e.target.value)}
        className="block w-full rounded-control border border-line-strong bg-canvas px-3.5 py-2.5"
      />
      <Button type="submit" disabled={busy || phrase !== DEMO_RESET_PHRASE}>
        Reset demo data
      </Button>
      <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>
    </form>
  );
}
