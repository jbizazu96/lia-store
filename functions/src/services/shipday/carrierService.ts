/*
|--------------------------------------------------------------------------
| Shipday Carrier Service
|--------------------------------------------------------------------------
|
| Server-only integration for Shipday delivery carriers.
|
| Responsibilities:
|
| - Retrieve carriers from Shipday
| - Find an existing carrier by email
| - Create a carrier for an approved LIA driver
| - Delete a Shipday carrier through trusted server workflows
| - Normalize and validate Shipday API responses
|
| The Shipday API key must remain inside Firebase Functions and must never
| be exposed to browser code.
|
*/

const SHIPDAY_API_URL =
  process.env.SHIPDAY_API_URL?.trim() ||
  "https://api.shipday.com";

const SHIPDAY_API_KEY =
  process.env.SHIPDAY_API_KEY?.trim();

/*
|--------------------------------------------------------------------------
| Shipday API Types
|--------------------------------------------------------------------------
|
| These types intentionally live in Functions instead of importing from
| the Next.js application. Firebase Functions should remain deployable as
| an independent server project.
|
*/

export interface ShipdayCarrierApiResponse {
  id: number;
  personalId: string;
  name: string;
  codeName: string;
  phoneNumber: string;
  companyId: number;
  areaId: number;
  isOnShift: boolean;
  email: string;
  carrierPhoto: string | null;
  isActive: boolean;

  /*
   * Shipday currently documents these properties with three "r"
   * characters. Keep the external API spelling here.
   */
  carrrierLocationLat: number | null;
  carrrierLocationLng: number | null;
}

export interface CreateShipdayCarrierInput {
  name: string;
  email: string;
  phoneNumber: string;
}

export interface CreateShipdayCarrierResponse {
  carrierId: number;
  email: string;
  password: string;
  message: string;
}

export interface DeleteShipdayCarrierResponse {
  success: boolean;
  response: string;
}

/*
|--------------------------------------------------------------------------
| Internal Errors
|--------------------------------------------------------------------------
*/

export class ShipdayCarrierServiceError extends Error {
  readonly status: number | null;
  readonly responseBody: string | null;

  constructor(
    message: string,
    options?: {
      status?: number;
      responseBody?: string;
    }
  ) {
    super(message);

    this.name = "ShipdayCarrierServiceError";
    this.status = options?.status ?? null;
    this.responseBody = options?.responseBody ?? null;
  }
}

/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

function requireShipdayApiKey(): string {
  if (!SHIPDAY_API_KEY) {
    throw new ShipdayCarrierServiceError(
      "SHIPDAY_API_KEY is not configured for Firebase Functions."
    );
  }

  return SHIPDAY_API_KEY;
}

/*
|--------------------------------------------------------------------------
| Normalization Helpers
|--------------------------------------------------------------------------
*/

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeRequiredText(
  value: string,
  fieldName: string
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new ShipdayCarrierServiceError(
      `${fieldName} is required to create a Shipday carrier.`
    );
  }

  return normalized;
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function nullableString(
  value: unknown
): string | null {
  return typeof value === "string"
    ? value
    : null;
}

function nullableNumber(
  value: unknown
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : null;
}

/*
|--------------------------------------------------------------------------
| Response Parsing
|--------------------------------------------------------------------------
*/

function parseCarrier(
  value: unknown
): ShipdayCarrierApiResponse {
  if (!isRecord(value)) {
    throw new ShipdayCarrierServiceError(
      "Shipday returned an invalid carrier object."
    );
  }

  if (
    typeof value.id !== "number" ||
    !Number.isFinite(value.id)
  ) {
    throw new ShipdayCarrierServiceError(
      "Shipday carrier response is missing a valid carrier ID."
    );
  }

  return {
    id: value.id,

    personalId:
      typeof value.personalId === "string"
        ? value.personalId
        : "",

    name:
      typeof value.name === "string"
        ? value.name
        : "",

    codeName:
      typeof value.codeName === "string"
        ? value.codeName
        : "",

    phoneNumber:
      typeof value.phoneNumber === "string"
        ? value.phoneNumber
        : "",

    companyId:
      typeof value.companyId === "number" &&
      Number.isFinite(value.companyId)
        ? value.companyId
        : 0,

    areaId:
      typeof value.areaId === "number" &&
      Number.isFinite(value.areaId)
        ? value.areaId
        : 0,

    isOnShift:
      value.isOnShift === true,

    email:
      typeof value.email === "string"
        ? value.email
        : "",

    carrierPhoto:
      nullableString(value.carrierPhoto),

    isActive:
      value.isActive === true,

    carrrierLocationLat:
      nullableNumber(value.carrrierLocationLat),

    carrrierLocationLng:
      nullableNumber(value.carrrierLocationLng),
  };
}

function parseCreateCarrierResponse(
  value: unknown
): CreateShipdayCarrierResponse {
  if (!isRecord(value)) {
    throw new ShipdayCarrierServiceError(
      "Shipday returned an invalid create-carrier response."
    );
  }

  if (
    typeof value.carrierId !== "number" ||
    !Number.isFinite(value.carrierId)
  ) {
    throw new ShipdayCarrierServiceError(
      "Shipday did not return a valid carrier ID."
    );
  }

  return {
    carrierId: value.carrierId,

    email:
      typeof value.email === "string"
        ? value.email
        : "",

    password:
      typeof value.password === "string"
        ? value.password
        : "",

    message:
      typeof value.message === "string"
        ? value.message
        : "",
  };
}

