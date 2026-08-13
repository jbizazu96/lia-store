"use client";

import {useState} from "react";
import {motion} from "framer-motion";
import {X, Trash2} from "lucide-react";
import {
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import {auth} from "@/lib/firebase";
import {
  customerProfileClientService,
} from "@/services/user/customerProfileClientService";
import { googleAuthenticationService } from "@/services/auth/googleAuthenticationService";
import {appleAuthenticationService} from "@/services/auth/appleAuthenticationService";
import {customerLogoutService} from "@/services/auth/customerLogoutService";

interface DeleteAccountModalProps {
  onClose: () => void;
}

export function DeleteAccountModal({onClose}: DeleteAccountModalProps) {
  const [step, setStep] = useState<"confirm" | "password">("confirm");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const usesPasswordProvider = auth.currentUser?.providerData.some(
    (provider) => provider.providerId === "password"
  ) ?? true;
  const usesAppleProvider = auth.currentUser?.providerData.some(
    (provider) => provider.providerId === "apple.com"
  ) ?? false;

  async function handleDeleteAccount() {
    try {
      setLoading(true);
      setError("");

      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error("No user logged in");
      }

      if (usesPasswordProvider) {
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
      } else if (usesAppleProvider) {
        await appleAuthenticationService.reauthenticate(user);
      } else {
        await googleAuthenticationService.reauthenticate(user);
      }

      /*
       * Reauthentication proves the customer intentionally submitted this
       * sensitive request. The callable creates an admin-reviewed request;
       * it does not remove the customer profile or Firebase Auth account.
       */
      await customerProfileClientService.requestAccountDeletion();

      setPassword("");
      await customerLogoutService.logout();
      window.location.assign("/login?accountDeletion=review");

    } catch (error: unknown) {
      console.error("Error deleting account:", error);
      const code = error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";

      if (code === "auth/wrong-password") {
        setError("Incorrect password. Please try again.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError("Unable to submit the deletion request. Please try again.");
      }
      
      setStep("password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{opacity: 0, scale: 0.95}}
        animate={{opacity: 1, scale: 1}}
        exit={{opacity: 0, scale: 0.95}}
        className="bg-white rounded-3xl max-w-sm w-full p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">Delete Account</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition"
            aria-label="Close delete account"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {step === "confirm" ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8 text-red-600" />
            </div>
            
            <p className="text-gray-600 text-sm mb-6">
              Submitting this request immediately locks your account while an
              administrator reviews it. If approved, your account and data will
              be permanently deleted after the grace period.
            </p>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-full border border-gray-200 py-3 font-medium text-gray-600 transition hover:bg-gray-50"
                aria-label="Cancel account deletion"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep("password")}
                className="flex-1 rounded-full bg-red-600 py-3 font-semibold text-white transition hover:bg-red-700"
                aria-label="Continue to account deletion"
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-gray-600 text-sm mb-4">
              {usesPasswordProvider
                ? "Enter your password to confirm account deletion."
                : "Continue with Google to confirm account deletion."}
            </p>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-4">
                {error}
              </div>
            )}

            {usesPasswordProvider && (
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 mb-4"
                disabled={loading}
                aria-label="Enter your password to confirm"
              />
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep("confirm")}
                className="flex-1 rounded-full border border-gray-200 py-3 font-medium text-gray-600 transition hover:bg-gray-50"
                disabled={loading}
                aria-label="Go back"
              >
                Back
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={loading || (usesPasswordProvider && !password)}
                className="flex-1 rounded-full bg-red-600 py-3 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                aria-label="Submit account deletion request"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                ) : (
                  usesPasswordProvider ? "Submit Request" : "Continue with Google"
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
