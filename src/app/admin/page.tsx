import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { requirePageAccess } from "@/server/auth/page-guards";
import { AppError } from "@/server/http/errors";
import { type AuditEventView, listAuditEvents } from "@/server/services/audit";

export const metadata: Metadata = { title: "Admin" };

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

export default async function AdminPage(props: PageProps<"/admin">) {
  await requirePageAccess("admin", "/admin");
  const raw = (await props.searchParams).cursor;
  const { page, badCursor } = await loadPage(typeof raw === "string" ? raw : undefined);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-6 pb-16 sm:px-8 md:pt-12">
      <h1 className="font-display text-4xl leading-[1.05] font-black font-wide sm:text-5xl">Admin</h1>
      <p className="mt-4 max-w-prose text-lg text-ink-muted">
        Every administrative action is recorded here and can&apos;t be edited or deleted. Courier approvals,
        restaurant management, and order tools arrive in later releases.
      </p>
      <p className="mt-6">
        <Link href="/admin/kitchen" className={buttonClasses("primary")}>
          Open the Kitchen Console
        </Link>
      </p>

      <section aria-labelledby="audit-heading" className="mt-10">
        <h2 id="audit-heading" className="font-display text-2xl font-extrabold">
          Activity log
        </h2>
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
            <table className="w-full min-w-[40rem] border-collapse text-left">
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
                  <th scope="col" className="py-2 font-bold">
                    Target
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
                    <td className="py-3 break-all text-ink-muted">
                      {event.targetType} {event.targetId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page.nextCursor && (
          <Link
            href={`/admin?cursor=${encodeURIComponent(page.nextCursor)}`}
            className="mt-6 inline-block font-bold underline underline-offset-4"
          >
            Show older activity
          </Link>
        )}
      </section>
    </main>
  );
}
