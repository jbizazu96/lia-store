import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";
import type {HomePromotion} from "@/types/homePromotion";

export const homePromotionClientService = {
  getActive: async (): Promise<HomePromotion[]> => {
    const result = await httpsCallable<unknown, {promotions: HomePromotion[]}>(
      functions,
      "getCustomerHomePromotions",
    )();
    return result.data.promotions;
  },
};
