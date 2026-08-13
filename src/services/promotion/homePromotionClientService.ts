import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";
import type {HomePromotion} from "@/types/homePromotion";
import {loadCached, writeCached} from "@/services/cache/clientDataCache";

const HOME_PROMOTION_CACHE_KEY = "customer-home-promotions";
const HOME_PROMOTION_CACHE_TTL_MS = 5 * 60 * 1000;
let forcedRefresh: Promise<HomePromotion[]> | null = null;

async function loadPromotions(): Promise<HomePromotion[]> {
  const result = await httpsCallable<unknown, {promotions: HomePromotion[]}>(
    functions,
    "getCustomerHomePromotions",
  )();
  return result.data.promotions;
}

export const homePromotionClientService = {
  getActive: (forceRefresh = false): Promise<HomePromotion[]> =>
    forceRefresh
      ? forcedRefresh ?? (() => {
        forcedRefresh = loadPromotions()
          .then((promotions) => writeCached(
            HOME_PROMOTION_CACHE_KEY,
            promotions,
            {ttlMs: HOME_PROMOTION_CACHE_TTL_MS, scope: "public"},
          ))
          .finally(() => {
            forcedRefresh = null;
          });
        return forcedRefresh;
      })()
      : loadCached(
        HOME_PROMOTION_CACHE_KEY,
        loadPromotions,
        {ttlMs: HOME_PROMOTION_CACHE_TTL_MS, scope: "public"},
      ),
};
