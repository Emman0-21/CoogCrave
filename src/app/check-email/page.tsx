import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { AuthShell } from "@/components/features/auth/auth-shell";
import { Notice } from "@/components/ui/notice";
import { getConfig } from "@/server/config";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage(props: PageProps<"/check-email">) {
  const raw = (await props.searchParams).email;
  const parsed = z
    .email()
    .max(254)
    .safeParse(Array.isArray(raw) ? raw[0] : raw);
  const email = parsed.success ? parsed.data : null;
  const { APP_ENV, MAIL_TRANSPORT, MAIL_OUTBOX_DIR } = getConfig();
  const localOutbox = MAIL_TRANSPORT === "file" && (APP_ENV === "development" || APP_ENV === "test");

  return (
    <AuthShell
      title="Check your email"
      intro={
        <p>
          We sent a link to{" "}
          {email ? <strong className="break-all text-ink">{email}</strong> : "your UH email"}. Open it to
          confirm your address, then sign in.
        </p>
      }
      footer={
        <p>
          Confirmed already?{" "}
          <Link href="/sign-in" className="font-bold text-ink underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <div className="space-y-4">
        <p>The link works for 24 hours.</p>
        <p className="text-ink-muted">
          Nothing in your inbox? Check your spam folder, or sign in and we&apos;ll send a new link.
        </p>
        {localOutbox && (
          <Notice tone="info">
            This copy of CoogCrave runs locally, so emails are saved as files instead of being sent. Open the
            newest file in <code className="font-bold">{MAIL_OUTBOX_DIR}</code> to find the link.
          </Notice>
        )}
      </div>
    </AuthShell>
  );
}
