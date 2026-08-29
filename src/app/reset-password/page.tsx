"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { confirmPasswordReset } from "firebase/auth";
import {getPasswordPolicyError, PASSWORD_POLICY_DESCRIPTION} from "@/utils/passwordPolicy";

// Inner component that uses useSearchParams
function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const oobCode = searchParams.get("oobCode");

  // Handle the password reset
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const policyError = getPasswordPolicyError(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      await confirmPasswordReset(auth, oobCode!, newPassword);
      setSuccess(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (resetError) {
      const code = typeof resetError === "object" && resetError !== null && "code" in resetError
        ? String(resetError.code)
        : "";
      setError(code.includes("weak-password")
        ? PASSWORD_POLICY_DESCRIPTION
        : "Unable to reset password. The link may be invalid, expired, or already used.");
    } finally {
      setLoading(false);
    }
  };

  if (!oobCode) {
    return (
      <div className="text-center">
        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold">Invalid Reset Link</h2>
        <p className="text-gray-500 mt-2">The password reset link is invalid.</p>
        <button
          onClick={() => router.push("/login")}
          className="mt-4 px-6 py-2 bg-green-600 text-white rounded-xl"
        >
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8"
    >
      <h1 className="text-3xl font-bold text-center text-gray-800 mb-2">
        Reset Password
      </h1>
      <p className="text-center text-gray-500 mb-8">
        Enter your new password below
      </p>

      {success ? (
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800">Password Reset!</h2>
          <p className="text-gray-600 mt-2">Your password has been successfully reset.</p>
          <p className="text-gray-500 text-sm mt-4">Redirecting to login...</p>
        </div>
      ) : (
        <form onSubmit={handleReset} noValidate className="space-y-5">
          {error && (
            <div className="bg-red-50 text-red-500 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500"
              placeholder="8+ characters"
              minLength={8}
              autoComplete="new-password"
              required
            />
            <p className="mt-2 text-xs leading-5 text-gray-500">{PASSWORD_POLICY_DESCRIPTION}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500"
              placeholder="Confirm your password"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-3 rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
            ) : (
              "Reset Password"
            )}
          </button>
        </form>
      )}
    </motion.div>
  );
}

// Main page with Suspense boundary
export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-orange-50 to-green-50">
      <Suspense fallback={
        <div className="flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      }>
        <ResetPasswordContent />
      </Suspense>
    </main>
  );
}
