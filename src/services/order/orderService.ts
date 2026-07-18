/*
|--------------------------------------------------------------------------
| Order Service
|--------------------------------------------------------------------------
|
| Responsible for:
|
| • Creating orders through Firebase Functions
| • Retrieving orders from Firestore
| • Updating order statuses
| • Triggering the Shipday workflow at the correct status
|
| React pages should never interact with the orders collection directly.
|
*/

import { getFunctions, httpsCallable } from "firebase/functions";

import {
  arrayUnion,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import type {
  Order,
  OrderStatus,
} from "@/types/order";

import { mapFirestoreOrder } from "@/mappers/orderMapper";

const functions = getFunctions();

/**
 * Expected response from the createOrder Firebase Function.
 */
interface CreateOrderResponse {
  success: boolean;
  orderId: string;
}

/**
 * Expected response from workflow Firebase Functions.
 */
interface WorkflowResponse {
  success: boolean;
  message?: string;
}

export class OrderService {
  /**
   * Create a new order through the backend.
   *
   * The backend is responsible for:
   *
   * • Generating the Firestore document
   * • Generating the order number
   * • Applying server timestamps
   * • Validating the order payload
   */
  async createOrder(
    order: Order
  ): Promise<string> {
    const createOrderFunction = httpsCallable<
      { order: Order },
      CreateOrderResponse
    >(
      functions,
      "createOrder"
    );

    const response = await createOrderFunction({
      order,
    });

    if (
      !response.data.success ||
      !response.data.orderId
    ) {
      throw new Error(
        "The order could not be created."
      );
    }

    return response.data.orderId;
  }

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
   * Update an order's status.
   *
   * Shipday delivery creation occurs only when the order becomes
   * ready for pickup.
   */
  async updateStatus(
    orderId: string,
    newStatus: OrderStatus
  ): Promise<Date> {
    if (!orderId.trim()) {
      throw new Error(
        "An order ID is required."
      );
    }

    const changedAt = new Date();

    await updateDoc(
      doc(db, "orders", orderId),
      {
        status: newStatus,

        updatedAt: serverTimestamp(),

        statusHistory: arrayUnion({
          status: newStatus,
          timestamp: changedAt,
          note:
            `Order status changed to ${newStatus}`,
        }),
      }
    );

    /**
     * Business rule:
     *
     * Shipday should receive the delivery only after the store has
     * finished preparing the order.
     */
    if (newStatus === "ready_for_pickup") {
      await this.createShipdayDelivery(
        orderId
      );
    }

    return changedAt;
  }

  /**
   * Accept an order.
   *
   * Accepting an order does not create the Shipday delivery.
   * The delivery is created later when the status becomes
   * ready_for_pickup.
   */
  async acceptOrder(
    orderId: string
  ): Promise<void> {
    await this.updateStatus(
      orderId,
      "accepted"
    );
  }

  /**
   * Ask the backend to create the Shipday delivery.
   *
   * Kept private so pages cannot bypass the order-status workflow.
   */
  private async createShipdayDelivery(
    orderId: string
  ): Promise<void> {
    const createShipdayOrderFunction =
      httpsCallable<
        { orderId: string },
        WorkflowResponse
      >(
        functions,
        "createShipdayOrder"
      );

    const response =
      await createShipdayOrderFunction({
        orderId,
      });

    if (!response.data.success) {
      throw new Error(
        response.data.message ||
          "The Shipday delivery could not be created."
      );
    }
  }
}

/**
 * Shared OrderService instance.
 */
export const orderService =
  new OrderService();