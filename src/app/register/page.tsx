"use client";

/*
  React hooks.
*/
import {useState} from "react";

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
  User as UserIcon
} from "lucide-react";

/*
  Firebase Authentication function.
*/
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";

/*
  Firestore functions.
*/
import {
  doc,
  setDoc,
} from "firebase/firestore";

/*
  Firebase configuration.
*/
import {
  auth,
  db,
} from "@/lib/firebase";

export default function RegisterPage() {
  const router = useRouter();

  /*
    Step 1: Account Type Selection
  */
  const [step, setStep] = useState<"select" | "form">("select");
  const [accountType, setAccountType] = useState<"customer" | "store_owner" | null>(null);

  /*
    Form fields.
  */
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
    return email.includes("@");
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
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return false;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
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

      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const user = result.user;

      await sendEmailVerification(user);

      /*
        Create Firestore document with accountType
      */
      await setDoc(
        doc(db, "users", user.uid),
        {
          uid: user.uid,
          displayName: fullName,
          email: user.email,
          phone: phone,
          accountType: accountType, // "customer" or "store_owner"
          role: "customer", // Both start as "customer" role
          isActive: true,
          emailVerified: false,
          emailVerifiedAt: null,
          createdAt: new Date().toISOString(),
        }
      );

      await signOut(auth);

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
                className="object-contain"
                priority
              />
            </motion.div>
          </div>

          <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">
            Create Your Account
          </h1>
          <p className="text-center text-gray-500 mb-8">
            Are you a customer or a store owner?
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
                    Shop for African groceries and get delivery
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
                    Sell your African products to the community
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
          onClick={() => setStep("select")}
          className="mb-4 text-gray-500 hover:text-gray-700 transition"
        >
          ← Back
        </button>

        <div className="flex justify-center mb-6">
          <div className="relative w-20 h-20">
            <Image
              src="/icon/icon-512.png"
              alt="LIA"
              fill
              className="object-contain"
            />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">
          {accountType === "customer" ? "Customer Registration" : "Store Owner Registration"}
        </h1>
        <p className="text-center text-gray-500 mb-8">
          Create your {accountType === "customer" ? "shopping" : "store"} account
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

        <form onSubmit={handleRegister} className="space-y-5">
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
                placeholder="(123) 456 - 7890"
                required
                disabled={success}
                maxLength={18}
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
                placeholder="Min 6 characters"
                required
                disabled={success}
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
    </main>
  );
}
