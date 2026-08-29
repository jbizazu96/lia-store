"use client";
import {useMemo, useState} from "react";
import {CalendarClock, Zap} from "lucide-react";
import type {Store} from "@/types/store";
import type {FulfillmentTiming, FulfillmentType, ScheduledFulfillmentWindow} from "@/types/fulfillment";
import type {OrderDeliveryPolicy} from "@/services/delivery/orderDeliveryPolicyClientService";

function localParts(date: Date, timezone: string) { const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", {timeZone: timezone, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).formatToParts(date).map((part) => [part.type, part.value])); return {day: values.weekday, minutes: Number(values.hour) * 60 + Number(values.minute)}; }
function clock(value: string) { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; }

export function FulfillmentTimeSection({store, type, policy, timing, window, onChange}: {store: Store; type: FulfillmentType; policy: OrderDeliveryPolicy | null; timing: FulfillmentTiming; window: ScheduledFulfillmentWindow | null; onChange: (timing: FulfillmentTiming, window: ScheduledFulfillmentWindow | null) => void;}) {
  const timezone = store.fulfillmentTimezone || "America/Chicago";
  const [referenceTime] = useState(() => Date.now());
  const scheduling = policy?.scheduling;
  const schedulingEnabled = Boolean(scheduling && (type === "pickup" ? scheduling.pickupEnabled && store.scheduledPickupEnabled : scheduling.deliveryEnabled && store.scheduledDeliveryEnabled));
  const globalSchedulingEnabled = Boolean(scheduling && (type === "pickup" ? scheduling.pickupEnabled : scheduling.deliveryEnabled));
  const storeSchedulingEnabled = type === "pickup" ? store.scheduledPickupEnabled === true : store.scheduledDeliveryEnabled === true;
  const slots = useMemo(() => {
    if (!policy || !scheduling || !schedulingEnabled || !store.schedule?.length) return [];
    const interval = scheduling.slotIntervalMinutes; const preparation = type === "pickup" ? store.pickupPreparationMinutes ?? policy.defaultPreparationMinutes : policy.defaultPreparationMinutes;
    const earliest = referenceTime + preparation * 60_000; const end = referenceTime + scheduling.maximumDaysAhead * 86_400_000; const values: ScheduledFulfillmentWindow[] = [];
    for (let time = Math.ceil(earliest / (interval * 60_000)) * interval * 60_000; time < end && values.length < 60; time += interval * 60_000) {
      const start = new Date(time); const finish = new Date(time + interval * 60_000); const local = localParts(start, timezone); const localEnd = localParts(finish, timezone); const day = store.schedule.find((entry) => entry.day === local.day);
      if (day && !day.isClosed && local.day === localEnd.day && local.minutes >= clock(day.open) && localEnd.minutes <= clock(day.close)) values.push({start: start.toISOString(), end: finish.toISOString(), timezone});
    }
    return values;
  }, [policy, referenceTime, scheduling, schedulingEnabled, store.pickupPreparationMinutes, store.schedule, timezone, type]);
  const label = (slot: ScheduledFulfillmentWindow) => `${new Intl.DateTimeFormat("en-US", {timeZone: timezone, weekday: "short", month: "short", day: "numeric"}).format(new Date(slot.start))} · ${new Intl.DateTimeFormat("en-US", {timeZone: timezone, hour: "numeric", minute: "2-digit"}).format(new Date(slot.start))}–${new Intl.DateTimeFormat("en-US", {timeZone: timezone, hour: "numeric", minute: "2-digit", timeZoneName: "short"}).format(new Date(slot.end))}`;
  const unavailableMessage = !globalSchedulingEnabled
    ? `LIA scheduled ${type} is currently disabled in Admin Order & Delivery settings.`
    : !storeSchedulingEnabled
      ? `This store has not enabled scheduled ${type} in its Delivery & Pickup settings.`
      : slots.length === 0
        ? `No scheduled ${type} windows are available within the store's current opening hours.`
        : "";
  return <section className="space-y-2"><h2 className="px-1 text-base font-extrabold text-gray-900">{type === "pickup" ? "Pickup time" : "Delivery time"}</h2><div className="rounded-xl border border-gray-200 bg-white p-3"><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => onChange("asap", null)} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold ${timing === "asap" ? "bg-orange-500 text-white" : "bg-gray-50 text-gray-700"}`}><Zap className="h-4 w-4"/>ASAP</button><button type="button" disabled={!schedulingEnabled || slots.length === 0} onClick={() => onChange("scheduled", window ?? slots[0] ?? null)} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold disabled:opacity-40 ${timing === "scheduled" ? "bg-orange-500 text-white" : "bg-gray-50 text-gray-700"}`}><CalendarClock className="h-4 w-4"/>Schedule</button></div>{timing === "scheduled" && <label className="mt-3 block text-sm font-bold text-gray-800">Available window<select value={window?.start ?? ""} onChange={(event) => onChange("scheduled", slots.find((slot) => slot.start === event.target.value) ?? null)} className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 font-medium"><option value="">Choose a time</option>{slots.map((slot) => <option key={slot.start} value={slot.start}>{label(slot)}</option>)}</select></label>}{unavailableMessage && <p className="mt-3 text-xs text-gray-500">{unavailableMessage}</p>}</div></section>;
}
