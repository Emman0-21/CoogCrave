import Link from "next/link";

import { SignOutButton } from "@/components/features/auth/sign-out-button";
import { buttonClasses } from "@/components/ui/button";

export interface HeaderUser {
  firstName: string;
  isAdmin: boolean;
}

/** Site header. `user` is resolved on the server; null when signed out. */
export function SiteHeader({ user }: { user: HeaderUser | null }) {
  return (
    <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-5 sm:px-8">
      <Link href="/" className="font-display text-xl font-black text-action font-wide">
        CoogCrave
      </Link>
      <nav aria-label="Account" className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {user ? (
          <>
            {user.isAdmin && (
              <Link href="/admin" className="underline-offset-4 hover:underline">
                Admin
              </Link>
            )}
            <Link
              href="/profile"
              aria-label={`${user.firstName}: your account`}
              className="underline-offset-4 hover:underline"
            >
              {user.firstName}
            </Link>
            <SignOutButton />
          </>
        ) : (
          <>
            <Link href="/sign-in" className="underline-offset-4 hover:underline">
              Sign in
            </Link>
            {/* On phones the landing page and sign-in page already offer sign-up; keep the header on one row. */}
            <Link
              href="/sign-up"
              className={buttonClasses("primary", "hidden min-h-10 px-4 py-1.5 sm:inline-flex")}
            >
              Create account
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
