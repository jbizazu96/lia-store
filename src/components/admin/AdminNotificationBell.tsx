"use client";

/*
|--------------------------------------------------------------------------
| Admin Notification Bell
|--------------------------------------------------------------------------
|
| Admin notifications are callable-only. A short poll keeps this protected
| bell current without granting browser access to admin Firestore records.
|
*/

import {
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Bell,
} from "lucide-react";
import {
  useRouter,
} from "next/navigation";
import {
  adminNotificationClientService,
} from "@/services/admin/adminNotificationClientService";
import type {
  AdminNotification,
} from "@/types/adminNotification";

function relativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function AdminNotificationBell() {
  const router = useRouter();
  const reference = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);

  const load = () => void adminNotificationClientService
    .getNotifications()
    .then((result) => setNotifications(result.notifications))
    .catch(() => setNotifications([]));

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (reference.current && !reference.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const unread = notifications.filter((notification) => !notification.read);

  const openNotification = (notification: AdminNotification) => {
    setOpen(false);
    void adminNotificationClientService.markRead(notification.id)
      .then(load)
      .catch(() => undefined);

    if (notification.deepLink) router.push(notification.deepLink);
  };

  return (
    <div ref={reference} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-full bg-orange-600 p-2.5 text-white shadow-sm transition hover:bg-orange-700"
        aria-label="Open admin notifications"
      >
        <Bell className="h-5 w-5" />
        {unread.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-orange-700 ring-1 ring-orange-200">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 p-3">
            <p className="font-bold text-slate-900">Notifications</p>
            <Link
              href="/admin/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-bold text-orange-600"
            >
              View all
            </Link>
          </div>

          {unread.length === 0 ? (
            <p className="p-5 text-center text-sm text-slate-500">You&apos;re all caught up.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {unread.slice(0, 5).map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  className="block w-full border-b border-slate-100 p-3 text-left transition hover:bg-orange-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
                    <span className="shrink-0 text-[11px] text-slate-400">{relativeDate(notification.createdAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{notification.body}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
