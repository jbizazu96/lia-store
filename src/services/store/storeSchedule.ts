/*
|--------------------------------------------------------------------------
| Store Schedule Service
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Central place for determining whether a store is open.
|
| Every page in LIA should use this service instead of
| implementing its own schedule logic.
|
*/

export interface ScheduleDay {
  day: string;
  open: string;
  close: string;
  isClosed: boolean;
}

export interface StoreStatus {
  isOpen: boolean;
  statusText: string;
  statusColor: string;
  textColor: string;
  closingTime: string | null;
  isScheduleSet: boolean;
  message: string;
}

/**
 * Converts "22:30" into minutes after midnight.
 */
function toMinutes(time: string): number {

  const [hours, minutes] =
    time.split(":").map(Number);

  return hours * 60 + minutes;

}

/**
 * Formats "22:00" into "10:00 PM"
 */
export function formatStoreTime(
  time: string
): string {

  const [hours, minutes] =
    time.split(":").map(Number);

  const ampm =
    hours >= 12 ? "PM" : "AM";

  const h12 =
    hours % 12 || 12;

  return `${h12}:${minutes
    .toString()
    .padStart(2, "0")} ${ampm}`;

}

/**
 * Determines whether the store is open.
 */
export function getStoreStatus(
  schedule?: ScheduleDay[],
  fallbackOpen = false
): StoreStatus {

  if (
    !schedule ||
    schedule.length === 0
  ) {

    return {

      isOpen: fallbackOpen,

      statusText:
        fallbackOpen
          ? "Open"
          : "Closed",

      statusColor:
        fallbackOpen
          ? "bg-green-500"
          : "bg-red-500",

      textColor:
        fallbackOpen
          ? "text-green-600"
          : "text-red-600",

      closingTime: null,

      isScheduleSet: false,

      message: "No schedule set",

    };

  }

  const now =
    new Date();

  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const today =
    days[now.getDay()];

  const currentMinutes =
    now.getHours() * 60 +
    now.getMinutes();

  const todaySchedule =
    schedule.find(
      (d) => d.day === today
    );

  if (
    !todaySchedule ||
    todaySchedule.isClosed
  ) {

    return {

      isOpen: false,

      statusText: "Closed",

      statusColor: "bg-red-500",

      textColor: "text-red-600",

      closingTime: null,

      isScheduleSet: true,

      message: "Closed today",

    };

  }

  const openMinutes =
    toMinutes(todaySchedule.open);

  const closeMinutes =
    toMinutes(todaySchedule.close);

  let isOpen = false;

  // Normal hours
  if (closeMinutes > openMinutes) {

    isOpen =
      currentMinutes >= openMinutes &&
      currentMinutes < closeMinutes;

  }

  // Overnight hours
  else {

    isOpen =
      currentMinutes >= openMinutes ||
      currentMinutes < closeMinutes;

  }

  const closeTime =
    formatStoreTime(
      todaySchedule.close
    );

  return {

    isOpen,

    statusText:
      isOpen
        ? "Open"
        : "Closed",

    statusColor:
      isOpen
        ? "bg-green-500"
        : "bg-red-500",

    textColor:
      isOpen
        ? "text-green-600"
        : "text-red-600",

    closingTime:
      isOpen
        ? closeTime
        : null,

    isScheduleSet: true,

    message: isOpen
      ? `Closes at ${closeTime}`
      : `Opens at ${formatStoreTime(
          todaySchedule.open
        )}`,

  };

}