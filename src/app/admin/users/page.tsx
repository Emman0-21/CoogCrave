import type { Metadata } from "next";
import Link from "next/link";

import { AdminPage } from "@/components/features/admin/admin-page";
import { COURIER_STATUS_LABEL } from "@/components/features/admin/labels";
import { ReasonAction } from "@/components/features/admin/reason-action";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { requirePageAccess } from "@/server/auth/page-guards";
import { AppError } from "@/server/http/errors";
import { listUsers } from "@/server/services/admin-people";
import { CAMPUS_TIME_ZONE, formatDateTime } from "@/shared/format";
import { adminUsersQuerySchema, type AdminUserView } from "@/shared/schemas/admin";

export const metadata: Metadata = { title: "Users" };

const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

function UserActions({ user, adminId }: { user: AdminUserView; adminId: string }) {
  if (user.id === adminId) return <p className="text-sm text-ink-muted">This is you.</p>;
  if (user.role === "ADMIN")
    return <p className="text-sm text-ink-muted">Admin accounts are managed from the command line.</p>;
  return user.suspendedAt ? (
    <ReasonAction
      label="Lift suspension"
      accessibleLabel={`Lift suspension: ${user.name}`}
      submitLabel="Lift suspension"
      reasonLabel="Reason"
      reasonHint="Recorded in the activity log."
      reasonRequired
      maxLength={300}
      method="PATCH"
      url={`/api/v1/admin/users/${user.id}`}
      body={{ suspended: false }}
      reasonField="reason"
      doneText="Suspension lifted."
    />
  ) : (
    <ReasonAction
      label="Suspend"
      accessibleLabel={`Suspend ${user.name}`}
      submitLabel="Suspend account"
      reasonLabel="Reason"
      reasonHint="They're signed out everywhere and can't sign in until this is lifted. Recorded in the activity log."
      reasonRequired
      maxLength={300}
      method="PATCH"
      url={`/api/v1/admin/users/${user.id}`}
      body={{ suspended: true }}
      reasonField="reason"
      doneText="Suspended."
    />
  );
}

/** Users (PRD ADM-3): search by name or email; suspend and lift suspensions with a reason. */
export default async function UsersPage(props: PageProps<"/admin/users">) {
  const admin = await requirePageAccess("admin", "/admin/users");
  const params = await props.searchParams;
  const q = first(params.q)?.trim() || undefined;
  const suspendedOnly = first(params.suspended) === "true";
  const parsed = adminUsersQuerySchema.safeParse({
    q,
    suspended: suspendedOnly ? "true" : undefined,
    cursor: first(params.cursor),
  });

  let page;
  let badLink = !parsed.success;
  try {
    page = await listUsers(parsed.success ? parsed.data : adminUsersQuerySchema.parse({}));
  } catch (error) {
    if (!(error instanceof AppError && error.code === "VALIDATION_ERROR")) throw error;
    badLink = true;
    page = await listUsers(adminUsersQuerySchema.parse({ q, suspended: suspendedOnly ? "true" : undefined }));
  }
  const nextHref = page.nextCursor
    ? `/admin/users?${new URLSearchParams({
        ...(q ? { q } : {}),
        ...(suspendedOnly ? { suspended: "true" } : {}),
        cursor: page.nextCursor,
      })}`
    : null;

  return (
    <AdminPage title="Users" intro="Everyone with an account, newest first.">
      <form method="get" action="/admin/users" role="search" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="user-search" className="block font-bold">
            Name or email
          </label>
          <input
            id="user-search"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            className="mt-1 block w-full rounded-control border border-line-strong bg-canvas px-3.5 py-2.5"
          />
        </div>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            name="suspended"
            value="true"
            defaultChecked={suspendedOnly}
            className="size-5"
          />
          Suspended only
        </label>
        <button type="submit" className={buttonClasses("primary")}>
          Search
        </button>
      </form>

      {badLink && (
        <Notice tone="error" className="mt-4">
          That page link wasn&apos;t valid, so this shows the first page.
        </Notice>
      )}

      {page.data.length === 0 ? (
        <p className="mt-8 text-ink-muted">
          {q ? `Nobody matches “${q}”.` : suspendedOnly ? "Nobody is suspended." : "No users yet."}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line" aria-label="Users">
          {page.data.map((user) => (
            <li
              key={user.id}
              className="grid gap-x-8 gap-y-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start"
            >
              <div>
                <p className="font-bold">
                  {user.name}
                  {user.role === "ADMIN" && <span className="font-normal text-ink-muted"> (admin)</span>}
                </p>
                <p className="break-all text-ink-muted">{user.email}</p>
                <p className="mt-1 text-sm">
                  Joined {formatDateTime(user.createdAt, CAMPUS_TIME_ZONE)}
                  {!user.emailVerified && ". Email not confirmed"}
                  {user.courierStatus &&
                    `. Courier: ${COURIER_STATUS_LABEL[user.courierStatus].toLowerCase()}`}
                  {user.suspendedAt && (
                    <strong className="text-danger-700">
                      . Suspended {formatDateTime(user.suspendedAt, CAMPUS_TIME_ZONE)}
                    </strong>
                  )}
                </p>
              </div>
              <div>
                <UserActions user={user} adminId={admin.userId} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {nextHref && (
        <Link href={nextHref} className="mt-6 inline-block font-bold underline underline-offset-4">
          Show older accounts
        </Link>
      )}
    </AdminPage>
  );
}
