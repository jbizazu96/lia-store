"use client";

/*
  React state.
*/
import {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {motion} from "framer-motion";

/*
  Firebase Authentication methods.
*/
import {
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  httpsCallable,
} from "firebase/functions";

/*
  Firebase instances.
*/
import {auth, functions} from "@/lib/firebase";

/*
  Components.
*/
import {LoginForm} from "@/components/login/LoginForm";
import {PasswordResetModal} from "@/components/login/PasswordResetModal";
import {AddressModal} from "@/components/login/AddressModal";
import {StoreStatusModal} from "@/components/login/StoreStatusModal";
import { useConfirmation } from "@/context/ConfirmationContext";
import { userService } from "@/services/user/userService";
import { storeWorkspaceClientService } from "@/services/store/storeWorkspaceClientService";
import { customerProfileClientService } from "@/services/user/customerProfileClientService";
import {
  currentAccountClientService,
  CurrentAccountClientError,
} from "@/services/user/currentAccountClientService";
import { googleAuthenticationService } from "@/services/auth/googleAuthenticationService";
import {appleAuthenticationService} from "@/services/auth/appleAuthenticationService";
import {Capacitor} from "@capacitor/core";
import {reportClientIssue} from "@/services/monitoring/clientErrorReporter";
import {authEmailService} from "@/services/auth/authEmailService";

export default function LoginPage() {
  const router = useRouter();
  const { confirm } = useConfirmation();

  /*
    Form state.
  */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("accountDeletion") === "review") {
      // Reflect the server-enforced lock after the redirect from submission.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(
        "Your account deletion request is under review. Account access will remain unavailable unless the request is rejected or reinstated."
      );
    }
  }, []);

  /*
    Modal states.
  */
  const [showResetModal, setShowResetModal] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showStoreStatusModal, setShowStoreStatusModal] = useState(false);
  const [storeStatusData, setStoreStatusData] = useState<{
    status: "approved" | "pending" | "none";
    storeName?: string;
  }>({status: "none"});

  /*
    Address state.
  */
  const [addressData, setAddressData] = useState({
    street: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
  });
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [addressGeocoding, setAddressGeocoding] = useState(false);

  /*
    Toggle password visibility.
  */
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  /*
  Handle post-login routing based on account type.
  */
  const handlePostLogin = async (uid: string) => {
    let accountType: "customer" | "store_owner" | "driver" | "admin";

    try {
      accountType = (await currentAccountClientService.get()).accountType;
    } catch (accountError) {
      if (accountError instanceof CurrentAccountClientError && accountError.status === 403) {
        setError(accountError.message);
        await signOut(auth);
        return;
      }

      throw accountError;
    }

    if (Capacitor.isNativePlatform() && accountType !== "customer") {
      await signOut(auth);
      setError(
        "The LIA mobile app is for customer accounts. Store owners, drivers, and administrators can sign in through the LIA website.",
      );
      return;
    }

    if (accountType === "admin") {
      router.replace("/admin");
      return;
    }

    /*
      Firebase Auth is the source of truth for email verification. Sync the
      now-existing ordinary user profile after a verified user signs in.
      Administrators are provisioned under admins/{uid}, not users/{uid}.
    */
    await httpsCallable(functions, "syncEmailVerification")();

    /*
      Store Owner Flow - Redirect to Premium Dashboard.
    */
    if (accountType === "store_owner") {
      /*
       * Store applications are private. The callable derives the owned
       * store from the verified Firebase session rather than exposing a
       * browser query against stores/{storeId}.
       */
      const entry = await storeWorkspaceClientService.getEntry();

      if (entry.hasStore && entry.store) {
        const isApproved = entry.store.isApproved;
        const storeName = entry.store.name || "Your Store";

        if (isApproved) {
          // ✅ Redirect to the premium dashboard - use /store/dashboard NOT /(store)/dashboard
          router.replace("/store/dashboard");
          return;
        } else {
          // Store is pending - show review message
          setStoreStatusData({
            status: "pending",
            storeName: storeName,
          });
          setShowStoreStatusModal(true);
          return;
        }
      } else {
        // No store exists - show welcome message
        setStoreStatusData({
          status: "none",
        });
        setShowStoreStatusModal(true);
        return;
      }
    }

    /*
      Driver Flow - The driver workspace is intentionally a placeholder
      until driver onboarding and delivery tools are added.
    */
    if (accountType === "driver") {
      router.replace("/driver");
      return;
    }

    /*
      Customer Flow - Redirect to Home.
    */
    // Check the user document and users/{uid}/addresses subcollection.
    if (await userService.hasDefaultDeliveryAddress(uid)) {
      // Address exists - go to home
      router.replace("/home");
    } else {
      // No address - show modal
      setShowAddressModal(true);
    }
  };

  /*
    Email/Password Login.
  */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    let userCredential;

    try {
      setLoading(true);
      setError("");

      userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
    } catch (error: unknown) {
      console.error("Email/password sign in failed:", error);
      const code = error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
      reportClientIssue({
        area: "authentication.email_sign_in",
        message: "Email sign-in failed",
        error,
        metadata: {code},
      });
      if (code === "auth/user-not-found") {
        setError("No account found with this email.");
      } else if (code === "auth/wrong-password") {
        setError("Invalid password. Please try again.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError("Invalid email or password.");
      }
      setLoading(false);
      return;
    }

    const user = userCredential.user;

    try {
      // Check if email is verified.
      if (!user.emailVerified) {
        try {
          /* Verification requires the newly authenticated user session. */
          await authEmailService.requestVerification();
          setError(
            "Please verify your email first. A new verification link has been sent."
          );
        } catch (verificationError: unknown) {
          const code = verificationError && typeof verificationError === "object" && "code" in verificationError
            ? String(verificationError.code)
            : "";
          setError(
            code === "auth/too-many-requests" || code.includes("resource-exhausted")
              ? "Too many verification emails were requested. Please use the most recent email we sent, or wait before trying again."
              : "Your email is not verified. We couldn't send another verification email right now; please try again later."
          );
        } finally {
          await signOut(auth);
        }
        return;
      }

      await handlePostLogin(user.uid);
    } catch (error) {
      console.error("Post-login account setup failed:", error);
      reportClientIssue({
        area: "authentication.post_login_setup",
        message: "Post-login account setup failed",
        error,
      });
      setError(
        error instanceof CurrentAccountClientError
          ? "We couldn't load your account right now. Please try again."
          : "We couldn't finish signing you in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
    Google Login.
  */
  async function handleGoogleLogin() {
    try {
      setLoading(true);
      setError("");
      const result = await googleAuthenticationService.signIn();
      const user = result.user;

      if (!user.emailVerified) {
        await signOut(auth);
        setError("Please verify your Google email first.");
        return;
      }

      await handlePostLogin(user.uid);
    } catch (error) {
      console.error(error);
      reportClientIssue({
        area: "authentication.google_sign_in",
        message: "Google sign-in failed",
        error,
      });
      setError("Google sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAppleLogin() {
    try {
      setLoading(true);
      setError("");
      const result = await appleAuthenticationService.signIn();
      await handlePostLogin(result.user.uid);
    } catch (error: unknown) {
      console.error("Apple sign in failed:", error);
      const code = error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
      reportClientIssue({
        area: "authentication.apple_sign_in",
        message: "Apple sign-in failed",
        error,
        metadata: {code},
      });
      setError(
        code.includes("account-exists-with-different-credential")
          ? "An account already uses this email. Sign in with the original method, then connect Apple from your account settings."
          : code.includes("popup-closed-by-user") || code.includes("canceled")
            ? "Apple sign in was cancelled."
            : "Apple sign in failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  /*
    Handle address submission.
  */
  async function handleAddressSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!addressData.street.trim() || !addressData.city.trim() ||
        !addressData.state.trim() || !addressData.zip.trim()) {
      setAddressError("Please fill in all address fields.");
      return;
    }

    try {
      setAddressLoading(true);
      setAddressError("");
      setAddressGeocoding(true);

      const confirmed = await confirm({
        title: "Save delivery address?",
        message: "This verified address will be used for deliveries.",
        confirmLabel: "Save address",
        cancelLabel: "Keep editing",
      });

      if (!confirmed) return;

      /*
       * Customer addresses are geocoded, normalized, and persisted only by
       * the authenticated callable. The login page never writes an address
       * or coordinates to Firestore directly.
       */
      await customerProfileClientService.saveDefaultAddress({
        street: addressData.street,
        city: addressData.city,
        state: addressData.state,
        zip: addressData.zip,
      });

      setShowAddressModal(false);
      router.replace("/home");
    } catch (error) {
      console.error("Error saving address:", error);
      setAddressError("Failed to save address. Please try again.");
    } finally {
      setAddressLoading(false);
      setAddressGeocoding(false);
    }
  }

  return (
    <>
      <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-orange-50 to-green-50">
        <motion.div
          initial={{opacity: 0, y: 20}}
          animate={{opacity: 1, y: 0}}
          transition={{duration: 0.5}}
          className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8"
        >
          <LoginForm
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            loading={loading}
            error={error}
            showPassword={showPassword}
            onLogin={handleLogin}
            onGoogleLogin={handleGoogleLogin}
            onAppleLogin={handleAppleLogin}
            onForgotPassword={() => setShowResetModal(true)}
            onTogglePassword={togglePasswordVisibility}
          />
        </motion.div>
      </main>

      {/* Password Reset Modal */}
      <PasswordResetModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
      />

      {/* Address Modal */}
      <AddressModal
        isOpen={showAddressModal}
        addressData={addressData}
        setAddressData={setAddressData}
        addressLoading={addressLoading}
        addressError={addressError}
        addressGeocoding={addressGeocoding}
        onSubmit={handleAddressSubmit}
        onClose={() => setShowAddressModal(false)}
      />

      {/* Store Status Modal */}
      <StoreStatusModal
        isOpen={showStoreStatusModal}
        status={storeStatusData.status}
        storeName={storeStatusData.storeName}
        onClose={() => setShowStoreStatusModal(false)}
        onCreateStore={() => router.push("/store/onboarding/owner")}
        onGoToDashboard={() => router.push("/store/dashboard")}
      />
    </>
  );
}
