import {getFirestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FieldValue} from "firebase-admin/firestore";

const RESTRICTED_STATES = new Set(["deletion_pending", "deletion_processing"]);

export async function isAccountDeletionRestricted(uid: string): Promise<boolean> {
  const user = await getFirestore("default").collection("users").doc(uid).get();
  return RESTRICTED_STATES.has(user.data()?.accountDeletionState);
}

export async function requireAccountOperational(uid: string): Promise<void> {
  if (await isAccountDeletionRestricted(uid)) {
    throw new HttpsError(
      "failed-precondition",
      "This account cannot start new activity while account deletion is pending."
    );
  }
}

export async function restoreAccountDeletionAccess(ownerId: string): Promise<void> {
  const db = getFirestore("default");
  const batch = db.batch();
  batch.set(db.collection("users").doc(ownerId), {
    accountDeletionState: null,
    accountDeletionRequestId: null,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  await batch.commit();
}
