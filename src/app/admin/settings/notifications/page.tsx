import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import {DeviceNotificationTestPanel} from "@/components/notification/DeviceNotificationTestPanel";

export default function AdminNotificationSettingsPage() {
  return <section className="max-w-2xl"><Link href="/admin/settings" className="mb-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200"><ArrowLeft className="h-4 w-4" />Back to settings</Link><p className="text-sm font-bold tracking-wide text-orange-600">ADMIN NOTIFICATIONS</p><h1 className="mt-1 text-3xl font-bold">Notification device</h1><p className="mt-2 text-sm leading-6 text-slate-600">Verify that this browser or installed PWA can receive urgent LIA operational notifications.</p><div className="mt-6"><DeviceNotificationTestPanel description="Receive refund, support, order-zone, application, payment, and platform-operation alerts on this device." /></div></section>;
}
