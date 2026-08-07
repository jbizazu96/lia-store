/*
|--------------------------------------------------------------------------
| Customer Saved Stores Client Service
|--------------------------------------------------------------------------
|
| Saved stores are customer preference data. Every read and mutation goes
| through authenticated Firebase callables; the UI never writes user records
| directly.
|
*/

import {
  functions,
} from "@/lib/firebase";
import {
  httpsCallable,
} from "firebase/functions";

async function call<T>(
  name: string,
  data?: unknown
): Promise<T> {
  try {
    const result = await httpsCallable<unknown, T>(
      functions,
      name
    )(data);

    return result.data;
  } catch (error) {
    throw new Error(
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Saved stores could not be updated."
    );
  }
}

export const customerFavoriteStoreClientService = {
  get(): Promise<{
    storeIds: string[];
  }> {
    return call("getCustomerFavoriteStores");
  },

  set(
    storeId: string,
    isFavorite: boolean
  ): Promise<{
    storeIds: string[];
  }> {
    return call("setCustomerStoreFavorite", {
      storeId,
      isFavorite,
    });
  },
};
