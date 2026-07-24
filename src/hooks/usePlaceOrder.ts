"use client";

/*
|--------------------------------------------------------------------------
| usePlaceOrder Hook
|--------------------------------------------------------------------------
|
| Creates a customer order from checkout data.
|
| Responsibilities:
| - Verify authentication.
| - Convert checkout data into the shared Order domain model.
| - Save the order through orderService.
| - Clear the cart after success.
| - Expose loading, error, and success state.
|
*/

import {
  getStoreStatus,
} from "@/services/store/storeSchedule";
import { DELIVERY_CONFIG } from "@/config/delivery";

import {
  useState,
} from "react";

import {
  auth,
} from "@/lib/firebase";

import {
  createOrder,
} from "@/mappers/orderMapper";

import {
  orderService,
} from "@/services/order/orderService";
import { useSuccessToast } from "@/context/SuccessToastContext";

import type {
  Store,
} from "@/types/store";

import type {
  CheckoutAddress,
  CheckoutItem,
  CheckoutTotals,
} from "@/app/checkout/types";

/*
|--------------------------------------------------------------------------
| Hook Parameters
|--------------------------------------------------------------------------
*/

interface UsePlaceOrderParams {
  items: CheckoutItem[];

  store: Store | null;

  address: CheckoutAddress | null;

  userName: string;

  userPhone: string;

  deliveryInstructions: string;

  distanceMiles: number;

  isDistanceAvailable: boolean;

  estimatedDeliveryMinutes: number;

  totals: CheckoutTotals;

  clearCart: () => void;
}

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UsePlaceOrderResult {
  loading: boolean;

  error: string | null;

  orderPlaced: boolean;

  orderId: string;

  placeOrder: () => Promise<boolean>;

  clearError: () => void;
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function usePlaceOrder({
  items,
  store,
  address,
  userName,
  userPhone,
  deliveryInstructions,
  distanceMiles,
  isDistanceAvailable,
  estimatedDeliveryMinutes,
  totals,
  clearCart,
}: UsePlaceOrderParams): UsePlaceOrderResult {
  const { showSuccess } = useSuccessToast();
  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  const [
    orderPlaced,
    setOrderPlaced,
  ] = useState(false);

  const [
    orderId,
    setOrderId,
  ] = useState("");

  /*
  |--------------------------------------------------------------------------
  | Place Order
  |--------------------------------------------------------------------------
  */

  const placeOrder =
    async (): Promise<boolean> => {
      if (!address) {
        setError(
          "Please add a delivery address."
        );

        return false;
      }

      if (!store) {
          setError(
            "The selected store could not be loaded."
          );

          return false;
        }

      if (!isDistanceAvailable) {
        setError(
          "We could not calculate a driving route for this order. Please verify your delivery address and try again."
        );

        return false;
      }

        const storeStatus =
          getStoreStatus(
            store.schedule,
            store.isOpen
          );

        if (!storeStatus.isOpen) {
          setError(
            "This store is currently closed. Please place your order when the store reopens."
          );

          return false;
        }

      if (distanceMiles > DELIVERY_CONFIG.MAX_RADIUS_MILES) {
        setError(
          "This store is outside your delivery radius. Choose a closer store or use a different delivery address."
        );

        return false;
      }

      if (items.length === 0) {
        setError(
          "Your cart is empty."
        );

        return false;
      }

      const user =
        auth.currentUser;

      if (!user) {
        setError(
          "You must sign in to place an order."
        );

        return false;
      }

      try {
        setLoading(true);
        setError(null);

        /*
        |--------------------------------------------------------------------------
        | Build Domain Order
        |--------------------------------------------------------------------------
        */

        const order =
          createOrder({
            userId:
              user.uid,

            customerName:
              userName ||
              user.email?.split("@")[0] ||
              "Customer",

            customerPhone:
              userPhone,

            customerEmail:
              user.email ?? "",

            storeId:
              store.id,

            storeOwnerId:
              store.ownerId,

            storeName:
              store.name,

            storeAddress:
              store.address,

            storePhone:
              store.phone,

            storeLatitude:
              store.latitude,

            storeLongitude:
              store.longitude,

            deliveryAddress: {
              street:
                address.street,

              city:
                address.city,

              state:
                address.state,

              zip:
                address.zip,

              latitude:
                address.latitude,

              longitude:
                address.longitude,

              formattedAddress:
                address.formattedAddress ??
                "",
            },

            customerLatitude:
              address.latitude ?? 0,

            customerLongitude:
              address.longitude ?? 0,

            deliveryInstructions,

            deliveryDistanceMiles:
              distanceMiles,

            estimatedDeliveryMinutes,

            items: items.map(
              (item) => ({
                id:
                  item.id,

                storeId:
                  item.storeId,

                storeName:
                  item.storeName,

                name:
                  item.name,

                price:
                  item.price,

                quantity:
                  item.quantity,

                imageUrl:
                  item.imageUrl,

                size:
                  item.size ?? null,
              })
            ),

            totals,
          });

        /*
        |--------------------------------------------------------------------------
        | Save Order
        |--------------------------------------------------------------------------
        */

        const createdOrderId =
          await orderService.createOrder(
            order
          );

        setOrderId(
          createdOrderId
        );

        clearCart();

        setOrderPlaced(true);
        showSuccess("Order placed successfully.");

        return true;
      } catch (placeOrderError) {
        console.error(
          "Error placing order:",
          placeOrderError
        );

        setError(
          "Failed to place order. Please try again."
        );

        return false;
      } finally {
        setLoading(false);
      }
    };

  return {
    loading,
    error,
    orderPlaced,
    orderId,
    placeOrder,

    clearError: () =>
      setError(null),
  };
}
