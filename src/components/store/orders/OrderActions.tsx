"use client";

/*
|--------------------------------------------------------------------------
| Order Actions
|--------------------------------------------------------------------------
|
| Displays only the fulfillment actions that a store owner is authorized
| to perform.
|
| Store-controlled workflow:
|
| pending
|   ↓
| accepted
|   ↓
| preparing
|   ↓
| ready_for_pickup
|
| Shipday-controlled workflow:
|
| ready_for_pickup
|   ↓
| out_for_delivery
|   ↓
| completed
|
*/

import { useState } from "react";
import Link from "next/link";

import type {
  OrderStatus,
} from "@/types/order";

interface OrderActionsProps {
  status: OrderStatus;
  fulfillmentType: "delivery" | "pickup";
  customerPickupCode?: string | null;
  onCompletePickup: (code: string) => Promise<void>;

  cancellationReason?: string;

  onStatusUpdate: (
    newStatus: OrderStatus,
    cancellationReason?: string
  ) => Promise<void>;

  updating: boolean;
}

export function OrderActions({
  status,
  fulfillmentType,
  customerPickupCode,
  onCompletePickup,
  cancellationReason,
  onStatusUpdate,
  updating,
}: OrderActionsProps) {
  const [
    showCancellationModal,
    setShowCancellationModal,
  ] = useState(false);

  const [
    cancellationReasonInput,
    setCancellationReasonInput,
  ] = useState("");
  const [pickupCode, setPickupCode] = useState("");
  const [pickupError, setPickupError] = useState("");

  const handleCompletePickup = async () => {
    if (pickupCode.length !== 6 || updating) {
      return;
    }

    try {
      setPickupError("");
      await onCompletePickup(pickupCode);
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : "The pickup code could not be verified.";

      setPickupCode("");
      setPickupError(
        message.toLowerCase().includes("pickup code")
          ? message
          : "The pickup code could not be verified. Please try again."
      );
    }
  };

  /*
  |--------------------------------------------------------------------------
  | Cancellation
  |--------------------------------------------------------------------------
  */

  const closeCancellationModal = () => {
    if (updating) {
      return;
    }

    setShowCancellationModal(false);
    setCancellationReasonInput("");
  };

  const handleCancellationConfirm =
    async () => {
      const normalizedReason =
        cancellationReasonInput.trim();

      if (!normalizedReason) {
        return;
      }

      await onStatusUpdate(
        "cancelled",
        normalizedReason
      );

      setShowCancellationModal(false);
      setCancellationReasonInput("");
    };

  /*
  |--------------------------------------------------------------------------
  | Primary Store Action
  |--------------------------------------------------------------------------
  */

  const getPrimaryAction = () => {
    switch (status) {
      case "pending":
        return (
          <button
            type="button"
            onClick={() =>
              onStatusUpdate("accepted")
            }
            disabled={updating}
            className="
              w-full rounded-xl bg-green-500 px-4 py-3
              font-semibold text-white transition
              hover:bg-green-600
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
          >
            {updating
              ? "Updating..."
              : "Accept Order"}
          </button>
        );

      case "accepted":
        return (
          <button
            type="button"
            onClick={() =>
              onStatusUpdate("preparing")
            }
            disabled={updating}
            className="
              w-full rounded-xl bg-blue-500 px-4 py-3
              font-semibold text-white transition
              hover:bg-blue-600
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
          >
            {updating
              ? "Updating..."
              : "Start Preparing"}
          </button>
        );

      case "preparing":
        return (
          <button
            type="button"
            onClick={() =>
              onStatusUpdate(
                "ready_for_pickup"
              )
            }
            disabled={updating}
            className="
              w-full rounded-xl bg-purple-500 px-4 py-3
              font-semibold text-white transition
              hover:bg-purple-600
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
          >
            {updating
              ? fulfillmentType === "pickup" ? "Updating..." : "Creating Delivery..."
              : fulfillmentType === "pickup" ? "Ready for Customer" : "Mark Ready for Driver"}
          </button>
        );

      case "ready_for_pickup":
        if (fulfillmentType === "pickup") {
          return (
            <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
              <p className="font-semibold text-purple-700">Ready for customer pickup</p>
              <p className="mt-1 text-sm text-purple-600">Ask the customer for the six-digit pickup code before handing over the order.</p>
              {customerPickupCode && (
                <div className="mt-3 rounded-xl border border-purple-200 bg-white px-4 py-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">Customer pickup code</p>
                  <p className="mt-1 font-mono text-2xl font-black tracking-[0.3em] text-purple-800">
                    {customerPickupCode}
                  </p>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={pickupCode}
                  onChange={(event) => {
                    setPickupError("");
                    setPickupCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  }}
                  placeholder="6-digit code"
                  className="min-w-0 flex-1 rounded-full border border-purple-200 bg-white px-4 py-2.5 text-center font-mono font-bold tracking-widest outline-none"
                />
                <button
                  type="button"
                  disabled={updating || pickupCode.length !== 6}
                  onClick={() => void handleCompletePickup()}
                  className="rounded-full bg-purple-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  Complete
                </button>
              </div>
            </div>
          );
        }
        return (
          <div
            className="
              rounded-xl border border-purple-100
              bg-purple-50 px-4 py-3 text-center
            "
          >
            <p className="font-semibold text-purple-700">
              Ready for Pickup
            </p>

            <p className="mt-1 text-sm text-purple-600">
              Waiting for LIA Driver assignment.
            </p>
          </div>
        );

      case "out_for_delivery":
        return (
          <div
            className="
              rounded-xl border border-orange-100
              bg-orange-50 px-4 py-3 text-center
            "
          >
            <p className="font-semibold text-orange-700">
              Out for Delivery
            </p>

            <p className="mt-1 text-sm text-orange-600">
              The driver is delivering this order.
            </p>
          </div>
        );

      case "completed":
        return (
          <div
            className="
              rounded-xl border border-green-100
              bg-green-50 px-4 py-3 text-center
            "
          >
            <p className="font-semibold text-green-700">
              Order Completed ✓
            </p>
          </div>
        );

      case "cancelled":
        return (
          <div
            className="
              rounded-xl border border-red-100
              bg-red-50 px-4 py-3 text-center
            "
          >
            <p className="font-semibold text-red-600">
              Order Cancelled
            </p>

            {cancellationReason && (
              <p className="mt-1 text-xs text-red-500">
                Reason: {cancellationReason}
              </p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const isCancellable = status === "pending";
  const requiresSupport = [
    "accepted",
    "preparing",
    "ready_for_pickup",
    "out_for_delivery",
  ].includes(status);

  return (
    <>
      <div
        className="
          rounded-2xl border border-gray-100
          bg-white p-6 shadow-sm
        "
      >
        <h3 className="mb-4 font-bold text-gray-800">
          Actions
        </h3>

        <div className="space-y-2">
          {getPrimaryAction()}

          {isCancellable && (
            <button
              type="button"
              onClick={() =>
                setShowCancellationModal(true)
              }
              disabled={updating}
              className="
                w-full rounded-xl border border-red-200
                px-4 py-3 font-semibold text-red-600
                transition hover:bg-red-50
                disabled:cursor-not-allowed
                disabled:opacity-50
              "
            >
              Cancel Order
            </button>
          )}

          {requiresSupport && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Need to stop this order?</p>
              <p className="mt-1 leading-5">After acceptance, contact LIA Support. The store cannot cancel or issue a refund directly.</p>
              <Link href="/store/settings?section=support" className="mt-3 inline-flex rounded-full bg-amber-900 px-4 py-2 text-xs font-bold text-white">
                Contact LIA Support
              </Link>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-center text-xs text-gray-400">
            LIA handles delivery. Status updates after
            Ready for Pickup are automatic.
          </p>
        </div>
      </div>

      {showCancellationModal && (
        <div
          className="
            fixed inset-0 z-50 flex items-center
            justify-center bg-black/50 p-4
          "
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancellation-title"
            className="
              w-full max-w-md rounded-2xl
              bg-white p-6 shadow-xl
            "
          >
            <h2
              id="cancellation-title"
              className="text-xl font-bold text-gray-800"
            >
              Cancel order?
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              Tell the customer why this order is being
              cancelled. The reason will be saved with the
              order.
            </p>

            <label
              htmlFor="cancellation-reason"
              className="
                mt-5 block text-sm font-medium
                text-gray-700
              "
            >
              Cancellation reason
            </label>

            <textarea
              id="cancellation-reason"
              value={cancellationReasonInput}
              onChange={(event) =>
                setCancellationReasonInput(
                  event.target.value
                )
              }
              placeholder="For example: An item is unavailable."
              rows={4}
              disabled={updating}
              className="
                mt-2 w-full resize-none rounded-xl
                border border-gray-200 p-3 text-sm
                text-gray-800 outline-none transition
                focus:border-orange-500
                focus:ring-2 focus:ring-orange-100
                disabled:cursor-not-allowed
                disabled:opacity-60
              "
            />

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={closeCancellationModal}
                disabled={updating}
                className="
                  flex-1 rounded-xl border
                  border-gray-200 px-4 py-3
                  font-semibold text-gray-600
                  transition hover:bg-gray-50
                  disabled:opacity-50
                "
              >
                Return
              </button>

              <button
                type="button"
                onClick={
                  handleCancellationConfirm
                }
                disabled={
                  updating ||
                  !cancellationReasonInput.trim()
                }
                className="
                  flex-1 rounded-xl bg-red-600
                  px-4 py-3 font-semibold text-white
                  transition hover:bg-red-700
                  disabled:cursor-not-allowed
                  disabled:bg-gray-300
                "
              >
                {updating
                  ? "Cancelling..."
                  : "Confirm cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pickupError && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="pickup-error-title"
            aria-describedby="pickup-error-message"
            className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl font-bold text-red-600">
              !
            </div>
            <h2 id="pickup-error-title" className="mt-4 text-xl font-bold text-gray-900">
              Pickup code incorrect
            </h2>
            <p id="pickup-error-message" className="mt-2 text-sm leading-6 text-gray-600">
              {pickupError}
            </p>
            <button
              type="button"
              autoFocus
              onClick={() => setPickupError("")}
              className="mt-6 w-full rounded-full bg-orange-500 px-5 py-3 font-bold text-white transition hover:bg-orange-600"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </>
  );
}
