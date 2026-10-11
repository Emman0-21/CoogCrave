import type { Metadata } from "next";
import Link from "next/link";

import { CartEditor } from "@/components/features/cart/cart-editor";
import { cartProblemText } from "@/components/features/cart/problem-text";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { requirePageAccess } from "@/server/auth/page-guards";
import { getCart } from "@/server/services/cart";
import { formatCents } from "@/shared/format";

export const metadata: Metadata = { title: "Your cart" };

/** The server-side cart, priced live (PRD CART-3, CART-4). */
export default async function CartPage() {
  const actor = await requirePageAccess("user", "/cart");
  const cart = await getCart(actor);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 pt-6 pb-16 sm:px-8 md:pt-10">
      <h1 className="font-display text-4xl leading-[1.05] font-black font-wide sm:text-5xl">Your cart</h1>

      {cart.items.length === 0 || !cart.restaurant ? (
        <div className="mt-8 space-y-5">
          <p className="text-lg text-ink-muted">Your cart is empty. Pick a restaurant to start an order.</p>
          <Link href="/restaurants" className={buttonClasses("primary")}>
            Browse restaurants
          </Link>
        </div>
      ) : (
        <section
          aria-labelledby="cart-restaurant"
          className="mt-8 rounded-ticket bg-surface px-5 pt-8 pb-8 ticket-edges sm:px-7"
        >
          <h2 id="cart-restaurant" className="font-display text-2xl font-extrabold">
            <Link
              href={`/restaurants/${cart.restaurant.slug}`}
              className="hover:underline hover:underline-offset-4"
            >
              {cart.restaurant.name}
            </Link>
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Sample menu, not affiliated</p>

          {cart.problems.length > 0 && (
            <div className="mt-5 space-y-2">
              {cart.problems.map((p) => (
                <Notice key={p} tone="error">
                  {cartProblemText(p, {
                    restaurantName: cart.restaurant!.name,
                    minSubtotalCents: cart.minSubtotalCents,
                  })}
                </Notice>
              ))}
            </div>
          )}

          <div className="mt-4">
            <CartEditor cart={cart} />
          </div>

          <div className="mt-2 flex items-baseline justify-between border-t border-line-strong pt-4 text-lg">
            <span className="font-bold">Subtotal</span>
            <span className="font-bold">{formatCents(cart.subtotalCents)}</span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Delivery fee, service fee, sample tax, and tip are added at checkout.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <Link href={`/restaurants/${cart.restaurant.slug}`} className="underline underline-offset-4">
              Add more from {cart.restaurant.name}
            </Link>
            {cart.canCheckout ? (
              <Link href="/checkout" className={buttonClasses("primary")}>
                Go to checkout
              </Link>
            ) : (
              <span
                className={buttonClasses("primary", "pointer-events-none opacity-60")}
                aria-disabled="true"
              >
                Go to checkout
              </span>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
