import type { Metadata } from "next";
import Link from "next/link";

import { KitchenBoard } from "@/components/features/kitchen/kitchen-board";
import { Notice } from "@/components/ui/notice";
import { requirePageAccess } from "@/server/auth/page-guards";
import { listKitchenOrders } from "@/server/services/kitchen";
import { CAMPUS_TIME_ZONE } from "@/shared/format";

export const metadata: Metadata = { title: "Kitchen Console" };

/** Kitchen Console (PRD ADM-7): admins play the restaurant for the demo. Admin-only; others get 404. */
export default async function KitchenPage() {
  await requirePageAccess("admin", "/admin/kitchen");
  const orders = await listKitchenOrders();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-6 pb-16 sm:px-8 md:pt-10">
      <p className="text-ink-muted">
        <Link href="/admin" className="underline underline-offset-4">
          Admin
        </Link>
      </p>
      <h1 className="mt-2 font-display text-4xl leading-[1.05] font-black font-wide sm:text-5xl">
        Kitchen Console
      </h1>
      <Notice tone="info" className="mt-6 max-w-prose">
        <strong>Simulated restaurant.</strong> No real restaurant receives these orders. You play the kitchen:
        confirm new orders, mark them ready for a courier, or reject them with a reason. Every action is
        recorded in the activity log under your name.
      </Notice>
      <div className="mt-8">
        <KitchenBoard initial={orders} timeZone={CAMPUS_TIME_ZONE} />
      </div>
    </main>
  );
}
