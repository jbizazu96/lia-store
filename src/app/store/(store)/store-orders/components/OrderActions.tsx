"use client";

/*
  Order action buttons for status updates.
*/

import {useState} from "react";

interface OrderActionsProps {
  status: string;
  onStatusUpdate: (newStatus: string) => Promise<void>;
  updating: boolean;
}

export function OrderActions({status, onStatusUpdate, updating}: OrderActionsProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const handleCancel = () => {
    if (confirm("Are you sure you want to cancel this order?")) {
      onStatusUpdate("cancelled");
    }
  };

  // Status action mapping
  const getActions = () => {
    switch (status) {
      case "pending":
        return (
          <button
            onClick={() => onStatusUpdate("accepted")}
            disabled={updating}
            className="w-full px-4 py-3 bg-green-500 text-white font-semibold rounded-xl hover:bg-green-600 transition disabled:opacity-50"
          >
            Accept Order
          </button>
        );
      case "accepted":
        return (
          <button
            onClick={() => onStatusUpdate("preparing")}
            disabled={updating}
            className="w-full px-4 py-3 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 transition disabled:opacity-50"
          >
            Start Preparing
          </button>
        );
      case "preparing":
        return (
          <button
            onClick={() => onStatusUpdate("ready_for_pickup")}
            disabled={updating}
            className="w-full px-4 py-3 bg-purple-500 text-white font-semibold rounded-xl hover:bg-purple-600 transition disabled:opacity-50"
          >
            Mark Ready
          </button>
        );
      case "ready_for_pickup":
        return (
          <button
            onClick={() => onStatusUpdate("out_for_delivery")}
            disabled={updating}
            className="w-full px-4 py-3 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition disabled:opacity-50"
          >
            Assign Driver
          </button>
        );
      case "out_for_delivery":
        return (
          <button
            onClick={() => onStatusUpdate("completed")}
            disabled={updating}
            className="w-full px-4 py-3 bg-green-500 text-white font-semibold rounded-xl hover:bg-green-600 transition disabled:opacity-50"
          >
            Mark completed
          </button>
        );
      case "cancelled":
        return (
          <div className="text-center text-red-500 font-medium py-2">
            Order Cancelled
          </div>
        );
      case "completed":
        return (
          <div className="text-center text-green-500 font-medium py-2">
            Order completed ✓
          </div>
        );
      default:
        return null;
    }
  };

  const isCancellable = !["cancelled", "completed"].includes(status);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <h3 className="font-bold text-gray-800 mb-4">Actions</h3>
      <div className="space-y-2">
        {getActions()}
        {isCancellable && (
          <button
            onClick={handleCancel}
            disabled={updating}
            className="w-full px-4 py-3 border border-red-200 text-red-600 font-semibold rounded-xl hover:bg-red-50 transition disabled:opacity-50"
          >
            Cancel Order
          </button>
        )}
      </div>
    </div>
  );
}