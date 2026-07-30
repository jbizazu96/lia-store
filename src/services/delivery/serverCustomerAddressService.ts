/*
|--------------------------------------------------------------------------
| Server Customer Address Service
|--------------------------------------------------------------------------
|
| Customer addresses are geocoded on the server before persistence. This
| prevents callers from supplying arbitrary coordinates or bypassing address
| verification when saving their delivery location.
|
*/

import "server-only";

import {
  normalizeUsState,
} from "@/utils/usState";

export interface CustomerAddressInput {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface VerifiedCustomerAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

const upper = (value: string) => value.trim().toUpperCase();

function requiredValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

export async function verifyCustomerAddress(
  input: CustomerAddressInput
): Promise<VerifiedCustomerAddress> {
  const street = requiredValue(input.street, "Street address");
  const city = requiredValue(input.city, "City");
  const zip = requiredValue(input.zip, "ZIP code");
  const state = normalizeUsState(input.state);

  if (!state) {
    throw new Error("Enter a valid U.S. state name or two-letter abbreviation.");
  }

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error("Address verification is temporarily unavailable.");
  }

  const address = `${street}, ${city}, ${state} ${zip}`;
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`,
    { cache: "no-store" }
  );
  const result = await response.json() as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: {
        location?: {
          lat?: number;
          lng?: number;
        };
      };
    }>;
  };
  const location = result.results?.[0]?.geometry?.location;

  if (
    result.status !== "OK" ||
    typeof location?.lat !== "number" ||
    typeof location.lng !== "number"
  ) {
    throw new Error(
      "We couldn't verify this delivery address. Check the street, city, state, and ZIP code."
    );
  }

  return {
    street: upper(street),
    city: upper(city),
    state,
    zip: upper(zip),
    latitude: location.lat,
    longitude: location.lng,
    formattedAddress: upper(result.results?.[0]?.formatted_address ?? address),
  };
}
