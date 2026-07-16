/*
|--------------------------------------------------------------------------
| Shipday Service
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| This service is responsible for communicating with the Shipday API.
|
| IMPORTANT
| ---------
| This file DOES NOT define Shipday interfaces.
|
| Those live in:
|
|     src/types/shipday.ts
|
| This keeps our architecture clean by separating:
|
|   Types  -> describe data
|   Service -> performs actions
|
*/

import type {
  ShipdayOrder,
  ShipdayCreateOrderResponse,
} from "@/types/shipday";

/**
 * ShipdayService
 *
 * Every function inside this class communicates with Shipday.
 */
export class ShipdayService {
  /**
   * Creates a delivery inside Shipday.
   *
   * @param order
   * Information about the order we want Shipday to deliver.
   *
   * @returns
   * The response returned by Shipday.
   */
  async createOrder(
    order: ShipdayOrder
  ): Promise<ShipdayCreateOrderResponse> {
    // Build the Shipday endpoint from our environment variable.
    const url = `${process.env.SHIPDAY_API_URL}/orders`;

    // HTTP headers required by Shipday.
    const headers = {
      Accept: "application/json",

      "Content-Type": "application/json",

      Authorization: `Basic ${process.env.SHIPDAY_API_KEY}`,
    };

    // Send the request to Shipday.
    const response = await fetch(url, {
      method: "POST",

      headers,

      body: JSON.stringify(order),
    });

    // Convert the JSON response into a JavaScript object.
    const result = await response.json();

    // If Shipday rejected our request,
    // throw an error so the API route can handle it.
    if (!response.ok) {
      throw new Error(
        result.message || "Shipday request failed."
      );
    }

    // Return the successful response.
    return result;
  }
}

/**
 * Singleton instance.
 *
 * We export one shared instance instead of creating
 * a new ShipdayService everywhere.
 */
export const shipdayService = new ShipdayService();