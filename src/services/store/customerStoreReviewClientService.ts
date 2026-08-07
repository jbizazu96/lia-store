import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export interface CustomerStoreReview {
  rating: number;
  comment: string;
}

async function call<T>(name: string, data: unknown): Promise<T> {
  try {
    return (await httpsCallable<unknown, T>(functions, name)(data)).data;
  } catch (error) {
    throw new Error(
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "The review request could not be completed.",
    );
  }
}

export const customerStoreReviewClientService = {
  get: async (orderId: string) => call<{ review: CustomerStoreReview | null }>("getCustomerStoreReview", { orderId }),
  submit: async (orderId: string, rating: number, comment: string) =>
    call<{ rating: number }>("submitCustomerStoreReview", { orderId, rating, comment }),
};
