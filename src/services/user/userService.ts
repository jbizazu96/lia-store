/*
|--------------------------------------------------------------------------
| User Service
|--------------------------------------------------------------------------
|
| Centralizes authenticated customer-profile reads.
|
| UI pages use callable Functions; they never read the "users" collection.
|
*/

import {
  auth,
} from "@/lib/firebase";
import {
  customerProfileClientService,
} from "./customerProfileClientService";
import {
  loadCached,
} from "@/services/cache/clientDataCache";

/*
|--------------------------------------------------------------------------
| User Location
|--------------------------------------------------------------------------
|
| A small reusable location type for distance calculations.
|
*/

export interface UserLocation {
  lat: number;
  lng: number;
}

function toUserLocation(
  address: unknown
): UserLocation | null {
  if (!address || typeof address !== "object") {
    return null;
  }

  const { latitude, longitude } = address as {
    latitude?: unknown;
    longitude?: unknown;
  };

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }

  return { lat: latitude, lng: longitude };
}

/* A saved address must include a street value before login can skip setup. */
function hasSavedDeliveryAddress(
  address: unknown
): boolean {
  return Boolean(
    address &&
    typeof address === "object" &&
    typeof (address as { street?: unknown }).street === "string" &&
    (address as { street: string }).street.trim()
  );
}

/*
|--------------------------------------------------------------------------
| User Service
|--------------------------------------------------------------------------
*/

export const userService = {
  /**
   * Checks the server-owned default address used by profile, checkout, and
   * customer login.
   */
  async hasDefaultDeliveryAddress(userId: string): Promise<boolean> {
    if (auth.currentUser?.uid !== userId) {
      throw new Error("You are not authorized to view this address.");
    }

    const profile = await customerProfileClientService.getProfile();
    return hasSavedDeliveryAddress(profile.defaultAddress);
  },

  /*
  |--------------------------------------------------------------------------
  | Get Default Location
  |--------------------------------------------------------------------------
  |
  | Reads the user's default delivery address and returns only the
  | coordinates required by the delivery-distance services.
  |
  | Returns null when:
  | - The user document does not exist.
  | - No default address exists.
  | - The coordinates are invalid.
  |
  */

  async getDefaultLocation(
    userId: string
  ): Promise<UserLocation | null> {
    return loadCached(
      `customer-default-location:${userId}`,
      async () => {
        if (auth.currentUser?.uid !== userId) {
          throw new Error("You are not authorized to view this address.");
        }

        const profile = await customerProfileClientService.getProfile();
        return toUserLocation(profile.defaultAddress);
      },
      { ttlMs: 30_000 },
    );
  },

};
