"use client";

/*
  Danger zone - Delete account and other destructive actions.
*/

import {useState} from "react";
import {useRouter} from "next/navigation";
import {motion} from "framer-motion";
import {
  AlertTriangle,
  Trash2,
  X,
  AlertCircle,
  Lock,
} from "lucide-react";
import {deleteUser, reauthenticateWithCredential, EmailAuthProvider, signOut} from "firebase/auth";
import {deleteDoc, doc} from "firebase/firestore";
import {auth, db} from "@/lib/firebase";

export function DangerSection() {
  const router = useRouter();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [step, setStep] = useState<"confirm" | "password">("confirm");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDeleteAccount = async () => {
    try {
      setLoading(true);
      setError("");

      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error("No user logged in");
      }

      // Re-authenticate
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);

      // Delete store data
      await deleteDoc(doc(db, "stores", user.uid));
      
      // Delete user data
      await deleteDoc(doc(db, "users", user.uid));

      // Delete Auth account
      await deleteUser(user);

      // Sign out and redirect
      await signOut(auth);
      router.push("/");

    } catch (error: any) {
      console.error("Error deleting account:", error);
      if (error.code === "auth/wrong-password") {
        setError("Incorrect password. Please try again.");
      } else if (error.code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError("Failed to delete account. Please try again.");
      }
      setStep("password");
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
            Permanently delete your store and account
          </p>
          <p className="text-red-600 text-xs mb-4">
            This action cannot be undone. All your products, orders, and data will be permanently removed.
          </p>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition flex items-center gap-2"
            aria-label="Delete store and account permanently"
          >
            <Trash2 className="w-4 h-4" />
            Delete Store & Account
          </button>
        </div>
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

            {step === "confirm" ? (
              <>
                <p className="text-gray-600 text-sm mb-6">
                  Are you sure you want to permanently delete your store and account? 
                  This action cannot be undone. All your data will be lost.
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
                    onClick={() => setStep("password")}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition"
                    aria-label="Continue to account deletion"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-600 text-sm mb-4">
                  Enter your password to confirm account deletion.
                </p>
                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-4">
                    {error}
                  </div>
                )}
                <div className="relative mb-4">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500"
                    disabled={loading}
                    aria-label="Enter your password to confirm deletion"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep("confirm")}
                    className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition"
                    disabled={loading}
                    aria-label="Go back"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={loading || !password}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition disabled:opacity-50"
                    aria-label="Permanently delete account"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                    ) : (
                      "Delete Forever"
                    )}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </>
  );
}