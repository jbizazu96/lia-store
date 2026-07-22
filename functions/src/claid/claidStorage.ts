/*
|--------------------------------------------------------------------------
| Claid Storage Helpers
|--------------------------------------------------------------------------
|
| Creates short-lived signed URLs for original product images.
|
| Claid needs a URL it can download, but the original Storage object should
| remain private and should not receive a permanent public download token.
|
*/

import {
  getStorage,
} from "firebase-admin/storage";

/*
|--------------------------------------------------------------------------
| Signed URL Duration
|--------------------------------------------------------------------------
|
| One hour is more than enough for Claid to accept and download the source
| image while limiting how long the original remains externally accessible.
|
*/

const SIGNED_URL_DURATION_MS =
  60 * 60 * 1000;

/*
|--------------------------------------------------------------------------
| Create Original Image Signed URL
|--------------------------------------------------------------------------
*/

export async function createOriginalImageSignedUrl(
  bucketName: string,
  originalImagePath: string
): Promise<string> {
  if (!bucketName.trim()) {
    throw new Error(
      "A Storage bucket name is required."
    );
  }

  if (!originalImagePath.trim()) {
    throw new Error(
      "An original image path is required."
    );
  }

  const file =
    getStorage()
      .bucket(bucketName)
      .file(originalImagePath);

  const [
    exists,
  ] = await file.exists();

  if (!exists) {
    throw new Error(
      `Original image not found: ${originalImagePath}`
    );
  }

  const expiresAt =
    Date.now() +
    SIGNED_URL_DURATION_MS;

  const [
    signedUrl,
  ] = await file.getSignedUrl({
    action:
      "read",

    expires:
      expiresAt,

    version:
      "v4",
  });

  if (!signedUrl) {
    throw new Error(
      "Failed to create the Claid input URL."
    );
  }

  return signedUrl;
}