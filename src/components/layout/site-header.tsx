import Link from "next/link";

import { SignOutButton } from "@/components/features/auth/sign-out-button";
import { buttonClasses } from "@/components/ui/button";

export interface HeaderUser {
  firstName: string;
  isAdmin: boolean;
  cartCount: number;
}

const LINK = "underline-offset-4 hover:underline";

/** Site header. `user` is resolved on the server; null when signed out. */
export function SiteHeader({ user }: { user: HeaderUser | null }) {
  return (
    <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-5 sm:px-8">
      <Link href="/" className="font-display text-xl font-black text-action font-wide">
        CoogCrave
      </Link>
      <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/restaurants" className={LINK}>
          Restaurants
        </Link>
        {user ? (
          <>
            <Link href="/orders" className={LINK}>
              Orders
            </Link>
            <Link
              href="/cart"
              aria-label={
                user.cartCount
                  ? `Cart, ${user.cartCount} item${user.cartCount === 1 ? "" : "s"}`
                  : "Cart, empty"
              }
              className={`${LINK} inline-flex items-center gap-1.5`}
            >
              Cart
              {user.cartCount > 0 && (
                <span
                  aria-hidden="true"
                  className="min-w-6 rounded-full bg-action px-1.5 text-center text-sm leading-6 font-bold text-action-ink"
                >
                  {user.cartCount}
                </span>
              )}
            </Link>
            {user.isAdmin && (
              <Link href="/admin" className={LINK}>
                Admin
              </Link>
            )}
            <Link href="/profile" aria-label={`${user.firstName}: your account`} className={LINK}>
              {user.firstName}
            </Link>
            <SignOutButton />
          </>
        ) : (
          <>
            <Link href="/sign-in" className={LINK}>
              Sign in
            </Link>
            {/* On phones the landing page and sign-in page already offer sign-up; keep the header short.
                The wrapper does the hiding: the button's own inline-flex would override `hidden` on it. */}
            <span className="hidden sm:inline">
              <Link href="/sign-up" className={buttonClasses("primary", "min-h-10 px-4 py-1.5")}>
                Create account
              </Link>
            </span>
          </>
        )}
      </nav>
    </header>
  );
}
