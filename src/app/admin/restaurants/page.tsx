import type { Metadata } from "next";
import Link from "next/link";

import { AdminPage } from "@/components/features/admin/admin-page";
import { AcceptingOrdersSwitch } from "@/components/features/admin/menu-editor";
import { OpenStatus } from "@/components/features/restaurants/open-status";
import { requirePageAccess } from "@/server/auth/page-guards";
import { listRestaurants } from "@/server/services/catalog";
import { CAMPUS_TIME_ZONE } from "@/shared/format";

export const metadata: Metadata = { title: "Restaurants" };

/** Restaurants for admins (PRD ADM-4, essentials): open or close each for orders, and go to its menu. */
export default async function AdminRestaurantsPage() {
  await requirePageAccess("admin", "/admin/restaurants");
  const now = new Date();
  const restaurants = await listRestaurants({}, now);
  const alphabetical = [...restaurants].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <AdminPage
      title="Restaurants"
      intro="Stop or start orders, mark items sold out, and change prices. Running the seed or a demo reset puts the sample menus back."
    >
      <ul aria-label="Restaurants" className="mt-8 divide-y divide-line border-y border-line">
        {alphabetical.map((r) => (
          <li
            key={r.id}
            className="grid gap-x-6 gap-y-3 py-5 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
          >
            <div>
              <p className="text-lg font-bold">{r.name}</p>
              <p className="text-ink-muted">{r.location.name}</p>
              <OpenStatus status={r} now={now} timeZone={CAMPUS_TIME_ZONE} className="text-sm" />
            </div>
            <AcceptingOrdersSwitch
              restaurantId={r.id}
              restaurantName={r.name}
              isAcceptingOrders={r.isAcceptingOrders}
            />
            <Link href={`/admin/restaurants/${r.slug}`} className="font-bold underline underline-offset-4">
              Edit menu<span className="sr-only"> for {r.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </AdminPage>
  );
}
