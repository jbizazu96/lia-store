import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";

export const orderZoneRequestClientService = {
  create: async (input: {customerAddress: string; storeCity: string; storeId?: string}) => {
    const response = await httpsCallable<typeof input, {success: boolean; requestId: string}>(functions, "createCustomerOrderZoneRequest")(input);
    return response.data;
  },
};
