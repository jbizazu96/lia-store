import {CalendarClock, Zap} from "lucide-react";
import type {Order} from "@/types/order";

export function ScheduledFulfillmentNotice({order, compact = false}: {order: Order; compact?: boolean}) {
  const scheduled = order.fulfillmentTiming === "scheduled" && order.scheduling?.windowStart && order.scheduling.windowEnd;
  if (!scheduled) return compact ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500"><Zap className="h-3.5 w-3.5"/>ASAP</span> : null;
  const timezone = order.scheduling!.timezone;
  const date = new Intl.DateTimeFormat("en-US", {timeZone: timezone, weekday: "short", month: "short", day: "numeric"}).format(order.scheduling!.windowStart!);
  const start = new Intl.DateTimeFormat("en-US", {timeZone: timezone, hour: "numeric", minute: "2-digit"}).format(order.scheduling!.windowStart!);
  const end = new Intl.DateTimeFormat("en-US", {timeZone: timezone, hour: "numeric", minute: "2-digit", timeZoneName: "short"}).format(order.scheduling!.windowEnd!);
  if (compact) return <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700"><CalendarClock className="h-3.5 w-3.5"/>{date}, {start}–{end}</span>;
  return <section className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="flex gap-3"><CalendarClock className="mt-0.5 h-5 w-5 text-violet-700"/><div><p className="font-bold text-violet-950">Scheduled {order.fulfillmentType}</p><p className="mt-1 text-sm text-violet-800">{date}, {start}–{end}</p><p className="mt-1 text-xs text-violet-700">The store will prepare this order for the selected window.</p></div></div></section>;
}
