/*
|--------------------------------------------------------------------------
| Store Upload Claim Service
|--------------------------------------------------------------------------
|
| Storage Rules cannot reliably depend on a Firestore lookup until the
| Storage-to-Firestore Rules integration has been enabled in a project. A
| server-issued custom claim keeps the authorization decision in the signed
| Firebase token instead. The claim is never supplied by the browser.
|
*/

import {
  getAuth,
} from "firebase-admin/auth";

export const STORE_UPLOAD_CLAIM =
  "storeUploadStoreId";

export async function grantStoreUploadClaim(
  ownerId: string,
  storeId: string
): Promise<void> {
  const user = await getAuth().getUser(ownerId);
  const claims = user.customClaims ?? {};

  if (claims[STORE_UPLOAD_CLAIM] === storeId) {
    return;
  }

  await getAuth().setCustomUserClaims(ownerId, {
    ...claims,
    [STORE_UPLOAD_CLAIM]: storeId,
  });
}
