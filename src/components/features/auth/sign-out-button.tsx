"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestJson } from "@/client/api";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    const result = await requestJson("/api/auth/sign-out", { body: {} });
    setPending(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={signOut}
        disabled={pending}
        aria-busy={pending}
        className="min-h-10 px-4 py-1.5"
      >
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {failed && (
        <span role="alert" className="text-sm font-bold text-danger-700">
          Couldn&apos;t sign out. Try again.
        </span>
      )}
    </>
  );
}
