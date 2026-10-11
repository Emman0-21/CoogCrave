"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestJson } from "@/client/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Notice } from "@/components/ui/notice";
import { formatDateTime } from "@/shared/format";
import type { NotificationListView, NotificationView } from "@/shared/schemas/engagement";

/**
 * The inbox (PRD NTF-2). Opening a notification marks it read, then goes to its page. "Mark all as
 * read" clears the header badge. Older notifications load a page at a time.
 */
export function NotificationList({ initial, timeZone }: { initial: NotificationListView; timeZone: string }) {
  const router = useRouter();
  const [items, setItems] = useState(initial.data);
  const [unread, setUnread] = useState(initial.unreadCount);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function markLocally(ids: string[] | "all") {
    const now = new Date().toISOString();
    setItems((list) =>
      list.map((n) =>
        n.readAt === null && (ids === "all" || ids.includes(n.id)) ? { ...n, readAt: now } : n,
      ),
    );
  }

  async function markAll() {
    setBusy(true);
    setError(null);
    const result = await requestJson("/api/v1/notifications/mark-read", { body: { all: true } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    markLocally("all");
    setUnread(0);
    router.refresh(); // the header badge
  }

  async function open(notification: NotificationView) {
    if (notification.readAt === null) {
      const result = await requestJson("/api/v1/notifications/mark-read", {
        body: { ids: [notification.id] },
      });
      // Reading the notification matters more than the read mark: go on either way, but say so.
      if (!result.ok) setError(result.error.message);
      else {
        markLocally([notification.id]);
        setUnread((n) => Math.max(0, n - 1));
      }
    }
    if (notification.href) router.push(notification.href);
    else router.refresh();
  }

  async function older() {
    if (!cursor) return;
    setBusy(true);
    const result = await requestJson<NotificationListView>(
      `/api/v1/notifications?cursor=${encodeURIComponent(cursor)}`,
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setItems((list) => [...list, ...result.data.data]);
    setCursor(result.data.nextCursor);
  }

  if (items.length === 0) {
    return (
      <p className="mt-6 text-ink-muted">
        Nothing yet. Updates about your orders and deliveries will show up here.
      </p>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-muted" aria-live="polite">
          {unread === 0 ? "All caught up." : `${unread} unread`}
        </p>
        {unread > 0 && (
          <Button variant="secondary" disabled={busy} onClick={() => void markAll()}>
            Mark all as read
          </Button>
        )}
      </div>
      {error && (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      )}
      <ul aria-label="Notifications" className="mt-4 divide-y divide-line border-y border-line">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => void open(n)}
              className="group grid w-full grid-cols-[1rem_minmax(0,1fr)] gap-x-3 py-4 text-left"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-2 size-2.5 rounded-full",
                  n.readAt === null ? "bg-action" : "bg-transparent",
                )}
              />
              <span>
                <span
                  className={cn(
                    "block group-hover:underline group-hover:underline-offset-4",
                    n.readAt === null ? "font-bold" : "",
                  )}
                >
                  {n.title}
                  {n.readAt === null && <span className="sr-only"> (unread)</span>}
                </span>
                <span className="block text-ink-muted">{n.body}</span>
                <span className="mt-1 block text-sm text-ink-muted">
                  {formatDateTime(n.createdAt, timeZone)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {cursor && (
        <Button variant="secondary" className="mt-6" disabled={busy} onClick={() => void older()}>
          Show older
        </Button>
      )}
    </div>
  );
}
