import type { Metadata } from "next";

import { AdminPage } from "@/components/features/admin/admin-page";
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
    <AdminPage title="Kitchen Console">
      <Notice tone="info" className="mt-6 max-w-prose">
        <strong>Simulated restaurant.</strong> No real restaurant receives these orders. You play the kitchen:
        confirm new orders, mark them ready for a courier, or reject them with a reason. Every action is
        recorded in the activity log under your name.
      </Notice>
      <div className="mt-8">
        <KitchenBoard initial={orders} timeZone={CAMPUS_TIME_ZONE} />
      </div>
    </AdminPage>
  );
}
