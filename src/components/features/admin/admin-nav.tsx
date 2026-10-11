"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Today", exact: true },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/kitchen", label: "Kitchen" },
  { href: "/admin/restaurants", label: "Restaurants" },
  { href: "/admin/couriers", label: "Couriers" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/activity", label: "Activity" },
] as const;

/** Admin section navigation. The current page is marked with aria-current and a heavy underline. */
export function AdminNav({ pendingApplications }: { pendingApplications: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="border-b border-line">
      <ul className="-mb-px flex gap-x-6 overflow-x-auto px-5 sm:px-8">
        {LINKS.map((link) => {
          const current = "exact" in link ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={
                  current
                    ? "inline-flex min-h-11 items-center gap-1.5 border-b-[3px] border-action font-bold"
                    : "inline-flex min-h-11 items-center gap-1.5 border-b-[3px] border-transparent text-ink-muted hover:text-ink"
                }
              >
                {link.label}
                {link.href === "/admin/couriers" && pendingApplications > 0 && " "}
                {link.href === "/admin/couriers" && pendingApplications > 0 && (
                  <span className="rounded-full bg-action px-1.5 text-sm leading-5 font-bold text-action-ink">
                    {pendingApplications}
                    <span className="sr-only">{" waiting"}</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
