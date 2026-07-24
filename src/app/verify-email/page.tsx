"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

/*
  Firebase Authentication.
*/
import {
  applyActionCode,
  checkActionCode,
} from "firebase/auth";

/*
  Firestore functions.
*/
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

// Inner component that uses useSearchParams
function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [verifying, setVerifying] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function verifyEmail() {
      try {
        const oobCode = searchParams.get("oobCode");
        
        if (!oobCode) {
          setError("No verification code found.");
          setVerifying(false);
          return;
        }

        // Step 1: Get the email from the verification code
        const { data } = await checkActionCode(auth, oobCode);
        const email = data.email;

        // Step 2: Apply the verification (this updates Firebase Auth)
        await applyActionCode(auth, oobCode);

        // Step 3: Update only the currently authenticated user's profile.
        // Never query the users collection by email from the browser: users
        // must not be able to discover or update someone else's profile.
        const currentUser = auth.currentUser;
        if (currentUser) {
          // Update using current user's UID
          await updateDoc(doc(db, "users", currentUser.uid), {
            emailVerified: true,
            emailVerifiedAt: new Date().toISOString(),
          });
          console.log("✅ Firestore updated for current user");
        } else {
          console.log(
            "Email verified in Firebase Auth. The profile will sync after sign-in."
          );
        }

        setSuccess(true);
        setVerifying(false);

        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push("/login");
        }, 3000);
        
      } catch (err) {
        console.error("Verification error:", err);
        setError("Invalid or expired verification link.");
        setVerifying(false);
      }
    }

    verifyEmail();
  }, [searchParams, router]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 text-center"
    >
      <div className="flex justify-center mb-6">
        <div className="relative w-20 h-20">
          <Image
            src="/logo.png"
            alt="LIA"
            fill
            className="object-contain"
          />
        </div>
      </div>

      {verifying ? (
        <>
          <Loader2 className="w-16 h-16 text-orange-500 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800">Verifying Email</h2>
          <p className="text-gray-500 mt-2">Please wait while we verify your email...</p>
        </>
      ) : success ? (
        <>
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800">Email Verified! 🎉</h2>
          <p className="text-gray-600 mt-2">Your email has been successfully verified.</p>
          <p className="text-gray-500 text-sm mt-4">Redirecting to login...</p>
        </>
      ) : (
        <>
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800">Verification Failed</h2>
          <p className="text-red-600 mt-2">{error}</p>
          <button
            onClick={() => router.push("/login")}
            className="mt-6 px-6 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:shadow-lg transition"
          >
            Back to Login
          </button>
        </>
      )}
    </motion.div>
  );
}

// Loading component for Suspense fallback
function VerifyEmailLoading() {
  return (
    <div className="flex items-center justify-center">
      <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
    </div>
  );
}

// Main page with Suspense boundary
export default function VerifyEmailPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-orange-50 to-green-50">
      <Suspense fallback={<VerifyEmailLoading />}>
        <VerifyEmailContent />
      </Suspense>
    </main>
  );
}
