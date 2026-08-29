"use client";

import {useEffect, useMemo, useState} from "react";
import {CalendarClock, Check, ChevronLeft} from "lucide-react";
import type {OrderDeliveryPolicy} from "@/services/delivery/orderDeliveryPolicyClientService";
import type {FulfillmentTiming, FulfillmentType, ScheduledFulfillmentWindow} from "@/types/fulfillment";
import type {Store} from "@/types/store";

interface FulfillmentTimeSectionProps {
  store: Store;
  type: FulfillmentType;
  policy: OrderDeliveryPolicy | null;
  timing: FulfillmentTiming;
  window: ScheduledFulfillmentWindow | null;
  estimatedMinutes?: number | null;
  onChange: (timing: FulfillmentTiming, window: ScheduledFulfillmentWindow | null) => void;
}

interface LocalDateParts {
  weekday: string;
  year: string;
  month: string;
  day: string;
  hour: number;
  minute: number;
}

interface DateGroup {
  key: string;
  label: string;
  dateLabel: string;
  slots: ScheduledFulfillmentWindow[];
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function localParts(date: Date, timezone: string): LocalDateParts {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    weekday: values.weekday,
    year: values.year,
    month: values.month,
    day: values.day,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function dateKey(date: Date, timezone: string): string {
  const parts = localParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function clockMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return (hour * 60) + minute;
}

function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatTimeRange(window: ScheduledFulfillmentWindow, timezone: string): string {
  return `${formatTime(new Date(window.start), timezone)}–${formatTime(new Date(window.end), timezone)}`;
}

function formatLongDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function timezoneName(timezone: string): string {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "long",
  }).formatToParts(new Date()).find((part) => part.type === "timeZoneName")?.value;
  return name ?? timezone;
}

function generateSlots(
  store: Store,
  policy: OrderDeliveryPolicy,
  type: FulfillmentType,
  referenceTime: number,
): ScheduledFulfillmentWindow[] {
  const timezone = store.fulfillmentTimezone || "America/Chicago";
  const preparationMinutes = type === "pickup"
    ? store.pickupPreparationMinutes ?? policy.defaultPreparationMinutes
    : policy.defaultPreparationMinutes;
  const intervalMinutes = policy.scheduling.slotIntervalMinutes;
  const earliest = referenceTime + (preparationMinutes * MINUTE_MS);
  const latest = referenceTime + (policy.scheduling.maximumDaysAhead * DAY_MS);
  const firstCandidate = Math.ceil(earliest / (intervalMinutes * MINUTE_MS)) * intervalMinutes * MINUTE_MS;
  const slots: ScheduledFulfillmentWindow[] = [];

  for (let startTime = firstCandidate; startTime <= latest && slots.length < 240; startTime += intervalMinutes * MINUTE_MS) {
    const start = new Date(startTime);
    const end = new Date(startTime + intervalMinutes * MINUTE_MS);
    const startLocal = localParts(start, timezone);
    const endLocal = localParts(end, timezone);
    const schedule = store.schedule?.find((entry) => entry.day === startLocal.weekday);

    if (
      !schedule ||
      schedule.isClosed ||
      dateKey(start, timezone) !== dateKey(end, timezone) ||
      ((startLocal.hour * 60) + startLocal.minute) < clockMinutes(schedule.open) ||
      ((endLocal.hour * 60) + endLocal.minute) > clockMinutes(schedule.close)
    ) {
      continue;
    }

    slots.push({
      start: start.toISOString(),
      end: end.toISOString(),
      timezone,
    });
  }

  return slots;
}

