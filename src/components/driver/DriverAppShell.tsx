"use client";
/* eslint-disable react-hooks/set-state-in-effect -- pathname changes intentionally close the mobile navigation shell */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { Bell, CreditCard, LayoutDashboard, LogOut, Menu, Settings, X } from "lucide-react";
import { auth } from "@/lib/firebase";
import {
  driverWorkspaceClientService,
  DriverWorkspaceClientError,
} from "@/services/driver/driverWorkspaceClientService";
import { BrandedLoader } from "@/components/ui/BrandedLoader";
import { DriverNotificationBell } from "@/components/driver/DriverNotificationBell";

const navigation = [
  { href: "/driver/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/driver/payments", label: "Payments", icon: CreditCard },
  { href: "/driver/notifications", label: "Notifications", icon: Bell },
  { href: "/driver/settings", label: "Settings", icon: Settings },
];

export function DriverAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    driverWorkspaceClientService.getSummary()
      .then(() => { if (active) setReady(true); })
      .catch((reason: unknown) => {
        if (
          reason instanceof DriverWorkspaceClientError &&
          (reason.status === 401 || reason.status === 403)
        ) {
          router.replace("/login");
          return;
        }

        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load the driver workspace."
          );
        }
      });
    return () => { active = false; };
  }, [router]);

  /* Close the mobile drawer as soon as the person continues using the page. */
  useEffect(() => {
    const closeOnScroll = () => setSidebarOpen(false);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => window.removeEventListener("scroll", closeOnScroll, true);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  /*
   * Signing out clears the Firebase session before navigating away, so a
   * protected driver route cannot remain available from browser history.
   */
  const handleLogout = async () => {
    setSidebarOpen(false);
    await auth.signOut();
    router.replace("/login");
  };

  if (error) {
    return <main className="mx-auto flex min-h-screen max-w-lg items-center p-6"><section className="w-full rounded-2xl border border-red-100 bg-white p-6 shadow-sm"><h1 className="text-xl font-bold text-slate-900">Unable to load the driver app</h1><p className="mt-2 text-sm text-slate-600">{error}</p><button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white">Try again</button></section></main>;
  }

  if (!ready) return <BrandedLoader message="Loading driver app" />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
        <div className="flex items-center gap-2"><Image src="/icon/icon-192.png" alt="LIA" width={28} height={28} className="rounded-md" /><p className="font-bold text-orange-600">LIA Driver</p></div>
        <div className="flex items-center gap-1"><DriverNotificationBell /><button onClick={() => setSidebarOpen(true)} className="rounded-xl p-2 text-slate-700 hover:bg-orange-50" aria-label="Open driver navigation"><Menu className="h-5 w-5" /></button></div>
      </header>
      {sidebarOpen && <button aria-label="Close driver navigation" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-black/30 md:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white p-5 transition-transform duration-200 md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-8 flex items-center justify-between"><div className="flex items-center gap-2"><Image src="/icon/icon-192.png" alt="LIA" width={30} height={30} className="rounded-md" /><p className="text-xl font-bold text-orange-600">LIA Driver</p></div><div className="flex items-center gap-1"><div className="hidden md:block"><DriverNotificationBell /></div><button onClick={() => setSidebarOpen(false)} className="rounded-lg p-2 hover:bg-orange-50 md:hidden" aria-label="Close driver navigation"><X className="h-5 w-5" /></button></div></div>
        <nav className="space-y-2">{navigation.map((item) => {
          const Icon = item.icon; const selected = pathname === item.href;
          return <Link onClick={() => setSidebarOpen(false)} key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${selected ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="h-5 w-5" />{item.label}</Link>;
        })}<div className="my-4 border-t border-slate-200" /><button type="button" onClick={() => void handleLogout()} className="flex w-full items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 ring-1 ring-red-100 transition hover:bg-red-100"><LogOut className="h-5 w-5" />Log out</button></nav>
      </aside>
      <main className="mx-auto min-h-screen max-w-6xl p-4 md:ml-72 md:p-8">{children}</main>
    </div>
  );
}
