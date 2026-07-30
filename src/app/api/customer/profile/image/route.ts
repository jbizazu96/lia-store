/*
|--------------------------------------------------------------------------
| Customer Profile Image Upload API
|--------------------------------------------------------------------------
|
| The browser sends an image only after Firebase token verification. This
| route writes the original privately; the Cloud Function resizes it and
| later updates the safe profile-image URL.
|
*/

import {
  NextResponse,
} from "next/server";

import {
  FieldValue,
} from "firebase-admin/firestore";

import {
  getFirebaseAdminAuth,
  getFirebaseAdminStorage,
} from "@/lib/firebaseAdmin";
import {
  CustomerProfileAuthorizationError,
  requireCustomerProfileOwner,
} from "@/services/user/serverCustomerProfileAuthorizationService";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const supportedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim() || null
    : null;
}

function fileExtension(file: File): string {
  const extension = file.name
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return extension || "image";
}

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);

    if (!token) {
      throw new CustomerProfileAuthorizationError(
        "Sign in again before uploading a profile photo."
      );
    }

    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(token, true);
    const { userId, userReference } =
      await requireCustomerProfileOwner(decodedToken.uid);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Select a profile image to upload." },
        { status: 400 }
      );
    }

    if (
      !supportedImageTypes.has(file.type) ||
      file.size <= 0 ||
      file.size > MAX_IMAGE_SIZE_BYTES
    ) {
      return NextResponse.json(
        { error: "Upload a JPG, PNG, WebP, or AVIF image up to 10 MB." },
        { status: 400 }
      );
    }

    const imageId = `${Date.now()}-${crypto.randomUUID()}`;
    const originalPath =
      `users/${userId}/images/originals/profile/` +
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
            userId,
            imageId,
            processingType: "customer-profile-image-original",
          },
        },
      });

    await userReference.update({
      profileImageStatus: "processing",
      profileImageError: null,
      profileImageOriginalPath: originalPath,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof CustomerProfileAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Customer profile image upload failed:", error);

    return NextResponse.json(
      { error: "The profile image could not be uploaded. Please try again." },
      { status: 500 }
    );
  }
}
