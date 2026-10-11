import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CheckoutForm } from "@/components/features/cart/checkout-form";
import { requirePageAccess } from "@/server/auth/page-guards";
import { getCart } from "@/server/services/cart";
import { listDropPoints } from "@/server/services/locations";
import { getMe } from "@/server/services/profile";

export const metadata: Metadata = { title: "Checkout" };

/** Checkout (PRD ORD-1, ORD-2). A cart that can't be ordered sends people back to the cart, which explains why. */
export default async function CheckoutPage() {
  const actor = await requirePageAccess("user", "/checkout");
  const [cart, locations, me] = await Promise.all([getCart(actor), listDropPoints(), getMe(actor)]);
  if (!cart.canCheckout) redirect("/cart");

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-6 pb-16 sm:px-8 md:pt-10">
      <h1 className="font-display text-4xl leading-[1.05] font-black font-wide sm:text-5xl">Checkout</h1>
      <p className="mt-3 mb-10 text-lg text-ink-muted">
        From {cart.restaurant?.name}, brought to your building by a UH student.
      </p>
      <CheckoutForm locations={locations} defaultLocationId={me.profile.defaultLocationId} />
    </main>
  );
}