function parseDeleteCarrierResponse(
  value: unknown
): DeleteShipdayCarrierResponse {
  if (!isRecord(value)) {
    throw new ShipdayCarrierServiceError(
      "Shipday returned an invalid delete-carrier response."
    );
  }

  if (typeof value.success !== "boolean") {
    throw new ShipdayCarrierServiceError(
      "Shipday delete-carrier response is missing a valid success value."
    );
  }

  return {
    success: value.success,

    response:
      typeof value.response === "string"
        ? value.response
        : "",
  };
}

/*
|--------------------------------------------------------------------------
| Shipday Request
|--------------------------------------------------------------------------
|
| Existing LIA Shipday integrations use the server-side API key.
|
| The current Shipday documentation contains examples using both:
|
| - Authorization: Basic <API_KEY>
| - x-api-key: <API_KEY>
|
| We use Authorization here to match the carrier endpoint examples supplied
| for this integration.
|
*/

async function shipdayRequest(
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  const apiKey = requireShipdayApiKey();

  const response = await fetch(
    `${SHIPDAY_API_URL}${path}`,
    {
      ...init,

      headers: {
        Accept: "application/json",
        Authorization: `Basic ${apiKey}`,
        ...init.headers,
      },
    }
  );

  const responseText =
    await response.text();

  let responseBody: unknown = null;

  if (responseText) {
    try {
      responseBody =
        JSON.parse(responseText);
    } catch {
      responseBody =
        responseText;
    }
  }

  if (!response.ok) {
    const readableBody =
      typeof responseBody === "string"
        ? responseBody
        : JSON.stringify(responseBody);

    throw new ShipdayCarrierServiceError(
      `Shipday carrier request failed with status ${response.status}.`,
      {
        status: response.status,
        responseBody: readableBody,
      }
    );
  }

  return responseBody;
}

/*
|--------------------------------------------------------------------------
| Public Carrier Service
|--------------------------------------------------------------------------
*/

export const shipdayCarrierService = {
  /*
   * Retrieve every carrier available to the configured Shipday account.
   */
  async retrieveCarriers(): Promise<
    ShipdayCarrierApiResponse[]
  > {
    const response =
      await shipdayRequest("/carriers", {
        method: "GET",
      });

    if (!Array.isArray(response)) {
      throw new ShipdayCarrierServiceError(
        "Shipday returned an invalid carrier list."
      );
    }

    return response.map(parseCarrier);
  },

  /*
   * Find a Shipday carrier using a normalized email address.
   *
   * This is primarily used as duplicate protection or to repair a missing
   * Firestore carrier ID after a previous Shipday request succeeded.
   */
  async findCarrierByEmail(
    email: string
  ): Promise<ShipdayCarrierApiResponse | null> {
    const normalizedEmail =
      normalizeEmail(email);

    if (!normalizedEmail) {
      throw new ShipdayCarrierServiceError(
        "A driver email is required to find a Shipday carrier."
      );
    }

    const carriers =
      await this.retrieveCarriers();

    return (
      carriers.find(
        (carrier) =>
          normalizeEmail(carrier.email) ===
          normalizedEmail
      ) ?? null
    );
  },

  /*
   * Create a new Shipday carrier.
   *
   * The returned generated password is transient sensitive information.
   * The trigger must never save it to the driver's Firestore document.
   */
  async createCarrier(
    input: CreateShipdayCarrierInput
  ): Promise<CreateShipdayCarrierResponse> {
    const name = normalizeRequiredText(
      input.name,
      "Driver name"
    );

    const email = normalizeEmail(
      normalizeRequiredText(
        input.email,
        "Driver email"
      )
    );

    const phoneNumber =
      normalizeRequiredText(
        input.phoneNumber,
        "Driver phone number"
      );

    const response =
      await shipdayRequest("/carriers", {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          name,
          email,
          phoneNumber,
        }),
      });

    return parseCreateCarrierResponse(
      response
    );
  },

  /*
   * Delete a carrier from the configured Shipday account.
   *
   * This method must only be called from trusted server-side workflows.
   * The Shipday API key must never be exposed to the browser.
   */
  async deleteCarrier(
    carrierId: number
  ): Promise<DeleteShipdayCarrierResponse> {
    if (
      !Number.isInteger(carrierId) ||
      carrierId <= 0
    ) {
      throw new ShipdayCarrierServiceError(
        "A valid Shipday carrier ID is required to delete a carrier."
      );
    }

    const response =
      await shipdayRequest(
        `/carriers/${encodeURIComponent(
          String(carrierId)
        )}`,
        {
          method: "DELETE",
        }
      );

    const deletionResult =
      parseDeleteCarrierResponse(response);

    if (!deletionResult.success) {
      throw new ShipdayCarrierServiceError(
        deletionResult.response ||
          "Shipday did not confirm that the carrier was deleted."
      );
    }

    return deletionResult;
  },

  /*
   * Resolve an existing carrier first and create one only when necessary.
   *
   * This gives the approval trigger a second layer of duplicate protection
   * in addition to checking the carrier ID stored in Firestore.
   */
  async findOrCreateCarrier(
    input: CreateShipdayCarrierInput
  ): Promise<{
    carrierId: number;
    email: string;
    password: string | null;
    message: string;
    wasCreated: boolean;
  }> {
    const existingCarrier =
      await this.findCarrierByEmail(
        input.email
      );

    if (existingCarrier) {
      return {
        carrierId:
          existingCarrier.id,

        email:
          existingCarrier.email,

        password: null,

        message:
          "Existing Shipday carrier found.",

        wasCreated: false,
      };
    }

    const createdCarrier =
      await this.createCarrier(input);

    return {
      carrierId:
        createdCarrier.carrierId,

      email:
        createdCarrier.email,

      password:
        createdCarrier.password ||
        null,

      message:
        createdCarrier.message,

      wasCreated: true,
    };
  },
};
