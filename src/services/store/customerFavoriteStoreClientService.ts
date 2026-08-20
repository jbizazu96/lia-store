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
import {loadCached, writeCached} from "@/services/cache/clientDataCache";

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
    return loadCached(
      "customer-favorite-stores",
      () => call("getCustomerFavoriteStores"),
      {ttlMs: 30_000},
    );
  },

  set(
    storeId: string,
    isFavorite: boolean
  ): Promise<{
    storeIds: string[];
  }> {
    return call<{storeIds: string[]}>("setCustomerStoreFavorite", {
      storeId,
      isFavorite,
    }).then((result) => writeCached(
      "customer-favorite-stores",
      result,
      {ttlMs: 30_000},
    ));
  },
};
