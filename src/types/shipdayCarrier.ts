/*
|--------------------------------------------------------------------------
| Shipday Carrier Types
|--------------------------------------------------------------------------
|
| These types represent Shipday delivery carriers.
|
| Shipday is the source of truth for:
|
| - Whether a carrier is active
| - Whether a carrier is currently on shift
| - The carrier's last reported location
|
| LIA remains the source of truth for:
|
| - Driver application status
| - Driver approval
| - Documents
| - Stripe payout readiness
| - The relationship between a LIA driver and Shipday carrier
|
*/

/*
|--------------------------------------------------------------------------
| Raw Shipday API Carrier
|--------------------------------------------------------------------------
|
| This interface must match the response returned by GET /carriers.
|
| Shipday currently documents the location properties with three "r"
| characters in "carrrier". We preserve that spelling here because an
| external API response type should match the API exactly.
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

  carrrierLocationLat: number | null;

  carrrierLocationLng: number | null;
}

/*
|--------------------------------------------------------------------------
| Create Carrier Request
|--------------------------------------------------------------------------
|
| Payload sent to Shipday when an approved LIA driver is added as a
| Shipday carrier.
|
*/
export interface CreateShipdayCarrierInput {
  name: string;

  email: string;

  phoneNumber: string;
}

/*
|--------------------------------------------------------------------------
| Create Carrier Response
|--------------------------------------------------------------------------
|
| Shipday returns a generated password when a carrier is created.
|
| That password must never be stored in the driver's Firestore document.
| It should only be handled temporarily by the secure server-side flow.
|
*/
export interface CreateShipdayCarrierResponse {
  carrierId: number;

  email: string;

  password: string;

  message: string;
}

/*
|--------------------------------------------------------------------------
| LIA Shipday Carrier Model
|--------------------------------------------------------------------------
|
| This is the normalized model used inside the LIA application.
|
| It prevents Shipday-specific naming, including the misspelled location
| properties, from spreading throughout the application.
|
*/
export interface ShipdayCarrier {
  carrierId: number;

  personalId: string;

  name: string;

  codeName: string;

  phoneNumber: string;

  companyId: number;

  areaId: number;

  email: string;

  photoUrl: string | null;

  isActive: boolean;

  isOnShift: boolean;

  latitude: number | null;

  longitude: number | null;
}

/*
|--------------------------------------------------------------------------
| Shipday Carrier Connection Status
|--------------------------------------------------------------------------
|
| Tracks the lifecycle of connecting an approved LIA driver to Shipday.
|
*/
export type ShipdayCarrierConnectionStatus =
  | "not_created"
  | "creating"
  | "connected"
  | "failed";

/*
|--------------------------------------------------------------------------
| Driver Operational Status
|--------------------------------------------------------------------------
|
| This is a UI-facing status derived from LIA approval and Shipday.
|
| It should not be saved as the permanent source of truth because it can
| be derived from existing data.
|
*/
export type DriverOperationalStatus =
  | "pending_approval"
  | "shipday_setup_required"
  | "inactive"
  | "offline"
  | "online";

/*
|--------------------------------------------------------------------------
| Carrier Mapper
|--------------------------------------------------------------------------
|
| Converts Shipday's external response into the clean internal model.
|
*/
export function mapShipdayCarrier(
  carrier: ShipdayCarrierApiResponse
): ShipdayCarrier {
  return {
    carrierId: carrier.id,

    personalId: carrier.personalId,

    name: carrier.name,

    codeName: carrier.codeName,

    phoneNumber: carrier.phoneNumber,

    companyId: carrier.companyId,

    areaId: carrier.areaId,

    email: carrier.email,

    photoUrl: carrier.carrierPhoto,

    isActive: carrier.isActive,

    isOnShift: carrier.isOnShift,

    latitude: carrier.carrrierLocationLat,

    longitude: carrier.carrrierLocationLng,
  };
}

/*
|--------------------------------------------------------------------------
| Operational Status Mapper
|--------------------------------------------------------------------------
|
| Determines what the LIA driver portal should display.
|
*/
export function getDriverOperationalStatus(input: {
  isApproved: boolean;
  carrier: ShipdayCarrier | null;
}): DriverOperationalStatus {
  if (!input.isApproved) {
    return "pending_approval";
  }

  if (!input.carrier) {
    return "shipday_setup_required";
  }

  if (!input.carrier.isActive) {
    return "inactive";
  }

  if (!input.carrier.isOnShift) {
    return "offline";
  }

  return "online";
}