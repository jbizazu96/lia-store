/*
|--------------------------------------------------------------------------
| Store Original Image Upload API
|--------------------------------------------------------------------------
|
| Onboarding images are uploaded through this authenticated route instead
| of directly from the browser to Storage. The route verifies the Firebase
| ID token and store ownership before the Admin SDK writes the original.
|
| The existing processStoreImage Storage Function then resizes the image
| and updates the appropriate store document field.
|
*/

import { NextResponse } from "next/server";
import {
  FieldValue,
} from "firebase-admin/firestore";

import {
  getFirebaseAdminAuth,
  getFirebaseAdminFirestore,
  getFirebaseAdminStorage,
} from "@/lib/firebaseAdmin";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

const storeImageFields = [
  "logo",
  "banner",
  "owner-photo-id",
  "front",
  "inside",
] as const;

type StoreImageField = (typeof storeImageFields)[number];

const imageReviewFields: Record<
  StoreImageField,
  {
    reviewField: string;
    submissionVersionField: string;
  }
> = {
  logo: {
    reviewField: "logoReview",
    submissionVersionField: "logoSubmissionVersion",
  },
  banner: {
    reviewField: "bannerReview",
    submissionVersionField: "bannerSubmissionVersion",
  },
  "owner-photo-id": {
    reviewField: "owner.photoIdReview",
    submissionVersionField: "owner.photoIdSubmissionVersion",
  },
  front: {
    reviewField: "storeFrontReview",
    submissionVersionField: "storeFrontSubmissionVersion",
  },
  inside: {
    reviewField: "storeInsideReview",
    submissionVersionField: "storeInsideSubmissionVersion",
  },
};

function pendingDocumentReview() {
  return {
    reviewStatus: "pending",
    rejectionReason: null,
    reviewedAt: null,
    reviewedBy: null,
  };
}

function isStoreImageField(value: string): value is StoreImageField {
  return storeImageFields.includes(value as StoreImageField);
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}

function fileExtension(file: File): string {
  const suppliedExtension = file.name
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return suppliedExtension || "image";
}

export async function POST(request: Request) {
  try {
    const idToken = getBearerToken(request);

    if (!idToken) {
      return NextResponse.json(
        { error: "Sign in again before uploading an image." },
        { status: 401 }
      );
    }

    const decodedToken =
      await getFirebaseAdminAuth().verifyIdToken(idToken);

    const formData = await request.formData();
    const storeId = String(formData.get("storeId") ?? "").trim();
    const field = String(formData.get("field") ?? "").trim();
    const file = formData.get("file");

    if (!storeId || !isStoreImageField(field) || !(file instanceof File)) {
      return NextResponse.json(
        { error: "A valid store, image type, and image file are required." },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/") || file.size <= 0 || file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Upload an image between 1 byte and 10 MB." },
        { status: 400 }
      );
    }

    const storeSnapshot = await getFirebaseAdminFirestore()
      .collection("stores")
      .doc(storeId)
      .get();

    if (!storeSnapshot.exists || storeSnapshot.data()?.ownerId !== decodedToken.uid) {
      return NextResponse.json(
        { error: "You can upload images only for your own store." },
        { status: 403 }
      );
    }

    const imageId = `${Date.now()}-${crypto.randomUUID()}`;
    const originalPath =
      `stores/${storeId}/images/originals/${field}/` +
      `${imageId}.${fileExtension(file)}`;

    await getFirebaseAdminStorage()
      .bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
      .file(originalPath)
      .save(Buffer.from(await file.arrayBuffer()), {
        resumable: false,
        metadata: {
          contentType: file.type,
          cacheControl: "private, max-age=0, no-cache",
          metadata: {
            storeId,
            imageId,
            imageField: field,
            processingType: "store-image-original",
          },
        },
      });

    /*
     * Image processing and administrative review are separate states. Every
     * accepted replacement starts a fresh pending review, whether it was
     * uploaded during onboarding or later from Store Settings.
     */
    const firestore = getFirebaseAdminFirestore();
    const storeReference = firestore.collection("stores").doc(storeId);
    const reviewFields = imageReviewFields[field];

    await firestore.runTransaction(async (transaction) => {
      const currentStore = await transaction.get(storeReference);

      if (!currentStore.exists || currentStore.data()?.ownerId !== decodedToken.uid) {
        throw new Error("The store is no longer available for this upload.");
      }

      const currentSubmissionVersion = currentStore.get(
        reviewFields.submissionVersionField
      );
      const submissionVersion =
        typeof currentSubmissionVersion === "number"
          ? currentSubmissionVersion + 1
          : 1;

      transaction.update(storeReference, {
        [reviewFields.reviewField]: pendingDocumentReview(),
        [reviewFields.submissionVersionField]: submissionVersion,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ path: originalPath }, { status: 201 });
  } catch (error) {
    console.error("Store image upload failed:", error);

    return NextResponse.json(
      { error: "The image could not be uploaded. Please try again." },
      { status: 500 }
    );
  }
}
