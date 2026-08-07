import {
  httpsCallable,
} from "firebase/functions";
import {
  functions,
} from "@/lib/firebase";
import {
  loadCached,
} from "@/services/cache/clientDataCache";

export type CurrentAccountType =
  | "customer"
  | "store_owner"
  | "driver"
  | "admin";

export class CurrentAccountClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CurrentAccountClientError";
  }
}

export const currentAccountClientService = {
  get: () => loadCached(
    "current-account",
    async () => {
      try {
        const result = await httpsCallable<unknown, {
          accountType: CurrentAccountType;
        }>(functions, "getCurrentAccount")();
        return result.data;
      } catch (error) {
        const functionError = error as {
          code?: unknown;
          message?: unknown;
        };
        throw new CurrentAccountClientError(
          typeof functionError.message === "string"
            ? functionError.message
            : "We could not verify your account access.",
          functionError.code === "functions/unauthenticated" ||
            functionError.code === "functions/permission-denied"
            ? 403
            : 500,
        );
      }
    },
    { ttlMs: 30_000 },
  ),
};