function RadioMark({selected}: {selected: boolean}) {
  return (
    <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
      selected ? "border-gray-950 bg-gray-950 text-white" : "border-gray-950 bg-white"
    }`} aria-hidden="true">
      {selected && <Check className="size-3.5" strokeWidth={3} />}
    </span>
  );
}

export function FulfillmentTimeSection({
  store,
  type,
  policy,
  timing,
  window: selectedWindow,
  estimatedMinutes,
  onChange,
}: FulfillmentTimeSectionProps) {
  const [referenceTime] = useState(() => Date.now());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftWindow, setDraftWindow] = useState<ScheduledFulfillmentWindow | null>(selectedWindow);
  const timezone = store.fulfillmentTimezone || "America/Chicago";
  const typeLabel = type === "pickup" ? "Pickup" : "Delivery";
  const schedulingEnabled = Boolean(policy) && (
    type === "pickup"
      ? policy?.scheduling.pickupEnabled && store.scheduledPickupEnabled
      : policy?.scheduling.deliveryEnabled && store.scheduledDeliveryEnabled
  );
  const slots = useMemo(
    () => policy && schedulingEnabled ? generateSlots(store, policy, type, referenceTime) : [],
    [policy, referenceTime, schedulingEnabled, store, type],
  );
  const dateGroups = useMemo<DateGroup[]>(() => {
    if (!policy) return [];

    const slotsByDate = new Map<string, ScheduledFulfillmentWindow[]>();

    for (const slot of slots) {
      const key = dateKey(new Date(slot.start), timezone);
      slotsByDate.set(key, [...(slotsByDate.get(key) ?? []), slot]);
    }

    return Array.from({length: policy.scheduling.maximumDaysAhead}, (_, dayIndex) => {
      const date = new Date(referenceTime + (dayIndex * DAY_MS));
      const key = dateKey(date, timezone);
      return {
        key,
        label: dayIndex === 0 ? "Today" : dayIndex === 1 ? "Tomorrow" : localParts(date, timezone).weekday,
        dateLabel: new Intl.DateTimeFormat("en-US", {timeZone: timezone, month: "short", day: "numeric"}).format(date),
        slots: slotsByDate.get(key) ?? [],
      };
    });
  }, [policy, referenceTime, slots, timezone]);
  const initialDateKey = draftWindow ? dateKey(new Date(draftWindow.start), timezone) : dateGroups[0]?.key ?? "";
  const [selectedDateKey, setSelectedDateKey] = useState(initialDateKey);

  const asapMinutes = Math.max(
    5,
    type === "pickup"
      ? store.pickupPreparationMinutes ?? policy?.defaultPreparationMinutes ?? 30
      : estimatedMinutes ?? policy?.defaultPreparationMinutes ?? 30,
  );
  const asapWindow: ScheduledFulfillmentWindow = {
    start: new Date(referenceTime + (asapMinutes * MINUTE_MS)).toISOString(),
    end: new Date(referenceTime + ((asapMinutes + (type === "pickup" ? 10 : 15)) * MINUTE_MS)).toISOString(),
    timezone,
  };

  useEffect(() => {
    if (!pickerOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerOpen]);

  const openPicker = () => {
    const firstDate = dateGroups[0];
    const nextWindow = selectedWindow ?? firstDate?.slots[0] ?? null;
    setDraftWindow(nextWindow);
    setSelectedDateKey(nextWindow && selectedWindow
      ? dateKey(new Date(nextWindow.start), timezone)
      : firstDate?.key ?? "");
    setPickerOpen(true);
  };

  const confirmScheduledTime = () => {
    if (!draftWindow) return;
    onChange("scheduled", draftWindow);
    setPickerOpen(false);
  };

  const activeDate = dateGroups.find((group) => group.key === selectedDateKey) ?? dateGroups[0];
  const unavailableMessage = !policy
    ? "Scheduling settings are still loading."
    : !schedulingEnabled
      ? `This store currently accepts ${type} orders as soon as possible only.`
      : slots.length === 0
        ? `No scheduled ${type} times are currently available.`
        : null;

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-base font-extrabold text-gray-900">{typeLabel} time</h2>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => onChange("asap", null)}
          className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-gray-50"
        >
          <span>
            <span className="block text-sm font-extrabold text-gray-950">
              {formatTimeRange(asapWindow, timezone)}
            </span>
            <span className="mt-0.5 block text-xs font-medium text-gray-500">
              As soon as possible · about {asapMinutes} min
            </span>
          </span>
          <RadioMark selected={timing === "asap"} />
        </button>

        <div className="mx-4 border-t border-gray-100" />

        <button
          type="button"
          onClick={openPicker}
          disabled={Boolean(unavailableMessage)}
          className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors enabled:hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>
            <span className="flex items-center gap-2 text-sm font-extrabold text-gray-950">
              <CalendarClock className="size-4" /> Schedule ahead
            </span>
            <span className="mt-0.5 block text-xs font-medium text-gray-500">
              {timing === "scheduled" && selectedWindow
                ? `${formatLongDate(new Date(selectedWindow.start), timezone)} · ${formatTimeRange(selectedWindow, timezone)}`
                : slots[0]
                  ? `Next: ${formatLongDate(new Date(slots[0].start), timezone)} · ${formatTimeRange(slots[0], timezone)}`
                  : unavailableMessage}
            </span>
            {slots[0] && timing !== "scheduled" && (
              <span className="mt-0.5 block text-xs font-semibold text-gray-700">Choose a time</span>
            )}
          </span>
          <RadioMark selected={timing === "scheduled"} />
        </button>
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-[120] overflow-y-auto bg-white text-gray-950" role="dialog" aria-modal="true" aria-labelledby="schedule-title">
          <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-8">
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="mb-5 flex size-9 items-center justify-center rounded-full text-gray-950 transition-colors hover:bg-gray-100"
              aria-label="Back to checkout"
            >
              <ChevronLeft className="size-6" />
            </button>

            <h2 id="schedule-title" className="text-xl font-extrabold tracking-tight">
              Schedule {typeLabel}
            </h2>
            <p className="mt-1.5 text-xs font-medium leading-5 text-gray-600">
              Choose an available window for your {type}. Times shown are in {timezoneName(timezone)}.
            </p>

            <div className="mt-5 flex snap-x gap-2.5 overflow-x-auto pb-2">
              {dateGroups.map((group) => {
                const selected = group.key === activeDate?.key;
                return (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => {
                      setSelectedDateKey(group.key);
                      setDraftWindow(group.slots[0] ?? null);
                    }}
                    className={`min-w-32 snap-start rounded-xl border-2 px-3 py-2.5 text-left ${
                      selected ? "border-gray-950 bg-white" : "border-gray-200 bg-white"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2 text-xs font-extrabold">
                      {group.label}
                      <RadioMark selected={selected} />
                    </span>
                    <span className="mt-0.5 block text-[11px] font-medium text-gray-500">{group.dateLabel}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex-1 pb-40">
              {activeDate && activeDate.slots.length === 0 && (
                <div className="rounded-xl bg-gray-50 px-4 py-4 text-center text-xs font-medium text-gray-600">
                  No {type} times are available on this day.
                </div>
              )}
              {activeDate?.slots.map((slot) => {
                const selected = draftWindow?.start === slot.start;
                return (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => setDraftWindow(slot)}
                    className="flex w-full items-center gap-3 border-b border-gray-200 px-2 py-3.5 text-left text-sm font-bold hover:bg-gray-50"
                  >
                    <RadioMark selected={selected} />
                    {formatTimeRange(slot, timezone)}
                  </button>
                );
              })}
            </div>

            <div className="fixed inset-x-0 bottom-0 border-t border-gray-100 bg-white/95 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 backdrop-blur sm:px-8">
              <div className="mx-auto max-w-2xl">
                <button
                  type="button"
                  onClick={confirmScheduledTime}
                  disabled={!draftWindow}
                  className="w-full rounded-full bg-orange-600 px-5 py-3.5 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  Confirm {typeLabel} Time
                </button>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="mt-1.5 w-full rounded-full px-5 py-2.5 text-sm font-bold text-gray-900 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
