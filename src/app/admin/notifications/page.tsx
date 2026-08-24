"use client";

/*
|--------------------------------------------------------------------------
| Admin Notifications Page
|--------------------------------------------------------------------------
|
| This route is reached from the bell rather than left navigation. Private
| notifications remain callable-only and refresh while the page is open.
|
*/

import {
  useEffect,
  useState,
} from "react";
import {
  Bell,
  CheckCheck,
  ChevronRight,
  Trash2,
} from "lucide-react";
import {
  useRouter,
} from "next/navigation";
import {
  PageContentSkeleton,
} from "@/components/ui/PageContentSkeleton";
import {
  adminNotificationClientService,
} from "@/services/admin/adminNotificationClientService";
import type {
  AdminNotification,
} from "@/types/adminNotification";

function displayDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminNotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const load = () => void adminNotificationClientService
    .getNotifications()
    .then((result) => {
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      setNextCursor(result.nextCursor);
      setError("");
    })
    .catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Unable to load notifications.");
    })
    .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => { document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); };
  }, []);

  const openNotification = async (notification: AdminNotification) => {
    try {
      if (!notification.read) {
        await adminNotificationClientService.markRead(notification.id);
        setNotifications((current) => current.map((item) => item.id === notification.id
          ? {...item, read: true}
          : item));
        setUnreadCount((current) => Math.max(0, current - 1));
      }

      if (notification.deepLink) router.push(notification.deepLink);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update the notification.");
    }
  };

  const clearAll = async () => {
    setWorking(true);
    try {
      const result = await adminNotificationClientService.clear();
      setNotifications([]);
      setUnreadCount(0);
      if (result.hasMore) load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to clear notifications.");
    } finally {
      setWorking(false);
    }
  };

  const markAllRead = async () => {
    setWorking(true);
    try {
      await adminNotificationClientService.markAllRead();
      setNotifications((current) => current.map((notification) => ({...notification, read: true})));
      setUnreadCount(0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to mark notifications as read.");
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <PageContentSkeleton />;

  const unread = unreadCount;

  return (
    <section className="mx-auto max-w-3xl">
      <button
        type="button"
        onClick={() => router.push("/admin")}
        className="mb-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
      >
        <ChevronRight className="h-4 w-4 rotate-180" />
        Back
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold tracking-wide text-orange-600">ADMIN</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Notifications</h1>
          <p className="mt-2 text-sm text-slate-600">
            {unread} unread operational {unread === 1 ? "update" : "updates"}.
          </p>
        </div>
        {notifications.length > 0 && (
          <div className="flex flex-wrap gap-2">
          {unread > 0 && <button type="button" disabled={working} onClick={() => void markAllRead()} className="inline-flex items-center gap-2 rounded-xl bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-700 ring-1 ring-orange-200 hover:bg-orange-100 disabled:opacity-50"><CheckCheck className="h-4 w-4" />Mark all as read</button>}
          <button
            type="button"
            disabled={working}
            onClick={() => void clearAll()}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Clear all
          </button>
          </div>
        )}
      </div>

      {error && <p className="mt-5 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {notifications.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-100">
          <Bell className="mx-auto h-10 w-10 text-orange-500" />
          <h2 className="mt-4 text-lg font-bold text-slate-900">No notifications yet</h2>
          <p className="mt-2 text-sm text-slate-500">New applications, documents, inventory, and payment events will appear here.</p>
        </div>
      ) : (
        <div className="mt-7 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
          {notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => void openNotification(notification)}
              className={"flex w-full items-start gap-3 border-b border-slate-100 p-5 text-left transition last:border-b-0 hover:bg-orange-50/50 " + (notification.read ? "opacity-70" : "bg-orange-50/30")}
            >
              <span className={"mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full " + (notification.read ? "bg-slate-300" : "bg-orange-600")} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-bold text-slate-900">{notification.title}</span>
                  <span className="text-xs text-slate-400">{displayDate(notification.createdAt)}</span>
                </span>
                <span className="mt-1 block text-sm leading-6 text-slate-600">{notification.body}</span>
              </span>
              {notification.deepLink
                ? <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-400" />
                : <CheckCheck className="mt-1 h-5 w-5 shrink-0 text-slate-300" />}
            </button>
          ))}
        </div>
      )}
      {nextCursor && <button data-admin-read-action type="button" onClick={() => void adminNotificationClientService.getNotifications(nextCursor).then((result) => { setNotifications((current) => [...current, ...result.notifications]); setNextCursor(result.nextCursor); setUnreadCount(result.unreadCount); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load more notifications."))} className="mt-4 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold">Load more notifications</button>}
    </section>
  );
}
