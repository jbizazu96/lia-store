/*
|--------------------------------------------------------------------------
| Shipday Service (Cloud Functions)
|--------------------------------------------------------------------------
|
| This service is the ONLY place that communicates with Shipday.
|
| The frontend never talks directly to Shipday.
|
*/

export class ShipdayService {
  /**
   * Creates a delivery inside Shipday.
   */
  async createOrder(order: any) {
    const apiKey = process.env.SHIPDAY_API_KEY;

    const apiUrl = process.env.SHIPDAY_API_URL;

    if (!apiKey) {
      throw new Error("SHIPDAY_API_KEY is missing.");
    }

    if (!apiUrl) {
      throw new Error("SHIPDAY_API_URL is missing.");
    }

    const response = await fetch(
      `${apiUrl}/orders`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Authorization: `Basic ${apiKey}`,
        },

        body: JSON.stringify(order),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.message ??
        "Shipday request failed."
      );
    }

    return result;
  }

    /**
   * Retrieves a delivery from Shipday.
   *
   * @param orderId
   * Shipday delivery ID.
   */
 

    /**
 * Retrieves a single Shipday order
 * using the LIA order number.
 *
 * Shipday exposes:
 *
 * GET /orders/{orderNumber}
 */
async getOrderDetails(
  orderNumber: string
) {

  const apiKey = process.env.SHIPDAY_API_KEY;

  const apiUrl = process.env.SHIPDAY_API_URL;

  if (!apiKey) {
    throw new Error("SHIPDAY_API_KEY is missing.");
  }

  if (!apiUrl) {
    throw new Error("SHIPDAY_API_URL is missing.");
  }

  const response = await fetch(
    `${apiUrl}/orders/${orderNumber}`,
    {
      method: "GET",

      headers: {
        Authorization: `Basic ${apiKey}`,
      },
    }
  );

  const result = await response.json();

  console.log(
    "Shipday Order Details:"
  );

  console.log(result);

  if (!response.ok) {
    throw new Error(
      result.message ??
      "Unable to retrieve Shipday order."
    );
  }

  // Shipday returns an array with one object.
  if (!Array.isArray(result) || result.length === 0) {
    throw new Error(
      `Shipday order ${orderNumber} not found.`
    );
  }

  return result[0];

}
  
}

export const shipdayService =
  new ShipdayService();