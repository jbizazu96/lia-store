import {
  AdminAppShell,
} from "@/components/admin/AdminAppShell";
import {
  AdminGuard,
} from "@/components/admin/AdminGuard";

/*
 * The admin route is protected twice: this client guard verifies the
 * Firebase session, and every administrative callable independently verifies
 * admins/{uid}. The layout alone is never treated as authorization.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGuard>
      <AdminAppShell>{children}</AdminAppShell>
    </AdminGuard>
  );
}
