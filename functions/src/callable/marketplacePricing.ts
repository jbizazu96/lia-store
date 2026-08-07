import * as admin from "firebase-admin";
import {onCall} from "firebase-functions/v2/https";
import {getMarketplacePricingPolicy} from "../payment/pricing/marketplacePricingPolicy";
if(admin.apps.length===0) admin.initializeApp();
export const getMarketplacePricing = onCall({region:"us-central1"}, async () => ({policy: await getMarketplacePricingPolicy()}));
