import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/features/auth/auth-shell";
import { SignUpForm } from "@/components/features/auth/sign-up-form";
import { redirectIfSignedIn } from "@/server/auth/page-guards";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage() {
  await redirectIfSignedIn("/profile");
  return (
    <AuthShell
      title="Create your account"
      intro={<p>Use your UH email. We&apos;ll send a link to confirm it&apos;s yours.</p>}
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-bold text-ink underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
