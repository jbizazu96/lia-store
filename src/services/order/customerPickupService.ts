import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";

export async function getCustomerPickupCode(orderId: string): Promise<string> {
  const response = await httpsCallable<
    {orderId: string},
    {code: string}
  >(functions, "getCustomerPickupCode")({orderId});
  if (!/^\d{6}$/.test(response.data.code)) {
    throw new Error("Your pickup code is not available yet.");
  }
  return response.data.code;
}
