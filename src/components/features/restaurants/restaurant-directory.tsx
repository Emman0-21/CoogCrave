import Link from "next/link";

import type { RestaurantSummary } from "@/shared/schemas/ordering";

import { OpenStatus } from "./open-status";
import { SampleMenuLabel } from "./sample-label";

/**
 * Restaurants as a campus directory board: one row per place, name on the left, status on the right.
 * The whole row is the link, with the restaurant name as its accessible name.
 */
export function RestaurantDirectory({
  restaurants,
  now,
  timeZone,
  labelledBy,
}: {
  restaurants: RestaurantSummary[];
  now: Date;
  timeZone: string;
  labelledBy: string;
}) {
  return (
    <ul aria-labelledby={labelledBy} className="divide-y divide-line border-y border-line">
      {restaurants.map((r) => (
        <li key={r.id}>
          <Link
            href={`/restaurants/${r.slug}`}
            className="group grid gap-x-8 gap-y-1.5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline"
          >
            <span className="font-display text-xl font-extrabold group-hover:underline group-hover:underline-offset-4 sm:text-2xl">
              {r.name}
            </span>
            <OpenStatus status={r} now={now} timeZone={timeZone} className="sm:justify-self-end" />
            <span className="text-ink-muted sm:col-span-2">
              {r.cuisines.length > 0 && `${r.cuisines.map((c) => c.name).join(", ")}. `}
              Pickup at {r.location.shortName}.
            </span>
            {r.matchingItems.length > 0 && (
              <span className="sm:col-span-2">
                <span className="text-ink-muted">On the menu: </span>
                {r.matchingItems.join(", ")}
              </span>
            )}
            <SampleMenuLabel className="sm:col-span-2" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
