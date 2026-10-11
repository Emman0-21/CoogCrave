import Link from "next/link";

import { SignOutButton } from "@/components/features/auth/sign-out-button";
import { buttonClasses } from "@/components/ui/button";

export interface HeaderUser {
  firstName: string;
  isAdmin: boolean;
  cartCount: number;
  unreadCount: number;
}

const LINK = "underline-offset-4 hover:underline";

/**
 * Site header. `user` is resolved on the server; null when signed out.
 * Phones: logo and account on the first row, page links on their own row below (scrolls sideways if
 * it ever has to, rather than wrapping unpredictably). Wider screens: everything on one row.
 */
export function SiteHeader({ user }: { user: HeaderUser | null }) {
  return (
    <header className="mx-auto grid w-full max-w-5xl grid-cols-[1fr_auto] items-center gap-x-6 gap-y-3 px-5 py-4 sm:flex sm:flex-wrap sm:justify-between sm:px-8 sm:py-5">
      <Link href="/" className="font-display text-xl font-black text-action font-wide">
        CoogCrave
      </Link>
      {user ? (
        <>
          <div className="flex items-center gap-x-4 sm:order-last">
            <Link href="/profile" aria-label={`${user.firstName}: your account`} className={LINK}>
              {user.firstName}
            </Link>
            <SignOutButton />
          </div>
          <nav
            aria-label="Main"
            className="col-span-2 -mx-5 flex gap-x-5 overflow-x-auto border-t border-line px-5 pt-3 whitespace-nowrap sm:mx-0 sm:ml-auto sm:overflow-visible sm:border-0 sm:px-0 sm:pt-0"
          >
            <Link href="/restaurants" className={LINK}>
              Restaurants
            </Link>
            <Link href="/orders" className={LINK}>
              Orders
            </Link>
            <Link href="/courier" className={LINK}>
              Deliver
            </Link>
            <Link
              href="/notifications"
              aria-label={user.unreadCount ? `Inbox, ${user.unreadCount} unread` : "Inbox"}
              className={`${LINK} inline-flex items-center gap-1.5`}
            >
              Inbox
              {user.unreadCount > 0 && <Badge>{user.unreadCount > 99 ? "99+" : user.unreadCount}</Badge>}
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
              {user.cartCount > 0 && <Badge>{user.cartCount}</Badge>}
            </Link>
            {user.isAdmin && (
              <Link href="/admin" className={LINK}>
                Admin
              </Link>
            )}
          </nav>
        </>
      ) : (
        <nav aria-label="Main" className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
          <Link href="/restaurants" className={LINK}>
            Restaurants
          </Link>
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
        </nav>
      )}
    </header>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="min-w-6 rounded-full bg-action px-1.5 text-center text-sm leading-6 font-bold text-action-ink"
    >
      {children}
    </span>
  );
}
