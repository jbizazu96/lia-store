/*
|--------------------------------------------------------------------------
| Customer delivery proof
|--------------------------------------------------------------------------
|
| Delivery proof is copied from Shipday into private LIA Storage by the
| delivery sync. This callable verifies ownership and returns short-lived
| URLs only for the customer who placed the completed order.
|
*/

import * as admin from "firebase-admin";
import {
  getFirestore,
} from "firebase-admin/firestore";
import {
  getStorage,
} from "firebase-admin/storage";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");
const SIGNED_URL_DURATION_MS = 10 * 60 * 1000;

function text(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function record(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function proofPath(
  orderId: string,
  value: unknown,
): string | null {
  const path = text(
    record(value).storagePath,
  );
  const expectedPrefix =
    `orders/${orderId}/delivery-proof/`;

  return path.startsWith(expectedPrefix)
    ? path
    : null;
}

async function signedProofUrl(
  path: string,
): Promise<string | null> {
  const file = getStorage()
    .bucket()
    .file(path);
  const [exists] = await file.exists();

  if (!exists) {
    return null;
  }

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + SIGNED_URL_DURATION_MS,
    version: "v4",
  });

  return url || null;
}

export const getCustomerDeliveryProof = onCall(
  {region: "us-central1"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to view delivery proof.",
      );
    }

    const orderId = text(
      record(request.data).orderId,
    );

    if (
      !orderId ||
      orderId.includes("/") ||
      orderId.includes("\\")
    ) {
      throw new HttpsError(
        "invalid-argument",
        "A valid order is required.",
      );
    }

    const [customer, order] = await Promise.all([
      db.collection("users").doc(request.auth.uid).get(),
      db.collection("orders").doc(orderId).get(),
    ]);
    const orderData = order.data() ?? {};
    const orderCustomer = record(
      orderData.customer,
    );

    if (
      !customer.exists ||
      customer.data()?.accountType !== "customer" ||
      customer.data()?.isActive === false ||
      !order.exists ||
      text(orderCustomer.uid) !== request.auth.uid ||
      orderData.checkoutStatus !== "confirmed" ||
      orderData.status !== "completed"
    ) {
      throw new HttpsError(
        "permission-denied",
        "You are not authorized to view this delivery proof.",
      );
    }

    const proof = record(
      record(orderData.delivery).proofOfDelivery,
    );
    const signaturePath = proofPath(
      orderId,
      proof.signature,
    );
    const imagePaths = Array.isArray(proof.images)
      ? proof.images
        .map((image) => proofPath(orderId, image))
        .filter((path): path is string => Boolean(path))
      : [];

    if (!signaturePath && imagePaths.length === 0) {
      return {
        proof: null,
      };
    }

    const [signatureUrl, imageUrls] = await Promise.all([
      signaturePath
        ? signedProofUrl(signaturePath)
        : Promise.resolve(null),
      Promise.all(imagePaths.map(signedProofUrl)),
    ]);

    return {
      proof: {
        signatureUrl,
        imageUrls: imageUrls.filter(
          (url): url is string => Boolean(url),
        ),
      },
    };
  },
);
