/* Customer refund claims are callable-only; no browser payment writes. */
import {httpsCallable} from "firebase/functions";
import {ref, uploadBytes} from "firebase/storage";
import {auth, functions, storage} from "@/lib/firebase";

async function call<T>(name: string, data: unknown): Promise<T> {
  try { return (await httpsCallable<unknown, T>(functions, name)(data)).data; }
  catch (error) { throw new Error(typeof (error as {message?: unknown}).message === "string" ? (error as {message: string}).message : "Unable to complete this support request."); }
}

export const refundClaimClientService = {
  get: (orderId: string) => call<{claim: null | {id: string; reason: string; description: string; status: string; createdAt: string | null; decisionReason: string | null; decisionAt: string | null; refundId: string | null; refundStatus: string | null; refundCompletedAt: string | null; hasPhotoEvidence: boolean}}>("getCustomerRefundClaim", {orderId}),
  async uploadPhotoEvidence(input: {
    orderId: string;
    reason: string;
    file: File;
  }): Promise<{uploadId: string}> {
    const extension = input.file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";
    const reservation = await call<{
      uploadId: string;
      storagePath: string;
    }>("beginCustomerRefundClaimEvidenceUpload", {
      orderId: input.orderId,
      reason: input.reason,
      contentType: input.file.type,
      extension,
      size: input.file.size,
    });

    await uploadBytes(
      ref(storage, reservation.storagePath),
      input.file,
      {
        contentType: input.file.type,
        cacheControl: "private, max-age=0, no-cache",
        customMetadata: {
          customerId: auth.currentUser?.uid || "",
          orderId: input.orderId,
          evidenceUploadId: reservation.uploadId,
          processingType: "refund-claim-evidence",
        },
      },
    );

    return {uploadId: reservation.uploadId};
  },
  create: (input: {orderId: string; reason: string; description: string; evidenceUploadId?: string}) => call<{claimId: string; status: string}>("createCustomerRefundClaim", input),
};
