import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/features/auth/auth-shell";
import { ResetPasswordForm } from "@/components/features/auth/password-reset-forms";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const params = await props.searchParams;
  const token =
    typeof params.token === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(params.token) ? params.token : null;

  return (
    <AuthShell title="Choose a new password" intro={<p>Pick something you haven&apos;t used here before.</p>}>
      {token && !params.error ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-5">
          <Notice tone="error">
            This reset link is invalid or has expired. Links work once, for 1 hour.
          </Notice>
          <Link href="/forgot-password" className="font-bold underline underline-offset-4">
            Request a new link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
