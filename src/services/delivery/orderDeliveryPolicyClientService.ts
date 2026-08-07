import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";
import {loadCached} from "@/services/cache/clientDataCache";
export interface OrderDeliveryPolicy {minutesPerMile:number; defaultPreparationMinutes:number; reminderIntervalsMinutes:{pending:number;accepted:number;preparing:number};}
export const orderDeliveryPolicyClientService={getPolicy:():Promise<OrderDeliveryPolicy>=>loadCached("order-delivery-policy",async()=>{const result=await httpsCallable<unknown,{policy:OrderDeliveryPolicy}>(functions,"getOrderDeliveryPolicyForClient")();return result.data.policy;},{ttlMs:60_000})};
