"use client";

/*
  Login form component.
*/

import {motion} from "framer-motion";
import Image from "next/image";
import {Eye, EyeOff, Mail, Lock, ArrowRight} from "lucide-react";
import {useState} from "react";
import {LegalReviewModal} from "@/components/legal/LegalReviewModal";

interface LoginFormProps {
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  loading: boolean;
  error: string;
  showPassword?: boolean;
  onLogin: (e: React.FormEvent) => void;
  onGoogleLogin: () => void;
  onAppleLogin: () => void;
  onForgotPassword: () => void;
  onTogglePassword?: () => void;
}

export function LoginForm({
  email,
  setEmail,
  password,
  setPassword,
  loading,
  error,
  showPassword = false,
  onLogin,
  onGoogleLogin,
  onAppleLogin,
  onForgotPassword,
  onTogglePassword,
}: LoginFormProps) {
  const [reviewingLegalDocument, setReviewingLegalDocument] = useState<"customer_terms" | "customer_privacy" | null>(null);
  return (
    <>
      {/* Logo */}
      <div className="mb-4 flex justify-center">
        <motion.div whileHover={{scale: 1.05}} className="relative h-14 w-14">
          <Image
            src="/icon/icon-512.png"
            alt="LIA Marketplace"
            fill
            sizes="56px"
            className="object-contain"
            priority
          />
        </motion.div>
      </div>

      <motion.h1
        initial={{opacity: 0}}
        animate={{opacity: 1}}
        transition={{delay: 0.2}}
        className="mb-1 text-center text-2xl font-bold text-gray-800"
      >
        Welcome Back
      </motion.h1>
      <p className="mb-5 text-center text-sm text-gray-500">
        Local delivery from independent stores
      </p>

      {error && (
        <motion.p
          initial={{opacity: 0, x: -10}}
          animate={{opacity: 1, x: 0}}
          className="bg-red-50 text-red-500 p-3 rounded-xl mb-4 text-sm"
        >
          {error}
        </motion.p>
      )}

      <form onSubmit={onLogin} className="space-y-3.5">
        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="you@example.com"
              required
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-12 text-sm transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={onTogglePassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Forgot Password */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-xs font-medium text-orange-600 transition hover:text-orange-700 hover:underline"
          >
            Forgot Password?
          </button>
        </div>

        {/* Submit Button */}
        <motion.button
          whileTap={{scale: 0.97}}
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-green-700 py-2.5 text-sm font-semibold text-white transition hover:from-green-700 hover:to-green-800 hover:shadow-lg disabled:opacity-50"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              Sign In <ArrowRight className="w-4 h-4" />
            </>
          )}
        </motion.button>
      </form>

      {/* Divider */}
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-3 text-xs text-gray-500">or continue with</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <motion.button
        type="button"
        whileTap={{scale: 0.97}}
        onClick={onGoogleLogin}
        disabled={loading}
        aria-label="Continue with Google"
        title="Continue with Google"
        className="flex h-11 w-full items-center justify-center rounded-xl border border-gray-200 bg-white transition hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        <span className="sr-only">Continue with Google</span>
        </motion.button>

        <motion.button
        type="button"
        whileTap={{scale: 0.97}}
        onClick={onAppleLogin}
        disabled={loading}
        aria-label="Continue with Apple"
        title="Continue with Apple"
        className="flex h-11 w-full items-center justify-center rounded-xl border border-gray-200 bg-white text-black transition hover:border-orange-300 hover:bg-orange-50 disabled:opacity-50"
      >
        <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.79 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.1ZM12.03 7.25C11.88 5.02 13.69 3.18 15.77 3c.29 2.58-2.34 4.5-3.74 4.25Z" />
        </svg>
        <span className="sr-only">Continue with Apple</span>
        </motion.button>
      </div>

      <p className="mt-4 text-center text-sm text-gray-600">
        Don&apos;t have an account?{" "}
        <a
          href="/register"
          className="text-orange-600 font-semibold hover:underline"
        >
          Create one
        </a>
      </p>
      <p className="mt-3 text-center text-[11px] leading-4 text-gray-500">Customer accounts must agree to the <button type="button" onClick={() => setReviewingLegalDocument("customer_terms")} className="font-semibold text-orange-700 underline underline-offset-2">Customer Terms</button> and acknowledge the <button type="button" onClick={() => setReviewingLegalDocument("customer_privacy")} className="font-semibold text-orange-700 underline underline-offset-2">Privacy Policy</button> once per required version.</p>
      {reviewingLegalDocument ? <LegalReviewModal documents={[{key: "customer_terms", title: "Customer Terms", path: "/legal/customer-terms"}, {key: "customer_privacy", title: "Privacy Policy", path: "/legal/privacy"}]} initialKey={reviewingLegalDocument} decisionRequired={false} onClose={() => setReviewingLegalDocument(null)}/> : null}
    </>
  );
}
