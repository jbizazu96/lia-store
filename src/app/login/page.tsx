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

/*
  Firebase instances.
*/
import {auth, db} from "@/lib/firebase";

/*
  Firestore functions.
*/
import {doc, getDoc, collection, query, where, getDocs} from "firebase/firestore";

/*
  Components.
*/
import {LoginForm} from "@/components/login/LoginForm";
import {PasswordResetModal} from "@/components/login/PasswordResetModal";
import {AddressModal} from "@/components/login/AddressModal";
import {StoreStatusModal} from "@/components/login/StoreStatusModal";
import { useConfirmation } from "@/context/ConfirmationContext";

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
    status: "active" | "pending" | "none";
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
    /*
      Get user data from Firestore.
    */
    const userRef = doc(db, "users", uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      setError("User profile not found. Please contact support.");
      await signOut(auth);
      return;
    }

    const userData = userDoc.data();
    const accountType = userData.accountType || "customer";

    /*
      Store Owner Flow - Redirect to Premium Dashboard.
    */
    if (accountType === "store_owner") {
      // Query stores by ownerId
      const storesRef = collection(db, "stores");
      const q = query(storesRef, where("ownerId", "==", uid));
      const storeSnapshot = await getDocs(q);

      if (!storeSnapshot.empty) {
        const storeDoc = storeSnapshot.docs[0];
        const storeData = storeDoc.data();
        const storeStatus = storeData.status || "pending";
        const storeName = storeData.name || "Your Store";

        if (storeStatus === "active") {
          // ✅ Redirect to the premium dashboard - use /store/dashboard NOT /(store)/dashboard
          router.push("/store/dashboard");
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
      Customer Flow - Redirect to Home.
    */
    // Check if address exists
    const addressRef = doc(db, "addresses", uid);
    const addressDoc = await getDoc(addressRef);

    if (addressDoc.exists() && addressDoc.data().street) {
      // Address exists - go to home
      router.push("/home");
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

      const user = auth.currentUser;
      if (!user) {
        setAddressError("You must be logged in.");
        return;
      }

      const {geocodeAddress} = await import("@/services/delivery/geocode");
      const fullAddress = `${addressData.street}, ${addressData.city}, ${addressData.state} ${addressData.zip}`;
      const location = await geocodeAddress(fullAddress);

      if (!location) {
        setAddressError(
          "We couldn't verify this delivery address. Check the street, city, state, and ZIP code, then try again."
        );
        setAddressGeocoding(false);
        return;
      }

      const confirmed = await confirm({
        title: "Save delivery address?",
        message: "This verified address will be used for deliveries.",
        confirmLabel: "Save address",
        cancelLabel: "Keep editing",
      });

      if (!confirmed) return;

      const {setDoc, updateDoc} = await import("firebase/firestore");
      await setDoc(doc(db, "addresses", user.uid), {
        userId: user.uid,
        ...addressData,
        latitude: location.latitude,
        longitude: location.longitude,
        placeId: location.placeId,
        formattedAddress: location.formattedAddress || fullAddress,
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await updateDoc(doc(db, "users", user.uid), {
        defaultAddress: {
          ...addressData,
          latitude: location.latitude,
          longitude: location.longitude,
          placeId: location.placeId,
          formattedAddress: location.formattedAddress || fullAddress,
        },
      });

      setShowAddressModal(false);
      router.push("/home");
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
        onCreateStore={() => router.push("/store/create")}
        onGoHome={() => router.push("/home")}
        onGoToDashboard={() => router.push("/store/dashboard")}
      />
    </>
  );
}
