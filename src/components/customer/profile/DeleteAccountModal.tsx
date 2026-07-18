"use client";

import {useState} from "react";
import {motion} from "framer-motion";
import {X, Trash2} from "lucide-react";
import {useRouter} from "next/navigation";
import {deleteUser, reauthenticateWithCredential, EmailAuthProvider} from "firebase/auth";
import {deleteDoc, doc} from "firebase/firestore";
import {auth, db} from "@/lib/firebase";

interface DeleteAccountModalProps {
  onClose: () => void;
}

export function DeleteAccountModal({onClose}: DeleteAccountModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<"confirm" | "password">("confirm");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDeleteAccount() {
    try {
      setLoading(true);
      setError("");

      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error("No user logged in");
      }

      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);

      await deleteDoc(doc(db, "users", user.uid));
      await deleteUser(user);

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
              Are you sure you want to permanently delete your account? 
              This action cannot be undone and all your data will be lost.
            </p>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition"
                aria-label="Cancel account deletion"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep("password")}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition"
                aria-label="Continue to account deletion"
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-gray-600 text-sm mb-4">
              Enter your password to confirm account deletion.
            </p>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-4">
                {error}
              </div>
            )}

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 mb-4"
              disabled={loading}
              aria-label="Enter your password to confirm"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setStep("confirm")}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition"
                disabled={loading}
                aria-label="Go back"
              >
                Back
              </button>
              <button
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
          </div>
        )}
      </motion.div>
    </div>
  );
}