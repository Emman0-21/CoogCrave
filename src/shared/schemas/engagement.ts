import { z } from "zod";

import type { NotificationType } from "@/shared/enums";

import { optionalNote } from "./ordering";

/** Notifications and reviews (docs/API_SPEC.md §7 review, §9). Request schemas are strict. */

// ── Notifications ──────────────────────────────────────────────────────────────

export const notificationsQuerySchema = z.strictObject({
  unreadOnly: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
});
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;

export const markReadSchema = z.union([
  z.strictObject({ ids: z.array(z.uuid()).min(1).max(50) }),
  z.strictObject({ all: z.literal(true) }),
]);
export type MarkReadInput = z.infer<typeof markReadSchema>;

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  orderId: string | null;
  /** Where the notification leads: the customer's order page, the courier's pages, or nowhere. */
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListView {
  data: NotificationView[];
  nextCursor: string | null;
  unreadCount: number;
}

// ── Reviews ────────────────────────────────────────────────────────────────────

export const reviewSchema = z.strictObject({
  rating: z
    .number()
    .int("Choose 1 to 5 stars.")
    .min(1, "Choose 1 to 5 stars.")
    .max(5, "Choose 1 to 5 stars."),
  comment: optionalNote(500),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export interface ReviewView {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}
