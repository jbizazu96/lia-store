/*
|--------------------------------------------------------------------------
| Order Display Utilities
|--------------------------------------------------------------------------
|
| Shared formatting and display helpers for orders.
|
| These utilities contain no React code and can be reused by:
|
| • Customer Orders
| • Customer Order Details
| • Store Dashboard
| • Store Order Details
| • Admin Dashboard
|
*/

import type {
  Order,
  StatusHistory,
} from "@/types/order";

import {
  ORDER_STATUS_STEPS,
} from "@/config/orderStatus";

/*
|--------------------------------------------------------------------------
| Format Date
|--------------------------------------------------------------------------
*/

export function formatOrderDate(
  date: Date | null | undefined
): string {
  if (
    !(date instanceof Date) ||
    Number.isNaN(date.getTime())
  ) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
    }
  ).format(date);
}

/*
|--------------------------------------------------------------------------
| Format Date Only
|--------------------------------------------------------------------------
|
| Used when a component displays the order date and time separately.
|
*/

export function formatOrderDateOnly(
  date: Date | null | undefined
): string {
  if (
    !(date instanceof Date) ||
    Number.isNaN(date.getTime())
  ) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  ).format(date);
}

/*
|--------------------------------------------------------------------------
| Format Time Only
|--------------------------------------------------------------------------
*/

export function formatOrderTime(
  date: Date | null | undefined
): string {
  if (
    !(date instanceof Date) ||
    Number.isNaN(date.getTime())
  ) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      hour: "numeric",
      minute: "numeric",
    }
  ).format(date);
}

/*
|--------------------------------------------------------------------------
| Format Price
|--------------------------------------------------------------------------
*/

export function formatOrderPrice(
  price: number
) {
  const dollars =
    Math.floor(price);

  const cents =
    Math.round(
      (price - dollars) * 100
    );

  return {
    dollars,

    cents: cents
      .toString()
      .padStart(2, "0"),
  };
}

/*
|--------------------------------------------------------------------------
| Format Currency
|--------------------------------------------------------------------------
|
| Returns a complete currency string for simple totals and line items.
|
*/

export function formatOrderCurrency(
  value: number | null | undefined
): string {
  if (
    typeof value !== "number" ||
    Number.isNaN(value)
  ) {
    return "$0.00";
  }

  return `$${value.toFixed(2)}`;
}

/*
|--------------------------------------------------------------------------
| Find Timeline Step
|--------------------------------------------------------------------------
*/

export function getCurrentOrderStep(
  status: Order["status"]
): number {
  return ORDER_STATUS_STEPS.findIndex(
    (step) =>
      step.key === status
  );
}

/*
|--------------------------------------------------------------------------
| Find Status Timestamp
|--------------------------------------------------------------------------
*/

export function getStatusTimestamp(
  history:
    | StatusHistory[]
    | undefined,
  status: string
): Date | null {
  if (!history) {
    return null;
  }

  const entry =
    history.find(
      (item) =>
        item.status === status
    );

  return (
    entry?.timestamp ?? null
  );
}