/*
|--------------------------------------------------------------------------
| Shipday Mapper
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Converts the application's Order model into the format required by
| the Shipday API.
|
| WHY?
| ----
| LIA should never build Shipday objects throughout the application.
|
| Every conversion lives in ONE place.
|
*/

import type { Order } from "@/types/order";
import type { ShipdayOrder } from "@/types/shipday";

/**
 * Converts an Order into a ShipdayOrder.
 */
export function mapOrderToShipday(
  order: Order
): ShipdayOrder {

  return {

    orderNumber: order.orderNumber,

    customerName: order.customer.name,
    customerAddress: order.customer.address,
    customerEmail: order.customer.email,
    customerPhoneNumber: order.customer.phone,

    restaurantName: order.store.name,
    restaurantAddress: order.store.address,
    restaurantPhoneNumber: order.store.phone,

    pickupLatitude: order.store.latitude,
    pickupLongitude: order.store.longitude,

    deliveryLatitude: order.customer.latitude,
    deliveryLongitude: order.customer.longitude,

    tips: order.pricing.tip,

    tax: order.pricing.tax,

    deliveryFee: order.pricing.deliveryFee,

    totalOrderCost: order.pricing.total,

    deliveryInstruction:
      order.delivery.instructions,

  };

}