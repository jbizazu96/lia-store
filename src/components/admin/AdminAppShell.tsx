"use client";

/*
|--------------------------------------------------------------------------
| Admin App Shell
|--------------------------------------------------------------------------
|
| The first admin phase exposes the operational overview only. Navigation is
| intentionally small until each destination has its protected server API.
|
*/

import {
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  FileWarning,
  LogOut,
  Menu,
  ShieldCheck,
  Store,
  ClipboardList,
  CircleDollarSign,
  Settings,
  Tag,
  MapPinned,
  Truck,
  UsersRound,
  UserCog,
  ChartNoAxesCombined,
  RotateCcw,
  ListTree,
  X,
} from "lucide-react";
import {
  useRouter,
  usePathname,
} from "next/navigation";
import {
  auth,
} from "@/lib/firebase";
import {
  AdminNotificationBell,
} from "@/components/admin/AdminNotificationBell";
import {useAdminAccess} from "@/context/AdminAccessContext";
import {requiredAdminPermission} from "@/services/admin/adminAccessRoutes";
import type {AdminPermission} from "@/types/adminAccess";

export function AdminAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {can, canWrite, isMaster} = useAdminAccess();

  const navigation: Array<{href: string; label: string; icon: typeof LayoutDashboard; permission: AdminPermission | "master"}> = [
    {href: "/admin", label: "Overview", icon: LayoutDashboard, permission: "overview"},
    {href: "/admin/store-applications", label: "Store applications", icon: Store, permission: "stores"},
    {href: "/admin/driver-applications", label: "Driver applications", icon: Truck, permission: "drivers"},
    {href: "/admin/customers", label: "Customers", icon: UsersRound, permission: "customers"},
    {href: "/admin/delivery-zones", label: "Delivery zones", icon: MapPinned, permission: "delivery_zones"},
    {href: "/admin/product-categories", label: "Product categories", icon: ListTree, permission: "product_categories"},
    {href: "/admin/reports", label: "Reports", icon: ChartNoAxesCombined, permission: "reports"},
    {href: "/admin/deletion-requests", label: "Deletion requests", icon: FileWarning, permission: "deletion_requests"},
    {href: "/admin/orders", label: "Orders & delivery", icon: ClipboardList, permission: "orders"},
    {href: "/admin/finance", label: "Finance", icon: CircleDollarSign, permission: "finance"},
    {href: "/admin/refund-claims", label: "Refund claims", icon: RotateCcw, permission: "refunds"},
    {href: "/admin/promotions", label: "Home promotions", icon: Tag, permission: "promotions"},
    {href: "/admin/settings", label: "Platform settings", icon: Settings, permission: "settings"},
    {href: "/admin/users", label: "Admin users", icon: UserCog, permission: "master"},
  ];
  const visibleNavigation = navigation.filter((item) => item.permission === "master" ? isMaster : can(item.permission));
  const requiredPermission = requiredAdminPermission(pathname);
  const hasRouteAccess = requiredPermission === null ||
    (requiredPermission === "master" ? isMaster : can(requiredPermission));
  const isReadOnly = requiredPermission !== null && requiredPermission !== "master" && !canWrite(requiredPermission);

  useEffect(() => {
    if (pathname === "/admin" && !can("overview") && visibleNavigation.length > 0) {
      router.replace(visibleNavigation[0].href);
    }
  }, [can, pathname, router, visibleNavigation]);

  const signOut = async () => {
    await auth.signOut();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
        <div className="flex items-center gap-2">
          <Image src="/icon/icon-192.png" alt="LIA" width={28} height={28} className="rounded-md" />
          <p className="font-bold text-orange-600">LIA Admin</p>
        </div>
        <div className="flex items-center gap-1">
          <AdminNotificationBell />
          <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-xl p-2 text-slate-700 hover:bg-orange-50" aria-label="Open admin navigation">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {sidebarOpen && <button type="button" aria-label="Close admin navigation" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-black/30 md:hidden" />}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white p-5 transition-transform duration-200 md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/icon/icon-192.png" alt="LIA" width={30} height={30} className="rounded-md" />
            <p className="text-xl font-bold text-orange-600">LIA Admin</p>
          </div>
          <button type="button" onClick={() => setSidebarOpen(false)} className="rounded-lg p-2 hover:bg-orange-50 md:hidden" aria-label="Close admin navigation">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-2">
          {visibleNavigation.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return <Link key={item.href} onClick={() => setSidebarOpen(false)} href={item.href} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${active ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="h-5 w-5" />{item.label}</Link>;
          })}
          <div className="my-5 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            Activation, delivery operations, financial controls, and platform settings will appear here as their protected workflows are added.
          </div>
          <div className="border-t border-slate-200 pt-4">
            <div className="mb-3 flex items-center gap-2 px-3 text-xs font-bold uppercase tracking-wide text-slate-400">
              <ShieldCheck className="h-4 w-4" />
              Protected workspace
            </div>
            <button type="button" onClick={() => void signOut()} className="flex w-full items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 ring-1 ring-red-100 hover:bg-red-100">
              <LogOut className="h-5 w-5" />
              Log out
            </button>
          </div>
        </nav>
      </aside>

      <main className="mx-auto min-h-screen max-w-7xl p-4 md:ml-72 md:p-8">
        <div className="mb-4 hidden justify-end md:flex">
          <AdminNotificationBell />
        </div>
        {hasRouteAccess ? <>
          {isReadOnly && <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">Read-only access: you can view this area, but only an administrator with write access can make changes.</div>}
          <div className={isReadOnly ? "[&_button:not([data-admin-read-action])]:hidden [&_button.text-left]:!flex" : ""}>{children}</div>
        </> : (
          <section className="mx-auto mt-16 max-w-lg rounded-2xl border border-amber-200 bg-white p-7 text-center shadow-sm">
            <ShieldCheck className="mx-auto h-10 w-10 text-amber-600" />
            <h1 className="mt-4 text-xl font-bold">You don&apos;t have access</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">The master administrator has not assigned this admin area to your account.</p>
          </section>
        )}
      </main>
    </div>
  );
}
