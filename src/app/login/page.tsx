"use client";

/*
  React state.
*/
import {useState} from "react";
import {useRouter} from "next/navigation";
import {motion} from "framer-motion";

/*
  Firebase Authentication methods.
*/
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendEmailVerification,
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
        setError("Your account profile is incomplete. Please contact support.");
        await signOut(auth);
        return;
      }

      throw accountError;
    }

    /*
      Firebase Auth is the source of truth for email verification. Sync the
      now-existing profile through a callable after a verified user signs in.
    */
    await httpsCallable(functions, "syncEmailVerification")();

    if (accountType === "admin") {
      router.replace("/admin");
      return;
    }

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
    try {
      setLoading(true);
      setError("");

      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      const user = userCredential.user;

      // Check if email is verified.
      if (!user.emailVerified) {
        await signOut(auth);
        await sendEmailVerification(user);
        setError(
          "Please verify your email first. A new verification link has been sent."
        );
        return;
      }

      await handlePostLogin(user.uid);
    } catch (error: any) {
      console.error(error);
      if (error.code === "auth/user-not-found") {
        setError("No account found with this email.");
      } else if (error.code === "auth/wrong-password") {
        setError("Invalid password. Please try again.");
      } else if (error.code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError("Invalid email or password.");
      }
    } finally {
      setLoading(false);
    }
  }

  /*
    Google Login.
  */
  async function handleGoogleLogin() {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (!user.emailVerified) {
        await signOut(auth);
        setError("Please verify your Google email first.");
        return;
      }

      await handlePostLogin(user.uid);
    } catch (error) {
      console.error(error);
      setError("Google sign in failed.");
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
