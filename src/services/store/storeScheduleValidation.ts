/*
|--------------------------------------------------------------------------
| Store Schedule Validation
|--------------------------------------------------------------------------
|
| Store onboarding and future Store Settings use the same validation rules.
| LIA currently supports same-day opening hours only; overnight schedules
| must be represented by separate future scheduling support.
|
*/

import type {
  StoreScheduleDay,
} from "@/types/store";

export const STORE_SCHEDULE_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);

  return hours * 60 + minutes;
}

/* Return a display-safe error when a schedule cannot be saved. */
export function getStoreScheduleValidationError(
  schedule: StoreScheduleDay[]
): string | null {
  if (schedule.length !== STORE_SCHEDULE_DAYS.length) {
    return "Add each day of the week to the store schedule.";
  }

  const scheduleDays = schedule.map((day) => day.day);
  const hasEveryDay = STORE_SCHEDULE_DAYS.every((day) =>
    scheduleDays.includes(day)
  );
  const hasDuplicateDays = new Set(scheduleDays).size !== scheduleDays.length;

  if (!hasEveryDay || hasDuplicateDays) {
    return "Include every day of the week only once.";
  }

  const openDays = schedule.filter((day) => !day.isClosed);

  if (openDays.length === 0) {
    return "Set opening and closing hours for at least one day.";
  }

  for (const day of openDays) {
    if (!isValidTime(day.open) || !isValidTime(day.close)) {
      return `Enter valid opening and closing times for ${day.day}.`;
    }

    if (timeToMinutes(day.close) <= timeToMinutes(day.open)) {
      return `${day.day} must close after it opens. Overnight hours are not supported yet.`;
    }
  }

  return null;
}
