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
  doc,
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

/*
|--------------------------------------------------------------------------
| User Service
|--------------------------------------------------------------------------
*/

export const userService = {
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

    if (!userSnapshot.exists()) {
      return null;
    }

    const userData = userSnapshot.data();

    const latitude =
      userData.defaultAddress?.latitude;

    const longitude =
      userData.defaultAddress?.longitude;

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return null;
    }

    return {
      lat: latitude,
      lng: longitude,
    };
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
