/*
|--------------------------------------------------------------------------
| Shipday Mapper (Cloud Function)
|--------------------------------------------------------------------------
|
| Converts an Order document into the payload expected by Shipday.
|
*/

export function mapOrderToShipday(order: any) {
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

    deliveryInstruction:
      order.delivery.instructions ?? "",

    deliveryFee:
      order.pricing.deliveryFee,

    tax:
      order.pricing.tax,

    tips:
      order.pricing.tip,

    totalOrderCost:
      order.pricing.total,
  };
}