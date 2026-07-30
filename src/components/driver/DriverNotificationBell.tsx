"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { driverWorkspaceClientService } from "@/services/driver/driverWorkspaceClientService";
import type { DriverNotification } from "@/types/driverWorkspace";

export function DriverNotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<DriverNotification[]>([]);
  const reference = useRef<HTMLDivElement>(null);
  const load = () => driverWorkspaceClientService.getNotifications().then((result) => setNotifications(result.notifications)).catch(() => setNotifications([]));
  useEffect(() => { void load(); const interval = window.setInterval(load, 30000); return () => window.clearInterval(interval); }, []);
  useEffect(() => { const close = (event: MouseEvent) => { if (reference.current && !reference.current.contains(event.target as Node)) setOpen(false); }; const scroll = () => setOpen(false); document.addEventListener("mousedown", close); window.addEventListener("scroll", scroll, true); return () => { document.removeEventListener("mousedown", close); window.removeEventListener("scroll", scroll, true); }; }, []);
  const unread = notifications.filter((notification) => !notification.read);
  return <div ref={reference} className="relative"><button onClick={() => setOpen((value) => !value)} className="relative rounded-xl p-2 text-slate-700 hover:bg-orange-50" aria-label="Open notifications"><Bell className="h-5 w-5" />{unread.length > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white">{unread.length > 9 ? "9+" : unread.length}</span>}</button>{open && <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl"><div className="flex items-center justify-between border-b border-slate-100 p-3"><p className="font-bold">Notifications</p><Link onClick={() => setOpen(false)} href="/driver/notifications" className="text-xs font-bold text-orange-600">View all</Link></div>{unread.length === 0 ? <p className="p-5 text-center text-sm text-slate-500">You&apos;re all caught up.</p> : <div>{unread.slice(0, 4).map((notification) => <button key={notification.id} onClick={() => void driverWorkspaceClientService.markNotificationRead(notification.id).then(load)} className="block w-full border-b border-slate-100 p-3 text-left hover:bg-orange-50"><p className="text-sm font-semibold">{notification.title}</p><p className="mt-1 line-clamp-2 text-xs text-slate-500">{notification.body}</p></button>)}</div>}</div>}</div>;
}

