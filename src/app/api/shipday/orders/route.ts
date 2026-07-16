/*
|--------------------------------------------------------------------------
| Shipday Test API
|--------------------------------------------------------------------------
|
| This endpoint will eventually create deliveries in Shipday.
| For now, we'll just verify that our server can securely read the
| environment variables.
|
*/
import { shipdayService } from "@/services/delivery/shipday";
import type { ShipdayOrder } from "@/types/shipday";
import { NextResponse } from "next/server";

const testOrder: ShipdayOrder = {
  orderNumber: "TEST-ORDER-123",
  customerName: "John Doe",
  customerAddress: "920 2nd Ave, Fort Dodge, IA 50501",
  customerEmail: "john.doe@example.com",
  customerPhoneNumber: "+15551234567",
  restaurantName: "LIA Store",
  restaurantAddress: "920 2nd Ave, Fort Dodge, IA 50501",
  restaurantPhoneNumber: "+15559876543",
  pickupLatitude: 42.5000,
  pickupLongitude: -94.1800,
  deliveryLatitude: 42.5005,
  deliveryLongitude: -94.1795,
  expectedDeliveryDate: "2026-07-15",
  expectedPickupTime: "12:00:00",
  expectedDeliveryTime: "12:30:00",
  tips: 5.00,
  tax: 1.50,
  deliveryFee: 3.00,
  totalOrderCost: 29.50,
  deliveryInstruction: "Leave at the front door.",
};

export async function POST() {
  try {
    // Read environment variables (server-side only)
    const apiKey = process.env.SHIPDAY_API_KEY;
    const apiUrl = process.env.SHIPDAY_API_URL;
    
    if (!apiKey || !apiUrl) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing Shipday configuration.",
        },
        { status: 500 }
      );
    }
    
   // Call Shipday
const shipdayResponse =
  await shipdayService.createOrder(testOrder);

// Return Shipday response
return NextResponse.json({
  success: true,
  message: "Shipday order created successfully.",
  shipday: shipdayResponse,
});
  } catch (error) {
  console.error("Shipday route error:", error);

  return NextResponse.json(
    {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected server error",
    },
    { status: 500 }
  );
}
  
}


