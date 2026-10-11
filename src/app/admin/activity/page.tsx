import type { Metadata } from "next";
import Link from "next/link";

import { AdminPage } from "@/components/features/admin/admin-page";
import { Notice } from "@/components/ui/notice";
import { requirePageAccess } from "@/server/auth/page-guards";
import { AppError } from "@/server/http/errors";
import { type AuditEventView, listAuditEvents } from "@/server/services/audit";

export const metadata: Metadata = { title: "Activity log" };

const PAGE_SIZE = 25;

const timeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Chicago",
});

async function loadPage(cursor: string | undefined) {
  try {
    return { page: await listAuditEvents({ limit: PAGE_SIZE, cursor }), badCursor: false };
  } catch (error) {
    if (error instanceof AppError && error.code === "VALIDATION_ERROR") {
      return { page: await listAuditEvents({ limit: PAGE_SIZE }), badCursor: true };
    }
    throw error;
  }
}

function who(event: AuditEventView): string {
  if (event.actor) return `${event.actor.name} (${event.actor.email})`;
  const via = typeof event.metadata.via === "string" ? event.metadata.via : "script";
  return `System (${via})`;
}

/** The human-readable part of an event's metadata: a reason or note, or what changed. */
function details(event: AuditEventView): string {
  const m = event.metadata;
  const parts: string[] = [];
  if (typeof m.orderNumber === "string") parts.push(m.orderNumber);
  if (typeof m.from === "string" && typeof m.to === "string") parts.push(`${m.from} → ${m.to}`);
  if (typeof m.reason === "string") parts.push(`“${m.reason}”`);
  if (typeof m.note === "string") parts.push(`“${m.note}”`);
  return parts.join(", ");
}

/** Where to look at the thing an event was about, when there's a page for it. */
function targetHref(event: AuditEventView): string | null {
  if (event.targetType === "order") return `/admin/orders/${event.targetId}`;
  if (event.targetType === "courier") return "/admin/couriers?status=ALL";
  return null;
}

/** Activity log (PRD ADM-9): every admin action, newest first. Append-only; nothing here can be edited. */
export default async function ActivityPage(props: PageProps<"/admin/activity">) {
  await requirePageAccess("admin", "/admin/activity");
  const raw = (await props.searchParams).cursor;
  const { page, badCursor } = await loadPage(typeof raw === "string" ? raw : undefined);

  return (
    <AdminPage
      title="Activity log"
      intro="Every administrative action is recorded here, newest first, and can't be edited or deleted."
    >
      <section aria-label="Actions" className="mt-8">
        {badCursor && (
          <Notice tone="error" className="mt-4">
            That page link wasn&apos;t valid, so this shows the newest activity.
          </Notice>
        )}
        {page.data.length === 0 ? (
          <p className="mt-4 text-ink-muted">
            No administrative actions yet. Creating an admin account from the command line is the first thing
            you&apos;ll see here.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-left">
              <caption className="sr-only">Administrative actions, newest first</caption>
              <thead>
                <tr className="border-b border-line-strong">
                  <th scope="col" className="py-2 pr-4 font-bold">
                    When
                  </th>
                  <th scope="col" className="py-2 pr-4 font-bold">
                    Who
                  </th>
                  <th scope="col" className="py-2 pr-4 font-bold">
                    Action
                  </th>
                  <th scope="col" className="py-2 pr-4 font-bold">
                    Target
                  </th>
                  <th scope="col" className="py-2 font-bold">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((event) => (
                  <tr key={event.id} className="border-b border-line align-top">
                    <td className="py-3 pr-4 whitespace-nowrap tabular-nums">
                      <time dateTime={event.createdAt}>{timeFormat.format(new Date(event.createdAt))}</time>
                    </td>
                    <td className="py-3 pr-4 break-all">{who(event)}</td>
                    <td className="py-3 pr-4 font-bold">{event.action}</td>
                    <td className="py-3 pr-4 break-all text-ink-muted">
                      {targetHref(event) ? (
                        <Link href={targetHref(event)!} className="underline underline-offset-4">
                          {event.targetType} {event.targetId.slice(0, 8)}
                        </Link>
                      ) : (
                        <>
                          {event.targetType} {event.targetId.slice(0, 8)}
                        </>
                      )}
                    </td>
                    <td className="py-3">{details(event)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page.nextCursor && (
          <Link
            href={`/admin/activity?cursor=${encodeURIComponent(page.nextCursor)}`}
            className="mt-6 inline-block font-bold underline underline-offset-4"
          >
            Show older activity
          </Link>
        )}
      </section>
    </AdminPage>
  );
}
