/*
|--------------------------------------------------------------------------
| Order Support Client Service
|--------------------------------------------------------------------------
|
| Customer and admin pages use protected Cloud Functions for order support.
| The browser never reads or writes private support records, and LIA Admin
| remains the only bridge between a customer and a store.
|
*/

import {
  httpsCallable,
} from "firebase/functions";
import {
  functions,
} from "@/lib/firebase";

export interface OrderSupportReply {
  message: string;
  respondedAt: string | null;
}

export interface CustomerOrderSupportRequest {
  id: string;
  orderId: string;
  orderNumber: string | null;
  reason: string;
  message: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  adminResponse: OrderSupportReply | null;
}

export interface AdminOrderSupportRequest extends CustomerOrderSupportRequest {
  customerName: string;
}

async function call<T>(
  name: string,
  data: unknown
): Promise<T> {
  try {
    return (
      await httpsCallable<unknown, T>(
        functions,
        name
      )(data)
    ).data;
  } catch (error) {
    const message = (error as {
      message?: unknown;
    }).message;

    throw new Error(
      typeof message === "string"
        ? message
        : "The order support request could not be completed."
    );
  }
}

export const orderSupportClientService = {
  getCustomer: (
    orderId: string
  ) => call<{
    request: CustomerOrderSupportRequest | null;
  }>(
    "getCustomerOrderSupportRequest",
    {
      orderId,
    }
  ),

  createCustomer: (
    input: {
      orderId: string;
      reason: "late_delivery" | "missing_items" | "contact_support";
      message: string;
    }
  ) => call<{
    requestId: string;
    status: string;
  }>(
    "createCustomerOrderSupportRequest",
    input
  ),

  getAdmin: (
    orderId: string
  ) => call<{
    request: AdminOrderSupportRequest | null;
  }>(
    "getAdminOrderSupportRequest",
    {
      orderId,
    }
  ),

  respondAdmin: (
    input: {
      requestId: string;
      message: string;
      status: "in_review" | "responded" | "resolved";
    }
  ) => call<{
    success: boolean;
  }>(
    "respondAdminOrderSupportRequest",
    input
  ),
};
