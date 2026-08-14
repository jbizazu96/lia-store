"use client";

/*
  Password reset modal component.
*/

import {useState} from "react";
import {motion} from "framer-motion";
import {Mail, AlertCircle, CheckCircle} from "lucide-react";
import {authEmailService} from "@/services/auth/authEmailService";

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  // onReset is removed - the modal handles reset internally
}

export function PasswordResetModal({
  isOpen,
  onClose,
}: PasswordResetModalProps) {
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState("");

  // Handle password reset internally
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resetEmail) {
      setResetError("Please enter your email address.");
      return;
    }

    try {
      setResetLoading(true);
      setResetError("");
      setResetSuccess(false);

      await authEmailService.requestPasswordReset(resetEmail);

      setResetSuccess(true);
      setResetEmail("");

      setTimeout(() => {
        onClose();
        setResetSuccess(false);
      }, 3000);
    } catch (err: unknown) {
      console.error("Reset error:", err);
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      setResetError(
        code.includes("resource-exhausted")
          ? "Too many reset requests were made. Please wait before trying again."
          : "Unable to request a reset email. Please try again.",
      );
    } finally {
      setResetLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{opacity: 0, scale: 0.95}}
        animate={{opacity: 1, scale: 1}}
        exit={{opacity: 0, scale: 0.95}}
        className="bg-white rounded-3xl max-w-md w-full p-8 relative"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl"
          aria-label="Close reset modal"
        >
          ×
        </button>

        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Reset Password
        </h2>
        <p className="text-gray-500 mb-6">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>

        {resetSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-green-700 font-semibold">Request received</p>
                <p className="text-green-600 text-sm mt-1">
                  If an account matches that address, LIA will send a secure password reset link.
                </p>
              </div>
            </div>
          </div>
        )}

        {resetError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-red-600">{resetError}</p>
            </div>
          </div>
        )}

        <form onSubmit={handlePasswordReset} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                placeholder="you@example.com"
                required
                disabled={resetSuccess}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition"
              disabled={resetLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={resetLoading || resetSuccess}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl font-semibold hover:shadow-lg hover:from-green-700 hover:to-green-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {resetLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                "Send Reset Link"
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
