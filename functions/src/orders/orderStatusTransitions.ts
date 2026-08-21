import type {
  BackendOrderStatus,
  StoreControlledOrderStatus,
} from "./orderStatusService";

/** Pure transition policy shared by the trusted order service and its tests. */
export function isAllowedStoreOrderTransition(
  currentStatus: BackendOrderStatus,
  newStatus: StoreControlledOrderStatus,
): boolean {
  if (newStatus === "cancelled") {
    return currentStatus === "pending";
  }

  const allowedTransitions: Partial<
    Record<BackendOrderStatus, StoreControlledOrderStatus>
  > = {
    pending: "accepted",
    accepted: "preparing",
    preparing: "ready_for_pickup",
  };

  return allowedTransitions[currentStatus] === newStatus;
}
