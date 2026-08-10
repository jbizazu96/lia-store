"use client";

/*
  Danger zone - Delete account and other destructive actions.
*/

import {useState} from "react";
import {motion} from "framer-motion";
import {
  AlertTriangle,
  Trash2,
  X,
  AlertCircle,
} from "lucide-react";
import {
  httpsCallable,
} from "firebase/functions";
import {signOut} from "firebase/auth";
import {
  auth,
  functions,
} from "@/lib/firebase";

export function DangerSection() {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDeleteAccount = async () => {
    try {
      setLoading(true);
      setError("");

      if (!auth.currentUser) {
        throw new Error("No user logged in");
      }

      /*
       * Account deletion is never performed in the browser. The backend
       * creates an admin-reviewed request and later runs the deletion engine.
       */
      const requestDeletion = httpsCallable(
        functions,
        "requestAccountDeletion"
      );

      await requestDeletion({
        ownerType: "store",
        reasonCode: "no_longer_needed",
        reasonDetails: null,
      });

      await signOut(auth);
      window.location.assign("/login?accountDeletion=review");

      setShowDeleteModal(false);
      setError(
        "Your deletion request was sent for administrator review."
      );

    } catch (error: unknown) {
      console.error("Error requesting account deletion:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to request account deletion. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-red-200">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h3 className="font-bold text-red-700">Danger Zone</h3>
        </div>

        <div className="bg-red-50 rounded-xl p-4 border border-red-200">
          <p className="text-red-700 text-sm font-medium mb-2">
            Request store and account deletion
          </p>
          <p className="text-red-600 text-xs mb-4">
            An administrator must review the request before permanent deletion begins.
          </p>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition flex items-center gap-2"
            aria-label="Delete store and account permanently"
          >
            <Trash2 className="w-4 h-4" />
            Request deletion
          </button>
        </div>
        {error && !showDeleteModal && (
          <p className="mt-3 text-sm text-green-700">
            {error}
          </p>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{opacity: 0, scale: 0.95}}
            animate={{opacity: 1, scale: 1}}
            className="bg-white rounded-3xl max-w-md w-full p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-800">Delete Account</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition"
                aria-label="Close delete confirmation"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <>
                <p className="text-gray-600 text-sm mb-6">
                  Request deletion of your store and account? An administrator
                  will review this before any data is permanently removed.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition"
                    aria-label="Cancel account deletion"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition"
                    aria-label="Continue to account deletion"
                  >
                    {loading ? "Sending request..." : "Request deletion"}
                  </button>
                </div>
            </>
          </motion.div>
        </div>
      )}
    </>
  );
}
