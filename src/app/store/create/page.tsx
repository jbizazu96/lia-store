"use client";

/*
  React state.
*/
import {useState, useCallback} from "react";
import {useRouter} from "next/navigation";
import Image from "next/image";
import {motion, AnimatePresence} from "framer-motion";
import {AlertCircle} from "lucide-react";

/*
  Firebase imports.
*/
import {collection, setDoc, doc} from "firebase/firestore";
import {auth, db} from "@/lib/firebase";
import {geocodeAddress} from "@/services/delivery/geocode";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

/*
  Firebase Storage
*/
import {getStorage, ref, uploadBytes, getDownloadURL} from "firebase/storage";
import { storeImageService } from "@/services/store/storeImageService";

/*
  Components
*/
import {StepIndicator} from "@/components/store/create/StepIndicator";
import {Step1StoreInfo} from "@/components/store/create/Step1StoreInfo";
import {Step2LegalPhotos} from "@/components/store/create/Step2LegalPhotos";
import {Step3Stripe} from "@/components/store/create/Step3Stripe";
import {NavigationButtons} from "@/components/store/create/NavigationButtons";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { useConfirmation } from "@/context/ConfirmationContext";

export default function CreateStorePage() {
  const router = useRouter();
  const storage = getStorage();

  // Step management
  const [step, setStep] = useState(1);
  const totalSteps = 3;

  // Loading states
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Store Info
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  const hasUnsavedChanges = Boolean(
    name || description || phone || email || address || city || state || zip || step > 1
  );

  useUnsavedChanges(hasUnsavedChanges);
  const { confirm } = useConfirmation();

  // Step 2: Legal & Photos
  const [businessType, setBusinessType] = useState("");
  const [registeredName, setRegisteredName] = useState("");
  const [ein, setEin] = useState("");
  const [businessStructure, setBusinessStructure] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [photoIdFile, setPhotoIdFile] = useState<File | null>(null);
  const [photoIdPreview, setPhotoIdPreview] = useState("");
  const [storeFrontFile, setStoreFrontFile] = useState<File | null>(null);
  const [storeFrontPreview, setStoreFrontPreview] = useState("");
  const [storeInsideFile, setStoreInsideFile] = useState<File | null>(null);
  const [storeInsidePreview, setStoreInsidePreview] = useState("");

  // Step 3: Stripe Connect
  const [stripeEmail, setStripeEmail] = useState("");
  const [stripePhone, setStripePhone] = useState("");
  const [stripeBusinessType, setStripeBusinessType] = useState("");
  const [stripeAccountType, setStripeAccountType] = useState("individual");

  /*
    Format phone number
  */
  const formatPhone = useCallback((value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} - ${digits.slice(6, 10)}`;
  }, []);

  /*
    Handle file uploads
  */
  const handleFileUpload = useCallback((
    file: File | null,
    setFile: (f: File | null) => void,
    setPreview: (p: string) => void
  ) => {
    if (!file) {
      setFile(null);
      setPreview("");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
    setFile(file);
  }, []);

  /*
    Upload file to Firebase Storage
  */
  const uploadFile = useCallback(async (file: File, path: string): Promise<string> => {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  }, [storage]);

  /*
    Validations
  */
  const validateStep1 = useCallback(() => {
    if (!name.trim()) { setError("Store name is required"); return false; }
    if (!phone.trim()) { setError("Phone number is required"); return false; }
    if (phone.replace(/\D/g, "").length < 10) { setError("Valid phone number required"); return false; }
    if (!address.trim()) { setError("Street address is required"); return false; }
    if (!city.trim()) { setError("City is required"); return false; }
    if (!state.trim()) { setError("State is required"); return false; }
    if (!zip.trim()) { setError("ZIP code is required"); return false; }
    return true;
  }, [name, phone, address, city, state, zip]);

  const validateStep2 = useCallback(() => {
    if (!businessType) { setError("Please select a business type"); return false; }
    if (!registeredName.trim()) { setError("Registered business name is required"); return false; }
    if (!businessStructure) { setError("Please select business structure"); return false; }
    if (!logoFile) { setError("Please upload a store logo"); return false; }
    if (!photoIdFile) { setError("Please upload a photo ID"); return false; }
    if (!storeFrontFile) { setError("Please upload a store front photo"); return false; }
    if (!storeInsideFile) { setError("Please upload an inside store photo"); return false; }
    return true;
  }, [businessType, registeredName, businessStructure, logoFile, photoIdFile, storeFrontFile, storeInsideFile]);

  const validateStep3 = useCallback(() => {
    if (!stripeEmail) { setError("Email is required for payment setup"); return false; }
    if (!stripePhone) { setError("Phone is required for payment setup"); return false; }
    if (stripePhone.replace(/\D/g, "").length < 10) { setError("Valid phone number required"); return false; }
    if (!stripeBusinessType) { setError("Please select business type for payment"); return false; }
    return true;
  }, [stripeEmail, stripePhone, stripeBusinessType]);

  /*
    Navigation
  */
  const nextStep = useCallback(() => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setError("");
    setStep(step + 1);
  }, [step, validateStep1, validateStep2]);

  const prevStep = useCallback(() => {
    setError("");
    setStep(step - 1);
  }, []);

  /*
    Main submit
  */
  const handleSubmit = useCallback(async () => {
    if (!validateStep3()) return;

    try {
      setLoading(true);
      setError("");

      const user = auth.currentUser;
      if (!user) { setError("Please login first."); return; }

      // Geocode address
      const fullAddress = `${address}, ${city}, ${state} ${zip}`;
      const location = await geocodeAddress(fullAddress);
      if (!location) {
        setError(
          "We couldn't verify this store address. Check the street, city, state, and ZIP code, then try again."
        );
        return;
      }

      const confirmed = await confirm({
        title: "Create your store?",
        message: "Your store information, verified address, and submitted documents will be saved.",
        confirmLabel: "Create store",
        cancelLabel: "Keep editing",
      });

      if (!confirmed) return;

      // Upload images
      setUploading(true);
      const now = Date.now();
      const uid = user.uid;

      const storeReference = doc(collection(db, "stores"));

      // Legal documents stay private/original. Customer-facing images are
      // uploaded after the store document exists so the resize Function can
      // update its public image URLs.
      const [photoIdUrl, storeInsideUrl] = await Promise.all([
        uploadFile(photoIdFile!, `stores/${uid}/photo_id_${now}.jpg`),
        uploadFile(storeInsideFile!, `stores/${uid}/inside_${now}.jpg`),
      ]);

      // Create the store before customer-facing image processing starts.
      const storeData = {
        ownerId: uid,
        name,
        description,
        phone,
        email: email || user.email,
        address,
        city,
        state,
        zip,
        latitude: location.latitude,
        longitude: location.longitude,
        placeId: location.placeId,
        formattedAddress: location.formattedAddress || fullAddress,
        logoUrl: "",
        bannerUrl: "",
        businessType,
        registeredName,
        ein: ein || null,
        businessStructure,
        photoIdUrl,
        storeFrontUrl: "",
        storeInsideUrl,
        stripeEmail,
        stripePhone,
        stripeBusinessType,
        stripeAccountType,
        stripeAccountId: null,
        minimumOrder: 20,
        status: "pending",
        isOpen: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(storeReference, storeData);

      await Promise.all([
        storeImageService.uploadOriginalImage({
          storeId: storeReference.id,
          field: "logo",
          file: logoFile!,
        }),
        storeImageService.uploadOriginalImage({
          storeId: storeReference.id,
          field: "banner",
          file: storeFrontFile!,
        }),
      ]);
      setUploading(false);

      // Update user
      await setDoc(doc(db, "users", uid), {
        accountType: "store_owner",
        storeId: storeReference.id,
        stripeEmail,
        stripePhone,
      }, {merge: true});

      router.push("/store/dashboard");

    } catch (error: any) {
      console.error(error);
      setError(error.message || "Failed to create store.");
    } finally {
      setLoading(false);
    }
  }, [name, description, phone, email, address, city, state, zip,
      businessType, registeredName, ein, businessStructure,
      logoFile, photoIdFile, storeFrontFile, storeInsideFile,
      stripeEmail, stripePhone, stripeBusinessType, stripeAccountType,
      uploadFile, validateStep3, router]);

  return (
    <ProtectedRoute>
      <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-orange-50 to-green-50">
        <motion.div
          initial={{opacity: 0, y: 20}}
          animate={{opacity: 1, y: 0}}
          className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 relative"
        >
          {/* Logo */}
          <div className="flex justify-center mb-4">
            <div className="relative w-16 h-16">
              <Image src="/icon/icon-512.png" alt="LIA" fill className="object-contain" priority />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center text-gray-800">Start Your Store</h1>

          {/* Step Indicator */}
          <StepIndicator currentStep={step} totalSteps={totalSteps} />

          {/* Error */}
          {error && (
            <motion.div
              initial={{opacity: 0, x: -10}}
              animate={{opacity: 1, x: 0}}
              className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            </motion.div>
          )}

          {/* Step Content */}
          <AnimatePresence mode="wait">
            {step === 1 && (
              <Step1StoreInfo
                name={name}
                setName={setName}
                description={description}
                setDescription={setDescription}
                phone={phone}
                setPhone={setPhone}
                email={email}
                setEmail={setEmail}
                address={address}
                setAddress={setAddress}
                city={city}
                setCity={setCity}
                state={state}
                setState={setState}
                zip={zip}
                setZip={setZip}
                formatPhone={formatPhone}
              />
            )}
            {step === 2 && (
              <Step2LegalPhotos
                businessType={businessType}
                setBusinessType={setBusinessType}
                registeredName={registeredName}
                setRegisteredName={setRegisteredName}
                ein={ein}
                setEin={setEin}
                businessStructure={businessStructure}
                setBusinessStructure={setBusinessStructure}
                logoPreview={logoPreview}
                handleLogoUpload={(file) => handleFileUpload(file, setLogoFile, setLogoPreview)}
                photoIdPreview={photoIdPreview}
                handlePhotoIdUpload={(file) => handleFileUpload(file, setPhotoIdFile, setPhotoIdPreview)}
                storeFrontPreview={storeFrontPreview}
                handleStoreFrontUpload={(file) => handleFileUpload(file, setStoreFrontFile, setStoreFrontPreview)}
                storeInsidePreview={storeInsidePreview}
                handleStoreInsideUpload={(file) => handleFileUpload(file, setStoreInsideFile, setStoreInsidePreview)}
              />
            )}
            {step === 3 && (
              <Step3Stripe
                stripeEmail={stripeEmail}
                setStripeEmail={setStripeEmail}
                stripePhone={stripePhone}
                setStripePhone={setStripePhone}
                stripeBusinessType={stripeBusinessType}
                setStripeBusinessType={setStripeBusinessType}
                stripeAccountType={stripeAccountType}
                setStripeAccountType={setStripeAccountType}
                formatPhone={formatPhone}
              />
            )}
          </AnimatePresence>

          {/* Navigation */}
          <NavigationButtons
            currentStep={step}
            totalSteps={totalSteps}
            loading={loading}
            onBack={prevStep}
            onNext={nextStep}
            onSubmit={handleSubmit}
          />

          {/* Uploading indicator */}
          {uploading && (
            <div className="mt-4 text-center text-sm text-green-600">
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                <span>Uploading images...</span>
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </ProtectedRoute>
  );
}
