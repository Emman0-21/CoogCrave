import type { Metadata } from "next";
import Link from "next/link";

import { RestaurantDirectory } from "@/components/features/restaurants/restaurant-directory";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { listCuisines, listRestaurants } from "@/server/services/catalog";
import { CAMPUS_TIME_ZONE } from "@/shared/format";
import { restaurantListQuerySchema } from "@/shared/schemas/ordering";

export const metadata: Metadata = { title: "Restaurants" };

/**
 * Restaurant browsing (PRD CAT-1…3). The filter form is a plain GET form, so search and filters work
 * without JavaScript and every result page has a shareable URL.
 */
export default async function RestaurantsPage({ searchParams }: PageProps<"/restaurants">) {
  const parsed = restaurantListQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : {};
  const now = new Date();
  const [restaurants, cuisines] = await Promise.all([listRestaurants(query, now), listCuisines()]);
  const selected = new Set(query.cuisine ?? []);
  const filtering = Boolean(query.q || selected.size || query.openNow);

  const orderable = restaurants.filter((r) => r.canOrder);
  const closed = restaurants.filter((r) => !r.canOrder);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-6 pb-16 sm:px-8 md:pt-10">
      <h1 className="font-display text-4xl leading-[1.05] font-black font-wide sm:text-5xl">Eat on campus</h1>
      <p className="mt-4 max-w-prose text-lg text-ink-muted">
        Real UH campus spots with sample menus. Prices, hours, and dishes here are made up for this demo and
        don&apos;t come from the restaurants.
      </p>

      <form method="get" action="/restaurants" role="search" className="mt-8 space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-64 space-y-1.5">
            <label htmlFor="q" className="block font-bold">
              Search restaurants and dishes
            </label>
            <input
              id="q"
              name="q"
              type="search"
              maxLength={60}
              defaultValue={query.q ?? ""}
              placeholder="Tacos, cold brew, nuggets…"
              className="block w-full rounded-control border border-line-strong bg-canvas px-3.5 py-2.5 text-base placeholder:text-ink-muted"
            />
          </div>
          <button type="submit" className={buttonClasses("primary")}>
            Search
          </button>
        </div>

        <fieldset>
          <legend className="font-bold">Cuisine</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {cuisines.map((c) => (
              <label
                key={c.slug}
                className="cursor-pointer rounded-full border border-line-strong px-3.5 py-1.5 has-checked:border-ink has-checked:bg-ink has-checked:text-canvas has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-action"
              >
                <input
                  type="checkbox"
                  name="cuisine"
                  value={c.slug}
                  defaultChecked={selected.has(c.slug)}
                  className="sr-only"
                />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="inline-flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              name="openNow"
              value="true"
              defaultChecked={query.openNow ?? false}
              className="size-5 accent-action"
            />
            Only places taking orders now
          </label>
          {filtering && (
            <Link href="/restaurants" className="underline underline-offset-4">
              Clear search and filters
            </Link>
          )}
        </div>
      </form>

      {!parsed.success && (
        <Notice tone="error" className="mt-8">
          Some filters weren&apos;t valid, so they were ignored.
        </Notice>
      )}

      <p role="status" className="mt-10 text-ink-muted">
        {restaurants.length === 0
          ? "No restaurants match. Try fewer filters or a different word."
          : `${restaurants.length} ${restaurants.length === 1 ? "restaurant" : "restaurants"}${filtering ? " match" : ""}.`}
      </p>

      {orderable.length > 0 && (
        <section className="mt-6">
          <h2 id="orderable-heading" className="font-display text-2xl font-extrabold">
            Taking orders now
          </h2>
          <div className="mt-3">
            <RestaurantDirectory
              restaurants={orderable}
              now={now}
              timeZone={CAMPUS_TIME_ZONE}
              labelledBy="orderable-heading"
            />
          </div>
        </section>
      )}
      {closed.length > 0 && (
        <section className="mt-12">
          <h2 id="closed-heading" className="font-display text-2xl font-extrabold">
            Closed right now
          </h2>
          <div className="mt-3">
            <RestaurantDirectory
              restaurants={closed}
              now={now}
              timeZone={CAMPUS_TIME_ZONE}
              labelledBy="closed-heading"
            />
          </div>
        </section>
      )}
    </main>
  );
}
