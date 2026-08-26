import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";
import {
  loadCached,
  writeCached,
} from "@/services/cache/clientDataCache";
import type {CartItem} from "@/types/cart";
import type {CustomerProfile} from "@/services/user/customerProfileClientService";
import type {CustomerTermsStatus} from "@/services/legal/customerLegalClientService";
import type {FulfillmentType} from "@/types/fulfillment";

export interface CustomerStartup {
  accountType: "customer";
  profile: CustomerProfile;
  legal: CustomerTermsStatus;
  cart: {items: CartItem[]; fulfillmentType: FulfillmentType};
  favoriteStores: {storeIds: string[]};
}

const STARTUP_TTL_MS = 30_000;

export const customerStartupClientService = {
  get: () => loadCached(
    "customer-startup",
    async () => {
      const result = await httpsCallable<unknown, CustomerStartup>(
        functions,
        "getCustomerStartup",
      )();
      const startup = result.data;

      writeCached("current-account", {accountType: startup.accountType}, {
        ttlMs: STARTUP_TTL_MS,
      });
      writeCached("customer-profile", startup.profile, {
        ttlMs: STARTUP_TTL_MS,
      });
      writeCached("customer-legal-status", startup.legal, {
        ttlMs: STARTUP_TTL_MS,
      });
      writeCached("customer-favorite-stores", startup.favoriteStores, {
        ttlMs: STARTUP_TTL_MS,
      });

      return startup;
    },
    {ttlMs: STARTUP_TTL_MS},
  ),
};
