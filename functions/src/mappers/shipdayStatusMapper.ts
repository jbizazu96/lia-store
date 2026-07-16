/*
|--------------------------------------------------------------------------
| Shipday Status Mapper
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Converts Shipday order statuses into LIA order statuses.
|
| WHY?
| ----
| We never want Shipday-specific event names scattered throughout
| our application.
|
| Every Shipday event should be translated here.
|
*/

export interface ShipdayStatusResult {
  /**
   * LIA order status.
   */
  orderStatus?:
    | "accepted"
    | "ready_for_pickup"
    | "out_for_delivery"
    | "completed"
    | "cancelled";

  /**
   * Shipday delivery status stored in Firestore.
   */
  shipdayStatus:
    | "created"
    | "waiting"
    | "started"
    | "picked_up"
    | "on_the_way"
    | "delivered"
    | "failed"
    | "cancelled";
}

/**
 * Converts a Shipday webhook event into LIA statuses.
 */
export function mapShipdayStatus(
  event: string
): ShipdayStatusResult {
      switch (event) {

        case "NOT_ASSIGNED":
          return {
            shipdayStatus: "created",
          };

        case "NOT_ACCEPTED":
        return {
          shipdayStatus: "waiting",
        };

        case "WAITING":
          return {
            shipdayStatus: "waiting",
          };

        case "STARTED":
          return {
            shipdayStatus: "started",
          };

        case "PICKED_UP":
          return {
            orderStatus: "out_for_delivery",
            shipdayStatus: "picked_up",
          };
        case "READY_TO_DELIVER":
          return {
            orderStatus: "out_for_delivery",
            shipdayStatus: "on_the_way",
          };
        case "ON_THE_WAY":
          return {
            orderStatus: "out_for_delivery",
            shipdayStatus: "on_the_way",
          };
        case "ALREADY_DELIVERED":
          return {
            orderStatus: "completed",
            shipdayStatus: "delivered",
          };
        case "DELIVERED":
          return {
            orderStatus: "completed",
            shipdayStatus: "delivered",
          };

        case "FAILED":
          return {
            orderStatus: "cancelled",
            shipdayStatus: "failed",
          };

        case "CANCELLED":
          return {
            orderStatus: "cancelled",
            shipdayStatus: "cancelled",
          };

        default:
          throw new Error(
            `Unsupported Shipday status: ${event}`
          );

      }

}