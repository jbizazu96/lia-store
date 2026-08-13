import {beforeAuthStateChanged, signOut} from "firebase/auth";
import {auth} from "@/lib/firebase";
import {firebaseMessaging} from "@/services/notification/firebaseMessaging";
import {reportClientIssue} from "@/services/monitoring/clientErrorReporter";

let cleanupInFlight: Promise<void> | null = null;
let lastCleanedUserId = "";
let lastCleanedAt = 0;
const CLEANUP_ATTEMPT_TIMEOUT_MS = 2_500;

async function deactivateWithTimeout(): Promise<void> {
  await Promise.race([
    firebaseMessaging.deactivateCurrentDeviceRegistration(),
    new Promise<never>((_resolve, reject) => {
      window.setTimeout(
        () => reject(new Error("Notification cleanup timed out.")),
        CLEANUP_ATTEMPT_TIMEOUT_MS,
      );
    }),
  ]);
}

async function cleanupCurrentRegistration(): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) return;
  if (userId === lastCleanedUserId && Date.now() - lastCleanedAt < 5_000) return;
  if (cleanupInFlight) return cleanupInFlight;

  cleanupInFlight = (async () => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await deactivateWithTimeout();
        window.localStorage.removeItem(`lia.notification-cleanup-pending:${userId}`);
        lastCleanedUserId = userId;
        lastCleanedAt = Date.now();
        return;
      } catch (error) {
        lastError = error;
      }
    }

    window.localStorage.setItem(
      `lia.notification-cleanup-pending:${userId}`,
      String(Date.now()),
    );
    reportClientIssue({
      area: "notifications.logout_cleanup",
      message: "Notification registration could not be deactivated during logout",
      error: lastError,
    });
  })().finally(() => {
    cleanupInFlight = null;
  });

  return cleanupInFlight;
}

export const customerLogoutService = {
  async logout(): Promise<void> {
    await cleanupCurrentRegistration();
    await signOut(auth);
  },

  installSessionCleanup(): () => void {
    return beforeAuthStateChanged(auth, async (nextUser) => {
      if (nextUser === null && auth.currentUser) {
        // Cleanup handles and records its own failure, so it never prevents
        // Firebase from completing a requested or forced sign-out.
        await cleanupCurrentRegistration();
      }
    });
  },
};
