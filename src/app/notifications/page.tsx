import type { Metadata } from "next";

import { NotificationList } from "@/components/features/notifications/notification-list";
import { requirePageAccess } from "@/server/auth/page-guards";
import { listNotifications } from "@/server/services/notifications";
import { CAMPUS_TIME_ZONE } from "@/shared/format";

export const metadata: Metadata = { title: "Inbox" };

/** Notifications inbox (PRD NTF-2). */
export default async function NotificationsPage() {
  const actor = await requirePageAccess("user", "/notifications");
  const initial = await listNotifications(actor.userId, { limit: 20 });
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-6 pb-16 sm:px-8 md:pt-10">
      <h1 className="font-display text-4xl leading-[1.05] font-black font-wide sm:text-5xl">Inbox</h1>
      <NotificationList initial={initial} timeZone={CAMPUS_TIME_ZONE} />
    </main>
  );
}
