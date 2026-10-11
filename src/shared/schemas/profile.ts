import { z } from "zod";

/** Printable text only: no control characters or angle brackets (names appear in emails and on screen). */
const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Can't be empty.")
    .max(max, `Use at most ${max} characters.`)
    .refine((value) => !/[\u0000-\u001f\u007f<>]/.test(value), "Use letters, numbers, and punctuation only.");

/** PATCH /api/v1/me. Strict: unknown fields such as role are rejected (THREAT_MODEL T-02). */
export const updateProfileSchema = z
  .strictObject({
    displayName: plainText(60).nullable().optional(),
    defaultLocationId: z.uuid("Choose a building from the list.").nullable().optional(),
  })
  .refine((body) => body.displayName !== undefined || body.defaultLocationId !== undefined, {
    message: "Send at least one field to change.",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export interface MeResponse {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: "STUDENT" | "ADMIN";
  profile: { displayName: string | null; defaultLocationId: string | null };
  courier: { id: string; status: string; isOnline: boolean } | null;
  unreadNotifications: number;
}

export interface LocationResponse {
  id: string;
  name: string;
  shortName: string;
  description: string | null;
}
