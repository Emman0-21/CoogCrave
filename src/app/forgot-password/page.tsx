import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/features/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/features/auth/password-reset-forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      intro={<p>Enter your UH email and we&apos;ll send a link to choose a new password.</p>}
      footer={
        <p>
          Remembered it?{" "}
          <Link href="/sign-in" className="font-bold text-ink underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
