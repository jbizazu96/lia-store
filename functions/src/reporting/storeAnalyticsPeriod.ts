export type StoreAnalyticsPeriod = "week" | "month" | "year";

export interface StoreAnalyticsRange {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
}

function parts(date: Date, timeZone: string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {year: Number(values.year), month: Number(values.month), day: Number(values.day), weekday: values.weekday};
}

function offset(date: Date, timeZone: string): number {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) - date.getTime();
}

export function zonedStart(year: number, month: number, day: number, timeZone: string): Date {
  const wallClock = Date.UTC(year, month - 1, day);
  let result = new Date(wallClock);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    result = new Date(wallClock - offset(result, timeZone));
  }
  return result;
}

export function storeAnalyticsRange(period: StoreAnalyticsPeriod, timeZone: string, now = new Date()): StoreAnalyticsRange {
  const current = parts(now, timeZone);
  const today = new Date(Date.UTC(current.year, current.month - 1, current.day));
  let startDate: Date;
  let endDate: Date;
  let previousStartDate: Date;

  if (period === "week") {
    const mondayOffset: Record<string, number> = {Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6};
    startDate = new Date(today);
    startDate.setUTCDate(startDate.getUTCDate() - (mondayOffset[current.weekday] ?? 0));
    endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 7);
    previousStartDate = new Date(startDate);
    previousStartDate.setUTCDate(previousStartDate.getUTCDate() - 7);
  } else if (period === "month") {
    startDate = new Date(Date.UTC(current.year, current.month - 1, 1));
    endDate = new Date(Date.UTC(current.year, current.month, 1));
    previousStartDate = new Date(Date.UTC(current.year, current.month - 2, 1));
  } else {
    startDate = new Date(Date.UTC(current.year, 0, 1));
    endDate = new Date(Date.UTC(current.year + 1, 0, 1));
    previousStartDate = new Date(Date.UTC(current.year - 1, 0, 1));
  }

  return {
    start: zonedStart(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, startDate.getUTCDate(), timeZone),
    end: zonedStart(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, endDate.getUTCDate(), timeZone),
    previousStart: zonedStart(previousStartDate.getUTCFullYear(), previousStartDate.getUTCMonth() + 1, previousStartDate.getUTCDate(), timeZone),
    previousEnd: zonedStart(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, startDate.getUTCDate(), timeZone),
  };
}

export function localDateKey(date: Date, timeZone: string, monthly: boolean): string {
  const value = parts(date, timeZone);
  return monthly
    ? `${value.year}-${String(value.month).padStart(2, "0")}`
    : `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

export function localHour(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {timeZone, hour: "numeric", hourCycle: "h23"})
    .formatToParts(date).find((part) => part.type === "hour")?.value;
  return Number(hour ?? 0);
}
