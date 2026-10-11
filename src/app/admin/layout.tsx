import type { ReactNode } from "react";

import { AdminNav } from "@/components/features/admin/admin-nav";
import { getCurrentActor } from "@/server/auth/session";
import { checkAccess } from "@/server/domain/policies";
import { pendingApplicationCount } from "@/server/services/admin-people";

/**
 * Admin section frame. Each page enforces access itself (sign-in redirect that returns to that page, or
 * 404). The layout only decides whether to show the admin navigation, and computes nothing otherwise.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!checkAccess("admin", await getCurrentActor()).allowed) return children;
  const pending = await pendingApplicationCount();
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-6xl">
        <AdminNav pendingApplications={pending} />
      </div>
      {children}
    </div>
  );
}
