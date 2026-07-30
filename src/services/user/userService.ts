/*
|--------------------------------------------------------------------------
| User Service
|--------------------------------------------------------------------------
|
| Centralizes Firestore reads related to users.
|
| UI pages should not read the "users" collection directly.
|
*/

import {
  collection,
  doc,
  getDocs,
  getDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

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
   * Checks the canonical user document and addresses subcollection used by
   * profile, checkout, and customer login.
   */
  async hasDefaultDeliveryAddress(userId: string): Promise<boolean> {
    const userSnapshot = await getDoc(doc(db, "users", userId));

    if (
      userSnapshot.exists() &&
      hasSavedDeliveryAddress(userSnapshot.data().defaultAddress)
    ) {
      return true;
    }

    const addressSnapshots = await getDocs(
      collection(db, "users", userId, "addresses")
    );

    return addressSnapshots.docs.some((address) =>
      hasSavedDeliveryAddress(address.data())
    );
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
    const userReference = doc(
      db,
      "users",
      userId
    );

    const userSnapshot =
      await getDoc(userReference);

    const userLocation = userSnapshot.exists()
      ? toUserLocation(userSnapshot.data().defaultAddress)
      : null;

    if (userLocation) {
      return userLocation;
    }

    // Older customer accounts may store their default address only in this
    // subcollection. Checkout already supports it; customer home must too.
    const addressSnapshots = await getDocs(
      collection(db, "users", userId, "addresses")
    );

    const defaultAddress = addressSnapshots.docs.find(
      (address) => address.data().isDefault === true
    ) ?? addressSnapshots.docs[0];

    const subcollectionLocation = toUserLocation(
      defaultAddress?.data()
    );

    if (subcollectionLocation) {
      return subcollectionLocation;
    }

    return null;
  },

  
  /*
  |--------------------------------------------------------------------------
  | Get Store ID
  |--------------------------------------------------------------------------
  |
  | Returns the store ID linked to a user account.
  |
  */

  async getStoreId(
    userId: string
  ): Promise<string | null> {
    const userReference = doc(
      db,
      "users",
      userId
    );

    const userSnapshot =
      await getDoc(userReference);

    if (!userSnapshot.exists()) {
      return null;
    }

    const storeId =
      userSnapshot.data().storeId;

    if (
      typeof storeId !== "string" ||
      !storeId.trim()
    ) {
      return null;
    }

    return storeId;
  },
};
