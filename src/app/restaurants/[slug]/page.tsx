import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AddToCart } from "@/components/features/restaurants/add-to-cart";
import { OpenStatus } from "@/components/features/restaurants/open-status";
import { Notice } from "@/components/ui/notice";
import { getCurrentActor } from "@/server/auth/session";
import { AppError } from "@/server/http/errors";
import { getRestaurant } from "@/server/services/catalog";
import { formatCents, formatMinute, WEEKDAY_NAMES } from "@/shared/format";
import type { RestaurantDetail } from "@/shared/schemas/ordering";

async function load(slug: string): Promise<RestaurantDetail> {
  try {
    return await getRestaurant(slug);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps<"/restaurants/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { title: "Restaurant" };
  try {
    return { title: (await getRestaurant(slug)).name };
  } catch {
    return { title: "Restaurant" };
  }
}

function hoursByDay(restaurant: RestaurantDetail): { day: string; text: string }[] {
  return WEEKDAY_NAMES.map((day, index) => {
    const ranges = restaurant.hours.filter((h) => h.dayOfWeek === index);
    return {
      day,
      text: ranges.length
        ? ranges
            .map((h) =>
              h.opensAtMinute === 0 && h.closesAtMinute >= 1440
                ? "Open all day"
                : `${formatMinute(h.opensAtMinute)} to ${formatMinute(h.closesAtMinute)}`,
            )
            .join(", ")
        : "Closed",
    };
  });
}

/** Restaurant page: hours, pickup building, and the menu (PRD CAT-4, CAT-6). */
export default async function RestaurantPage({ params }: PageProps<"/restaurants/[slug]">) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) notFound();
  const [restaurant, actor] = await Promise.all([load(slug), getCurrentActor()]);
  const signedIn = Boolean(actor && !actor.suspended && actor.emailVerified);
  const now = new Date();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-6 pb-16 sm:px-8 md:pt-10">
      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_17rem] md:gap-14">
        <div>
          <h1 className="font-display text-4xl leading-[1.05] font-black font-wide sm:text-5xl">
            {restaurant.name}
          </h1>
          {restaurant.description && <p className="mt-3 text-lg text-ink-muted">{restaurant.description}</p>}
          <p className="mt-4">
            <OpenStatus status={restaurant} now={now} timeZone={restaurant.timeZone} className="font-bold" />
          </p>
          <Notice tone="info" className="mt-6 max-w-prose">
            <p>
              <strong>Sample menu, not affiliated.</strong> {restaurant.name} is a real campus spot, but this
              menu, its prices, and these hours are made up for the CoogCrave demo.
            </p>
          </Notice>
        </div>

        <aside
          aria-label="Pickup and hours"
          className="rounded-ticket bg-surface px-5 pt-7 pb-8 ticket-edges"
        >
          <h2 className="font-bold">Pickup</h2>
          <p className="mt-1">{restaurant.location.name}</p>
          {restaurant.pickupNotes && <p className="mt-1 text-sm text-ink-muted">{restaurant.pickupNotes}</p>}
          <h2 className="mt-5 font-bold">Sample hours</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {hoursByDay(restaurant).map(({ day, text }) => (
              <div key={day} className="contents">
                <dt className="text-ink-muted">{day}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>

      {!restaurant.canOrder && (
        <Notice tone="info" className="mt-8">
          {restaurant.name} isn&apos;t taking orders right now. You can look at the menu, and order once it
          opens.
        </Notice>
      )}

      <div className="mt-12 space-y-12">
        {restaurant.menu.map((category) => (
          <section key={category.categoryId} aria-labelledby={`cat-${category.categoryId}`}>
            <h2 id={`cat-${category.categoryId}`} className="font-display text-2xl font-extrabold">
              {category.name}
            </h2>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {category.items.map((item) => (
                <li
                  key={item.id}
                  className="grid gap-x-6 gap-y-2 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                >
                  <div>
                    <h3 className="text-lg font-bold">{item.name}</h3>
                    {item.description && <p className="mt-1 text-ink-muted">{item.description}</p>}
                    <p className="mt-1.5">
                      {formatCents(item.priceCents)}
                      {item.optionGroups.length > 0 && <span className="text-ink-muted">, with choices</span>}
                    </p>
                  </div>
                  <AddToCart
                    item={item}
                    restaurant={{ name: restaurant.name, slug: restaurant.slug }}
                    canOrder={restaurant.canOrder}
                    signedIn={signedIn}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
