/*
|--------------------------------------------------------------------------
| Order Status Configuration
|--------------------------------------------------------------------------
|
| Central definition of every order status used throughout LIA Store.
|
| This file contains:
|
| • Timeline order
| • Display labels
| • Colors
| • Icons
|
| Every page (customer, store, admin, notifications) should use these
| constants instead of defining their own status arrays.
|
*/

import {
  BoxIcon,
  CheckCircle,
  Clock,
  HandshakeIcon,
  Package,
  Truck,
  XCircle,
} from "lucide-react";

/*
|--------------------------------------------------------------------------
| Timeline Steps
|--------------------------------------------------------------------------
*/

export const ORDER_STATUS_STEPS = [
  {
    key: "pending",
    label: "Pending",
    icon: Clock,
    color:
      "bg-yellow-100 text-yellow-800",
  },

  {
    key: "accepted",
    label: "Accepted",
    icon: CheckCircle,
    color:
      "bg-cyan-100 text-cyan-800",
  },

  {
    key: "preparing",
    label: "Preparing",
    icon: Package,
    color:
      "bg-purple-100 text-purple-800",
  },

  {
    key: "ready_for_pickup",
    label: "Ready for Pickup",
    icon: BoxIcon,
    color:
      "bg-indigo-100 text-indigo-800",
  },

  {
    key: "out_for_delivery",
    label: "Out for Delivery",
    icon: Truck,
    color:
      "bg-blue-100 text-blue-800",
  },

  {
    key: "completed",
    label: "Completed",
    icon: HandshakeIcon,
    color:
      "bg-green-100 text-green-800",
  },
] as const;

/*
|--------------------------------------------------------------------------
| Status Badge Configuration
|--------------------------------------------------------------------------
*/

export const ORDER_STATUS_CONFIG = {
  pending: {
    label: "Pending",
    color:
      "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: Clock,
  },

  accepted: {
    label: "Accepted",
    color:
      "bg-cyan-100 text-cyan-800 border-cyan-200",
    icon: CheckCircle,
  },

  preparing: {
    label: "Preparing",
    color:
      "bg-purple-100 text-purple-800 border-purple-200",
    icon: Package,
  },

  ready_for_pickup: {
    label: "Ready for Pickup",
    color:
      "bg-indigo-100 text-indigo-800 border-indigo-200",
    icon: BoxIcon,
  },

  out_for_delivery: {
    label: "Out for Delivery",
    color:
      "bg-blue-100 text-blue-800 border-blue-200",
    icon: Truck,
  },

  completed: {
    label: "Completed",
    color:
      "bg-green-100 text-green-800 border-green-200",
    icon: HandshakeIcon,
  },

  cancelled: {
    label: "Cancelled",
    color:
      "bg-red-100 text-red-800 border-red-200",
    icon: XCircle,
  },
} as const;
