export const ADMIN_PERMISSIONS = [
  "overview",
  "stores",
  "drivers",
  "customers",
  "delivery_zones",
  "product_categories",
  "reports",
  "deletion_requests",
  "orders",
  "finance",
  "refunds",
  "support",
  "promotions",
  "settings",
] as const;

export type AdminPermission = typeof ADMIN_PERMISSIONS[number];
export type AdminAccessLevel = "read" | "write";
export type AdminPermissions = Partial<Record<AdminPermission, AdminAccessLevel>>;

export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, string> = {
  overview: "Overview",
  stores: "Store applications",
  drivers: "Driver applications",
  customers: "Customers",
  delivery_zones: "Delivery zones",
  product_categories: "Product categories",
  reports: "Reports",
  deletion_requests: "Deletion requests",
  orders: "Orders and delivery",
  finance: "Finance",
  refunds: "Refund claims",
  support: "Support requests",
  promotions: "Home promotions",
  settings: "Platform settings",
};

export interface AdminAccessProfile {
  uid: string;
  email: string;
  displayName: string;
  role: "master_admin" | "staff_admin";
  permissions: AdminPermissions;
}

export interface ManagedAdminUser extends AdminAccessProfile {
  isActive: boolean;
  createdAt: string | null;
  lastWorkspaceAccessAt: string | null;
}

export function adminHasPermission(
  administrator: AdminAccessProfile,
  permission: AdminPermission,
): boolean {
  return administrator.role === "master_admin" ||
    administrator.permissions[permission] === "read" ||
    administrator.permissions[permission] === "write";
}

export function adminCanWrite(administrator: AdminAccessProfile, permission: AdminPermission): boolean {
  return administrator.role === "master_admin" || administrator.permissions[permission] === "write";
}
