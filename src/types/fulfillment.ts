export type FulfillmentType = "delivery" | "pickup";
export type FulfillmentTiming = "asap" | "scheduled";

export interface ScheduledFulfillmentWindow {
  start: string;
  end: string;
  timezone: string;
}
