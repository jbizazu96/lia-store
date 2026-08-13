import type {AdminPermission} from "@/types/adminAccess";

export function requiredAdminPermission(pathname: string): AdminPermission | "master" | null {
  if (pathname.startsWith("/admin/users")) return "master";
  if (pathname.startsWith("/admin/settings/audit-logs")) return "master";
  if (pathname === "/admin") return "overview";
  if (pathname.startsWith("/admin/store-applications")) return "stores";
  if (pathname.startsWith("/admin/driver-applications")) return "drivers";
  if (pathname.startsWith("/admin/customers")) return "customers";
  if (pathname.startsWith("/admin/delivery-zones")) return "delivery_zones";
  if (pathname.startsWith("/admin/product-categories")) return "product_categories";
  if (pathname.startsWith("/admin/reports")) return "reports";
  if (pathname.startsWith("/admin/deletion-requests")) return "deletion_requests";
  if (pathname.startsWith("/admin/orders")) return "orders";
  if (pathname.startsWith("/admin/finance")) return "finance";
  if (pathname.startsWith("/admin/refund-claims")) return "refunds";
  if (pathname.startsWith("/admin/support")) return "support";
  if (pathname.startsWith("/admin/promotions")) return "promotions";
  if (pathname.startsWith("/admin/settings")) return "settings";
  if (pathname.startsWith("/admin/notifications")) return null;
  return "master";
}
