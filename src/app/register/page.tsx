"use client";

/*
  React hooks.
*/
import {useEffect, useState} from "react";

/*
  Next.js navigation.
*/
import {useRouter} from "next/navigation";
import {formatPhoneNumber} from "@/utils/phone";
import Image from "next/image";
import {motion} from "framer-motion";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  Phone,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Store,
  User as UserIcon,
  CarFront,
} from "lucide-react";

/*
  Registration service.
*/
import {
  registrationService,
  type RegistrationAccountType,
} from "@/services/user/registrationService";
import {LegalReviewModal} from "@/components/legal/LegalReviewModal";
import {getPasswordPolicyError, PASSWORD_POLICY_DESCRIPTION} from "@/utils/passwordPolicy";
import {Capacitor} from "@capacitor/core";
import {BrandedLoader} from "@/components/ui/BrandedLoader";

export default function RegisterPage() {
  const router = useRouter();

  /*
    Step 1: Account Type Selection
  */
  const [step, setStep] = useState<"select" | "form">("select");
  const [accountType, setAccountType] = useState<RegistrationAccountType | null>(null);
  const [nativeCustomerRegistration, setNativeCustomerRegistration] = useState<boolean | null>(null);

  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    // Resolve the platform after hydration so server and client markup agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNativeCustomerRegistration(native);
    if (native) {
      setAccountType("customer");
      setStep("form");
    }
  }, []);

  /*
    Form fields.
  */
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [customerTermsAccepted, setCustomerTermsAccepted] = useState(false);
  const [customerPrivacyAcknowledged, setCustomerPrivacyAcknowledged] = useState(false);
  const [reviewingLegalDocument, setReviewingLegalDocument] = useState<"customer_terms" | "customer_privacy" | null>(null);

  /*
    UI state.
  */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  }

  function isValidEmail(email: string) {
    return email.trim().includes("@");
  }

  function validateForm() {
    if (!fullName.trim()) {
      setError("Full name is required");
      return false;
    }
    if (!email.trim()) {
      setError("Email is required");
      return false;
    }
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address with @");
      return false;
    }
    if (!phone.trim()) {
      setError("Phone number is required");
      return false;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Please enter a complete phone number");
      return false;
    }
    if (!password) {
      setError("Password is required");
      return false;
    }
    const passwordPolicyError = getPasswordPolicyError(password);
    if (passwordPolicyError) {
      setError(passwordPolicyError);
      return false;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }
    if (accountType === "customer" && (!customerTermsAccepted || !customerPrivacyAcknowledged)) {
      setError("Review the Customer Terms and Privacy Policy to continue.");
      return false;
    }
    return true;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess(false);

      const selectedAccountType = nativeCustomerRegistration ? "customer" : accountType;
      if (!selectedAccountType) {
        setError("Choose an account type before registering.");
        return;
      }

      await registrationService.register({
        fullName,
        email,
        phone,
        password,
        accountType: selectedAccountType,
        customerTermsAccepted,
        customerPrivacyAcknowledged,
      });

      setSuccess(true);
      setError("");

      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        if (err.message.includes("email-already-in-use")) {
          setError("This email is already registered. Please login instead.");
        } else {
          setError("Unable to create account. Please try again.");
        }
      } else {
        setError("Unable to create account. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (nativeCustomerRegistration === null) {
    return <BrandedLoader message="Preparing registration" />;
  }

  /*
    Step 1: Account Type Selection Screen
  */
  if (step === "select") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-orange-50 to-green-50">
        <motion.div
          initial={{opacity: 0, y: 20}}
          animate={{opacity: 1, y: 0}}
          transition={{duration: 0.5}}
          className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8"
        >
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <motion.div whileHover={{scale: 1.05}} className="relative w-20 h-20">
              <Image
                src="/icon/icon-512.png"
                alt="LIA"
                fill
                sizes="80px"
                className="object-contain"
                priority
              />
            </motion.div>
          </div>

          <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">
            Create Your Account
          </h1>
          <p className="text-center text-gray-500 mb-8">
            How will you use LIA?
          </p>

          <div className="space-y-4">
            {/* Customer Option */}
            <motion.button
              whileTap={{scale: 0.97}}
              onClick={() => {
                setAccountType("customer");
                setStep("form");
              }}
              className="w-full p-6 border-2 border-gray-200 rounded-2xl hover:border-green-500 hover:bg-green-50 transition-all group text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200 transition">
                  <UserIcon className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Customer</h3>
                  <p className="text-sm text-gray-500">
                    Shop independent local stores and get delivery
                  </p>
                </div>
              </div>
            </motion.button>

            {/* Driver Option */}
            <motion.button
              whileTap={{scale: 0.97}}
              onClick={() => {
                setAccountType("driver");
                setStep("form");
              }}
              className="w-full p-6 border-2 border-gray-200 rounded-2xl hover:border-blue-500 hover:bg-blue-50 transition-all group text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition">
                  <CarFront className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Driver</h3>
                  <p className="text-sm text-gray-500">
                    Deliver orders for local stores
                  </p>
                </div>
              </div>
            </motion.button>

            {/* Store Owner Option */}
            <motion.button
              whileTap={{scale: 0.97}}
              onClick={() => {
                setAccountType("store_owner");
                setStep("form");
              }}
              className="w-full p-6 border-2 border-gray-200 rounded-2xl hover:border-orange-500 hover:bg-orange-50 transition-all group text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center group-hover:bg-orange-200 transition">
                  <Store className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">Store Owner</h3>
                  <p className="text-sm text-gray-500">
                    Reach local customers without big-platform commissions
                  </p>
                </div>
              </div>
            </motion.button>

            <p className="text-center text-sm text-gray-600 mt-4">
              Already a member?{" "}
              <a href="/login" className="text-orange-600 font-semibold hover:underline">
                Back to Login
              </a>
            </p>
          </div>
        </motion.div>
      </main>
    );
  }

  /*
    Step 2: Registration Form
  */
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-orange-50 to-green-50">
      <motion.div
        initial={{opacity: 0, y: 20}}
        animate={{opacity: 1, y: 0}}
        transition={{duration: 0.5}}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8"
      >
        {/* Back Button */}
        <button
          onClick={() => nativeCustomerRegistration ? router.replace("/login") : setStep("select")}
          className="mb-4 text-gray-500 hover:text-gray-700 transition"
        >
          ← {nativeCustomerRegistration ? "Back to sign in" : "Back"}
        </button>

        <div className="flex justify-center mb-6">
          <div className="relative w-20 h-20">
            <Image
              src="/icon/icon-512.png"
              alt="LIA"
              fill
              sizes="80px"
              className="object-contain"
            />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">
          {accountType === "customer"
            ? "Customer Registration"
            : accountType === "store_owner"
              ? "Store Owner Registration"
              : "Driver Registration"}
        </h1>
        <p className="text-center text-gray-500 mb-8">
          Create your {accountType === "customer"
            ? "shopping"
            : accountType === "store_owner"
              ? "store"
              : "driver"} account
        </p>

        {/* Success Message */}
        {success && (
          <motion.div
            initial={{opacity: 0, scale: 0.95}}
            animate={{opacity: 1, scale: 1}}
            className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6"
          >
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-green-700 font-semibold">Verification email sent!</p>
                <p className="text-green-600 text-sm mt-1">
                  Please check your email and verify your account. Redirecting to login...
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Error Message */}
        {error && !success && (
          <motion.div
            initial={{opacity: 0, x: -10}}
            animate={{opacity: 1, x: 0}}
            className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-red-600">{error}</p>
            </div>
          </motion.div>
        )}

        <form onSubmit={handleRegister} noValidate className="space-y-5">
          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                placeholder="John Doe"
                required
                disabled={success}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                placeholder="you@example.com"
                required
                disabled={success}
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                placeholder="(000) 000 - 0000"
                required
                disabled={success}
                maxLength={18}
                inputMode="numeric"
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
                className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                placeholder="8+ characters"
                required
                disabled={success}
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                disabled={success}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-gray-500">{PASSWORD_POLICY_DESCRIPTION}</p>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                placeholder="Confirm your password"
                required
                disabled={success}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                disabled={success}
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          {accountType === "customer" ? <label className="flex cursor-pointer gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700"><input type="checkbox" checked={customerTermsAccepted && customerPrivacyAcknowledged} onChange={(event) => { setCustomerTermsAccepted(event.target.checked); setCustomerPrivacyAcknowledged(event.target.checked); }} disabled={success} className="mt-1 h-4 w-4 shrink-0 accent-green-600" /><span>I agree to the <button type="button" onClick={(event) => { event.preventDefault(); setReviewingLegalDocument("customer_terms"); }} className="font-bold text-orange-700 underline underline-offset-2">LIA Terms of Service</button> and acknowledge that I have read the <button type="button" onClick={(event) => { event.preventDefault(); setReviewingLegalDocument("customer_privacy"); }} className="font-bold text-orange-700 underline underline-offset-2">LIA Privacy Policy</button>.</span></label> : null}

          {/* Submit Button */}
          <motion.button
            whileTap={{scale: 0.97}}
            type="submit"
            disabled={loading || success}
            className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-3 rounded-xl font-semibold hover:shadow-lg hover:from-green-700 hover:to-green-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : success ? (
              <>
                Verified <CheckCircle className="w-4 h-4" />
              </>
            ) : (
              <>
                Verify Email <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Already a member?{" "}
          <a href="/login" className="text-orange-600 font-semibold hover:underline">
            Back to Login
          </a>
        </p>
      </motion.div>
      {reviewingLegalDocument ? <LegalReviewModal documents={[{key: "customer_terms", title: "Customer Terms", path: "/legal/customer-terms"}, {key: "customer_privacy", title: "Privacy Policy", path: "/legal/privacy"}]} initialKey={reviewingLegalDocument} onReviewed={(key) => { if (key === "customer_terms") setCustomerTermsAccepted(true); if (key === "customer_privacy") setCustomerPrivacyAcknowledged(true); }} onDeclined={(key) => { if (key === "customer_terms") setCustomerTermsAccepted(false); if (key === "customer_privacy") setCustomerPrivacyAcknowledged(false); }} onClose={() => setReviewingLegalDocument(null)}/> : null}
    </main>
  );
}
