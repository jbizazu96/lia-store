/*
|--------------------------------------------------------------------------
| Shipday Service
|--------------------------------------------------------------------------
|
| Responsible for communicating with the Shipday API.
|
| This is a server-only service because it uses the private
| Shipday API key.
|
| It does NOT:
|
| • Define Shipday models
| • Map LIA orders into Shipday orders
| • Decide when a delivery should be created
| • Update Firestore orders
|
*/

import "server-only";

import type {
  ShipdayOrder,
  ShipdayCreateOrderResponse,
} from "@/types/shipday";

/**
 * Retrieve and validate the Shipday configuration.
 *
 * Failing here gives us a clear error instead of sending a request to
 * "undefined/orders" or using an empty API key.
 */
function getShipdayConfig(): {
  apiUrl: string;
  apiKey: string;
} {
  const apiUrl =
    process.env.SHIPDAY_API_URL?.replace(/\/+$/, "");

  const apiKey = process.env.SHIPDAY_API_KEY;

  if (!apiUrl) {
    throw new Error(
      "SHIPDAY_API_URL is not configured."
    );
  }

  if (!apiKey) {
    throw new Error(
      "SHIPDAY_API_KEY is not configured."
    );
  }

  return {
    apiUrl,
    apiKey,
  };
}

/**
 * Safely read a Shipday response.
 *
 * Some failed HTTP responses may not contain valid JSON.
 */
async function readResponseBody(
  response: Response
): Promise<unknown> {
  const contentType =
    response.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/json")
  ) {
    return response.json();
  }

  return response.text();
}

/**
 * Extract a useful error message from an unknown response body.
 */
function getErrorMessage(
  body: unknown
): string {
  if (typeof body === "string" && body.trim()) {
    return body;
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
  ) {
    return body.message;
  }

  return "Shipday request failed.";
}

/**
 * Service responsible only for Shipday API communication.
 */
export class ShipdayService {
  /**
   * Create a delivery order in Shipday.
   */
  async createOrder(
    order: ShipdayOrder
  ): Promise<ShipdayCreateOrderResponse> {
    const {
      apiUrl,
      apiKey,
    } = getShipdayConfig();

    const response = await fetch(
      `${apiUrl}/orders`,
      {
        method: "POST",

        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Basic ${apiKey}`,
        },

        body: JSON.stringify(order),

        /**
         * Delivery creation must always reach Shipday and should not
         * be cached by Next.js.
         */
        cache: "no-store",
      }
    );

    const body = await readResponseBody(response);

    if (!response.ok) {
      throw new Error(
        `Shipday order creation failed (${response.status}): ${getErrorMessage(body)}`
      );
    }

    if (
      typeof body !== "object" ||
      body === null
    ) {
      throw new Error(
        "Shipday returned an invalid response."
      );
    }

    return body as ShipdayCreateOrderResponse;
  }
}

/**
 * Shared Shipday service instance.
 */
export const shipdayService =
  new ShipdayService();