import type { CourierStatus, UserRole } from "@/shared/enums";

/**
 * Who is making a request, resolved from the session on the server. Every authorization decision
 * takes an Actor; nothing about it comes from client input (docs/ARCHITECTURE.md §8).
 */
export interface Actor {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  suspended: boolean;
  courier: { id: string; status: CourierStatus; isOnline: boolean } | null;
}
