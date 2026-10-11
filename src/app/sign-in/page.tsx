import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/features/auth/auth-shell";
import { SignInForm } from "@/components/features/auth/sign-in-form";
import { Notice } from "@/components/ui/notice";
import { redirectIfSignedIn } from "@/server/auth/page-guards";
import { safeNextPath } from "@/server/domain/safe-redirect";

export const metadata: Metadata = { title: "Sign in" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function SignInPage(props: PageProps<"/sign-in">) {
  const params = await props.searchParams;
  // Only same-site paths survive; anything else falls back to the profile page (THREAT_MODEL T-18).
  const next = safeNextPath(first(params.next), "/profile");
  await redirectIfSignedIn(next);

  const linkError = first(params.error);
  const verified = first(params.verified) === "1";
  const suspended = first(params.suspended) === "1";

  return (
    <AuthShell
      title="Sign in"
      intro={<p>Welcome back. Use the UH email you signed up with.</p>}
      footer={
        <p>
          New to CoogCrave?{" "}
          <Link href="/sign-up" className="font-bold text-ink underline underline-offset-4">
            Create an account
          </Link>
        </p>
      }
    >
      <div className="space-y-5">
        {linkError ? (
          <Notice tone="error">
            That confirmation link is invalid or has expired. Sign in and we&apos;ll email you a new one.
          </Notice>
        ) : verified ? (
          <Notice tone="success">Email confirmed. Sign in to continue.</Notice>
        ) : null}
        {suspended && (
          <Notice tone="error">This account is suspended. Contact the CoogCrave team for help.</Notice>
        )}
        <SignInForm next={next} />
      </div>
    </AuthShell>
  );
}
