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
  Truck,
  UsersRound,
  ChartNoAxesCombined,
  RotateCcw,
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

export function AdminAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          <Link onClick={() => setSidebarOpen(false)} href="/admin" className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${pathname === "/admin" ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50"}`}>
            <LayoutDashboard className="h-5 w-5" />
            Overview
          </Link>
          <Link onClick={() => setSidebarOpen(false)} href="/admin/store-applications" className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${pathname.startsWith("/admin/store-applications") ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50"}`}>
            <Store className="h-5 w-5" />
            Store applications
          </Link>
          <Link onClick={() => setSidebarOpen(false)} href="/admin/driver-applications" className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${pathname.startsWith("/admin/driver-applications") ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50"}`}>
            <Truck className="h-5 w-5" />
            Driver applications
          </Link>
          <Link onClick={() => setSidebarOpen(false)} href="/admin/customers" className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${pathname.startsWith("/admin/customers") ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50"}`}>
            <UsersRound className="h-5 w-5" />
            Customers
          </Link>
          <Link onClick={() => setSidebarOpen(false)} href="/admin/reports" className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${pathname.startsWith("/admin/reports") ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50"}`}>
            <ChartNoAxesCombined className="h-5 w-5" />
            Reports
          </Link>
          <Link onClick={() => setSidebarOpen(false)} href="/admin/deletion-requests" className={"flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition " + (pathname.startsWith("/admin/deletion-requests") ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50")}>
            <FileWarning className="h-5 w-5" />
            Deletion requests
          </Link>
          <Link onClick={() => setSidebarOpen(false)} href="/admin/orders" className={"flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition " + (pathname.startsWith("/admin/orders") ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50")}>
            <ClipboardList className="h-5 w-5" />
            Orders & delivery
          </Link>
          <Link onClick={() => setSidebarOpen(false)} href="/admin/finance" className={"flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition " + (pathname.startsWith("/admin/finance") ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50")}>
            <CircleDollarSign className="h-5 w-5" />
            Finance
          </Link>
          <Link onClick={() => setSidebarOpen(false)} href="/admin/refund-claims" className={"flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition " + (pathname.startsWith("/admin/refund-claims") ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50")}>
            <RotateCcw className="h-5 w-5" />
            Refund claims
          </Link>
          <Link onClick={() => setSidebarOpen(false)} href="/admin/promotions" className={"flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition " + (pathname.startsWith("/admin/promotions") ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50")}>
            <Tag className="h-5 w-5" />
            Home promotions
          </Link>
          <Link onClick={() => setSidebarOpen(false)} href="/admin/settings" className={"flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition " + (pathname.startsWith("/admin/settings") ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50")}>
            <Settings className="h-5 w-5" />
            Platform settings
          </Link>
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
        {children}
      </main>
    </div>
  );
}
