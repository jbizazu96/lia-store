/*
|--------------------------------------------------------------------------
| Order Service
|--------------------------------------------------------------------------
|
| Responsible for:
|
| • Retrieving orders from Firestore
| • Updating order statuses
| • Triggering the Shipday workflow at the correct status
|
| React pages should never interact with the orders collection directly.
|
*/

import { getFunctions, httpsCallable } from "firebase/functions";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import type {
  Order,
  OrderStatus,
} from "@/types/order";

import { mapFirestoreOrder } from "@/mappers/orderMapper";

const functions = getFunctions();

export class OrderService {
  /**
   * Retrieve one order by its Firestore document ID.
   */
  async getOrder(
    orderId: string
  ): Promise<Order | null> {
    if (!orderId.trim()) {
      throw new Error(
        "An order ID is required."
      );
    }

    const snapshot = await getDoc(
      doc(db, "orders", orderId)
    );

    if (!snapshot.exists()) {
      return null;
    }

    return mapFirestoreOrder(snapshot);
  }

    /**
   * Update an order's fulfillment status.
   *
   * All workflow logic now lives on the backend.
   *
   * The backend is responsible for:
   *
   * • validating transitions
   * • verifying store ownership
   * • appending status history
   * • creating Shipday deliveries
   * • preventing duplicate deliveries
   */
  async updateStatus(
    orderId: string,
    newStatus: OrderStatus,
    cancellationReason?: string
  ): Promise<Date> {
    if (!orderId.trim()) {
      throw new Error(
        "An order ID is required."
      );
    }

    const updateOrderStatusFunction =
      httpsCallable<
        {
          orderId: string;
          newStatus: OrderStatus;
          cancellationReason?: string;
        },
        {
          success: boolean;
          changedAt: string;
          message: string;
        }
      >(
        functions,
        "updateOrderStatus"
      );

    const response =
      await updateOrderStatusFunction({
        orderId,
        newStatus,
        cancellationReason,
      });

    if (!response.data.success) {
      throw new Error(
        response.data.message ||
          "The order status could not be updated."
      );
    }

    return new Date(
      response.data.changedAt
    );
  }

}

/**
 * Shared OrderService instance.
 */
export const orderService =
  new OrderService();
