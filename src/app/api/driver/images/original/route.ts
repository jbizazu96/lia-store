/*
|--------------------------------------------------------------------------
| Driver Original Image Upload API
|--------------------------------------------------------------------------
|
| Driver application images are uploaded through this authenticated server
| route. It verifies the Firebase token and that drivers/{uid} belongs to the
| caller, then writes an original for the resizer Function to process.
|
*/

import {
  NextResponse,
} from "next/server";

import {
  getFirebaseAdminAuth,
  getFirebaseAdminFirestore,
  getFirebaseAdminStorage,
} from "@/lib/firebaseAdmin";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

const driverImageFields = [
  "profile-photo",
  "drivers-license-front",
  "drivers-license-back",
  "vehicle-insurance",
  "vehicle-registration",
] as const;

type DriverImageField = (typeof driverImageFields)[number];

function isDriverImageField(value: string): value is DriverImageField {
  return driverImageFields.includes(value as DriverImageField);
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim() || null
    : null;
}

function fileExtension(file: File): string {
  return file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "image";
}

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);

    if (!token) {
      return NextResponse.json({ error: "Sign in again before uploading an image." }, { status: 401 });
    }

    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(token);
    const formData = await request.formData();
    const driverId = String(formData.get("driverId") ?? "").trim();
    const field = String(formData.get("field") ?? "").trim();
    const file = formData.get("file");

    if (!driverId || !isDriverImageField(field) || !(file instanceof File)) {
      return NextResponse.json({ error: "A valid driver, image type, and image file are required." }, { status: 400 });
    }

    if (!file.type.startsWith("image/") || file.size <= 0 || file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: "Upload an image between 1 byte and 10 MB." }, { status: 400 });
    }

    const driver = await getFirebaseAdminFirestore().collection("drivers").doc(driverId).get();

    if (!driver.exists || driver.data()?.ownerUid !== decodedToken.uid || driverId !== decodedToken.uid) {
      return NextResponse.json({ error: "You can upload images only for your own driver application." }, { status: 403 });
    }

    const imageId = `${Date.now()}-${crypto.randomUUID()}`;
    const originalPath = `drivers/${driverId}/images/originals/${field}/${imageId}.${fileExtension(file)}`;

    await getFirebaseAdminStorage()
      .bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
      .file(originalPath)
      .save(Buffer.from(await file.arrayBuffer()), {
        resumable: false,
        metadata: {
          contentType: file.type,
          cacheControl: "private, max-age=0, no-cache",
          metadata: {
            driverId,
            imageId,
            imageField: field,
            processingType: "driver-image-original",
          },
        },
      });

    return NextResponse.json({ path: originalPath }, { status: 201 });
  } catch (error) {
    console.error("Driver image upload failed:", error);
    return NextResponse.json({ error: "The image could not be uploaded. Please try again." }, { status: 500 });
  }
}
