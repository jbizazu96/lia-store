"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCircle2, Trash2 } from "lucide-react";
import { BrandedLoader } from "@/components/ui/BrandedLoader";
import { useAuth } from "@/context/AuthContext";
import { notificationService } from "@/services/notification/notificationService";
import { driverWorkspaceClientService } from "@/services/driver/driverWorkspaceClientService";
import type { DriverNotification } from "@/types/driverWorkspace";

export default function DriverNotificationsPage() {
  const [notifications, setNotifications] = useState<DriverNotification[] | null>(null);
  const { user } = useAuth();
  const load = () => driverWorkspaceClientService.getNotifications().then((result) => setNotifications(result.notifications)).catch(() => setNotifications([]));
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    return notificationService.listenForNotifications(
      user.uid,
      (items) => setNotifications(items.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        type: item.type,
        read: item.read,
        createdAt: item.createdAt.toISOString(),
        ...(item.deepLink ? { deepLink: item.deepLink } : {}),
      }))),
      () => setNotifications([]),
    );
  }, [user]);
  if (!notifications) return <BrandedLoader message="Loading notifications" />;
  return <section className="mx-auto max-w-3xl"><div className="flex items-end justify-between gap-3"><div><p className="text-sm font-semibold text-orange-600">DRIVER NOTIFICATIONS</p><h1 className="mt-1 text-3xl font-bold">Updates</h1></div>{notifications.length > 0 && <button onClick={() => void driverWorkspaceClientService.clearNotifications().then(load)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"><Trash2 className="h-4 w-4" />Clear all</button>}</div>{notifications.length === 0 ? <div className="mt-6 rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-100"><Bell className="mx-auto h-9 w-9 text-orange-500" /><p className="mt-3 font-semibold">You&apos;re all caught up</p><p className="mt-1 text-sm text-slate-500">Driver approvals, Stripe updates, payments, and document reminders will appear here.</p></div> : <div className="mt-6 space-y-3">{notifications.map((notification) => <button key={notification.id} onClick={() => { if (!notification.read) void driverWorkspaceClientService.markNotificationRead(notification.id).then(load); }} className={`w-full rounded-2xl p-4 text-left shadow-sm ring-1 transition ${notification.read ? "bg-white ring-slate-100" : "bg-orange-50 ring-orange-100"}`}><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" /><div><p className="font-semibold">{notification.title}</p><p className="mt-1 text-sm text-slate-600">{notification.body}</p>{notification.createdAt && <p className="mt-2 text-xs text-slate-400">{new Date(notification.createdAt).toLocaleString()}</p>}</div></div></button>)}</div>}</section>;
}
