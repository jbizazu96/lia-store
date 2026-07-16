/*
|--------------------------------------------------------------------------
| Shipday Types
|--------------------------------------------------------------------------
|
| These interfaces describe the data exchanged with the Shipday API.
|
| They are shared by:
| - shipdayService
| - shipdayMapper
| - API routes
| - Future Shipday webhooks
|
| Keeping them here gives us a single source of truth.
|
*/

/**
 * Payload sent to Shipday when creating a delivery.
 */
export interface ShipdayOrder {
  orderNumber: string;

  customerName: string;
  customerAddress: string;
  customerEmail?: string;
  customerPhoneNumber: string;

  restaurantName: string;
  restaurantAddress: string;
  restaurantPhoneNumber: string;

  pickupLatitude: number;
  pickupLongitude: number;

  deliveryLatitude: number;
  deliveryLongitude: number;

  expectedDeliveryDate?: string;
  expectedPickupTime?: string;
  expectedDeliveryTime?: string;

  tips: number;
  tax: number;
  deliveryFee: number;
  totalOrderCost: number;

  deliveryInstruction?: string;
}

/**
 * Successful response returned by Shipday.
 */
export interface ShipdayCreateOrderResponse {
  success: boolean;
  response: string;
  orderId: number;
}