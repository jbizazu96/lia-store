import {
  httpsCallable,
} from "firebase/functions";
import {
  functions,
} from "@/lib/firebase";

export interface CustomerDeliveryProof {
  signatureUrl: string | null;
  imageUrls: string[];
}

export const customerDeliveryProofClientService = {
  async get(
    orderId: string,
  ): Promise<CustomerDeliveryProof | null> {
    const callable = httpsCallable<
      {orderId: string},
      {proof: CustomerDeliveryProof | null}
    >(
      functions,
      "getCustomerDeliveryProof",
    );
    const result = await callable({
      orderId,
    });

    return result.data.proof;
  },
};
