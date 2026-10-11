import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPage } from "@/components/features/admin/admin-page";
import { AcceptingOrdersSwitch, MenuItemEditor } from "@/components/features/admin/menu-editor";
import { requirePageAccess } from "@/server/auth/page-guards";
import { AppError } from "@/server/http/errors";
import { getRestaurant } from "@/server/services/catalog";

export const metadata: Metadata = { title: "Edit menu" };

/** One restaurant's menu for admins (PRD ADM-5, essentials): prices and sold-out items. */
export default async function AdminMenuPage({ params }: PageProps<"/admin/restaurants/[slug]">) {
  const { slug } = await params;
  await requirePageAccess("admin", `/admin/restaurants/${slug}`);
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();

  let restaurant;
  try {
    restaurant = await getRestaurant(slug);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <AdminPage
      title={restaurant.name}
      intro={
        <>
          Price changes apply to carts right away; orders already placed keep the price they were placed at.{" "}
          <Link href={`/restaurants/${restaurant.slug}`} className="underline underline-offset-4">
            See the customer page
          </Link>
        </>
      }
    >
      <p className="mt-4">
        <Link href="/admin/restaurants" className="underline underline-offset-4">
          All restaurants
        </Link>
      </p>
      <div className="mt-6">
        <AcceptingOrdersSwitch
          restaurantId={restaurant.id}
          restaurantName={restaurant.name}
          isAcceptingOrders={restaurant.isAcceptingOrders}
        />
      </div>
      {restaurant.menu.map((category) => (
        <section key={category.categoryId} aria-labelledby={`cat-${category.categoryId}`} className="mt-10">
          <h2 id={`cat-${category.categoryId}`} className="font-display text-2xl font-extrabold">
            {category.name}
          </h2>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {category.items.map((item) => (
              <MenuItemEditor key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </AdminPage>
  );
}
