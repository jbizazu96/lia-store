/*
|--------------------------------------------------------------------------
| Shipday Service (Cloud Functions)
|--------------------------------------------------------------------------
|
| This service is the only place that communicates directly with Shipday.
|
| Responsibilities:
|
| • Create Shipday delivery orders
| • Retrieve Shipday delivery details
| • Mark Shipday orders ready for pickup
|
| The frontend must never call Shipday directly.
|
*/

interface ShipdayErrorResponse {
  message?: string;

  [key: string]: unknown;
}

export class ShipdayService {
  /*
  |--------------------------------------------------------------------------
  | Configuration
  |--------------------------------------------------------------------------
  */

  private getConfiguration(): {
    apiKey: string;
    apiUrl: string;
  } {
    const apiKey =
      process.env.SHIPDAY_API_KEY;

    const rawApiUrl =
      process.env.SHIPDAY_API_URL;

    if (!apiKey) {
      throw new Error(
        "SHIPDAY_API_KEY is missing."
      );
    }

    if (!rawApiUrl) {
      throw new Error(
        "SHIPDAY_API_URL is missing."
      );
    }

    /*
      Remove a trailing slash so requests do not become:

      https://api.shipday.com//orders
    */
    const apiUrl =
      rawApiUrl.replace(/\/+$/, "");

    return {
      apiKey,
      apiUrl,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Read Response Body
  |--------------------------------------------------------------------------
  |
  | Some Shipday endpoints return JSON.
  |
  | The ready-for-pickup endpoint can return HTTP 202 with an empty body,
  | so calling response.json() unconditionally would throw an error even
  | though Shipday accepted the request.
  |
  */

  private async readResponseBody(
    response: Response
  ): Promise<unknown> {
    const responseText =
      await response.text();

    if (!responseText.trim()) {
      return null;
    }

    try {
      return JSON.parse(
        responseText
      ) as unknown;
    } catch {
      return responseText;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Error Message
  |--------------------------------------------------------------------------
  */

  private getErrorMessage(
    responseBody: unknown,
    fallbackMessage: string
  ): string {
    if (
      typeof responseBody === "object" &&
      responseBody !== null &&
      "message" in responseBody
    ) {
      const errorResponse =
        responseBody as
          ShipdayErrorResponse;

      if (
        typeof errorResponse.message ===
          "string" &&
        errorResponse.message.trim()
      ) {
        return errorResponse.message.trim();
      }
    }

    if (
      typeof responseBody === "string" &&
      responseBody.trim()
    ) {
      return responseBody.trim();
    }

    return fallbackMessage;
  }

  /*
  |--------------------------------------------------------------------------
  | Create Order
  |--------------------------------------------------------------------------
  */

  async createOrder(
    order: unknown
  ): Promise<unknown> {
    const {
      apiKey,
      apiUrl,
    } = this.getConfiguration();

    const response =
      await fetch(
        `${apiUrl}/orders`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Basic ${apiKey}`,
          },

          body:
            JSON.stringify(order),
        }
      );

    const result =
      await this.readResponseBody(
        response
      );

    if (!response.ok) {
      throw new Error(
        this.getErrorMessage(
          result,
          "Shipday order creation failed."
        )
      );
    }

    return result;
  }

  /*
  |--------------------------------------------------------------------------
  | Get Order Details
  |--------------------------------------------------------------------------
  |
  | Retrieves a Shipday order using the LIA order number.
  |
  | Shipday endpoint:
  |
  | GET /orders/{orderNumber}
  |
  */

  async getOrderDetails(
    orderNumber: string
  ): Promise<unknown> {
    const normalizedOrderNumber =
      orderNumber.trim();

    if (!normalizedOrderNumber) {
      throw new Error(
        "A Shipday order number is required."
      );
    }

    const {
      apiKey,
      apiUrl,
    } = this.getConfiguration();

    const response =
      await fetch(
        `${apiUrl}/orders/${encodeURIComponent(
          normalizedOrderNumber
        )}`,
        {
          method: "GET",

          headers: {
            Authorization:
              `Basic ${apiKey}`,
          },
        }
      );

    const result =
      await this.readResponseBody(
        response
      );

    if (!response.ok) {
      throw new Error(
        this.getErrorMessage(
          result,
          "Unable to retrieve the Shipday order."
        )
      );
    }

    /*
      Shipday currently returns an array containing one order.
    */
    if (
      !Array.isArray(result) ||
      result.length === 0
    ) {
      throw new Error(
        `Shipday order ${normalizedOrderNumber} was not found.`
      );
    }

    return result[0];
  }

  /*
  |--------------------------------------------------------------------------
  | Mark Order Ready for Pickup
  |--------------------------------------------------------------------------
  |
  | Called only after the store changes the LIA order from:
  |
  | preparing → ready_for_pickup
  |
  | This endpoint uses Shipday's own order ID, not the Firestore order ID
  | and not the LIA order number.
  |
  | Shipday endpoint:
  |
  | PUT /orders/{shipdayOrderId}/meta
  |
  | Body:
  |
  | {
  |   "readyToPickup": true
  | }
  |
  | Shipday may return:
  |
  | • 200 OK
  | • 202 Accepted
  |
  | Both are considered successful because response.ok includes every
  | HTTP status from 200 through 299.
  |
  */

  async markOrderReadyForPickup(
    shipdayOrderId: string
  ): Promise<void> {
    const normalizedShipdayOrderId =
      shipdayOrderId.trim();

    if (!normalizedShipdayOrderId) {
      throw new Error(
        "A Shipday order ID is required."
      );
    }

    const {
      apiKey,
      apiUrl,
    } = this.getConfiguration();

    const response =
      await fetch(
        `${apiUrl}/orders/${encodeURIComponent(
          normalizedShipdayOrderId
        )}/meta`,
        {
          method: "PUT",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Basic ${apiKey}`,
          },

          body:
            JSON.stringify({
              readyToPickup: true,
            }),
        }
      );

    const result =
      await this.readResponseBody(
        response
      );

    if (!response.ok) {
      throw new Error(
        this.getErrorMessage(
          result,
          "Shipday could not mark the order ready for pickup."
        )
      );
    }
  }
}

export const shipdayService =
  new ShipdayService();