"use client";

/*
  Store Settings Page.
  Complete store management with modern UI.
  ✅ Fetches store data by ownerId instead of document ID.
*/

import { BrandedLoader } from "@/components/ui/BrandedLoader";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Store,
  User,
  Shield,
  Bell,
  CreditCard,
  Truck,
  Building,
  AlertTriangle,
  ChevronRight,
  Save,
  Settings as SettingsIcon,
  Clock,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { geocodeAddress } from "@/services/delivery/geocode";

// Components
import { ProfileSection } from "@/components/store/settings/ProfileSection";
import { SecuritySection } from "@/components/store/settings/SecuritySection";
import { NotificationsSection } from "@/components/store/settings/NotificationsSection";
import { PaymentSection } from "@/components/store/settings/PaymentSection";
import { BusinessSection } from "@/components/store/settings/BusinessSection";
import { DangerSection } from "@/components/store/settings/DangerSection";
import { StoreSchedule } from "@/components/store/settings/StoreSchedule";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { useConfirmation } from "@/context/ConfirmationContext";
import { useSuccessToast } from "@/context/SuccessToastContext";

export default function SettingsPage() {
  const { showSuccess } = useSuccessToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [storeData, setStoreData] = useState<any>(null);
  const [storeId, setStoreId] = useState<string>("");
  const [userData, setUserData] = useState<any>(null);
  const [activeSection, setActiveSection] = useState("profile");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const initialStoreData = useRef<string | null>(null);
  const initialUserData = useRef<string | null>(null);

  const hasUnsavedChanges =
    (initialStoreData.current !== null &&
      JSON.stringify(storeData) !== initialStoreData.current) ||
    (initialUserData.current !== null &&
      JSON.stringify(userData) !== initialUserData.current);

  useUnsavedChanges(hasUnsavedChanges);
  const { confirm } = useConfirmation();

  // Fetch store and user data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          router.push("/login");
          return;
        }

        // Get user data
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const loadedUserData = userDoc.data();
          setUserData(loadedUserData);
          initialUserData.current = JSON.stringify(loadedUserData);
        }

        // ✅ Get store data by querying ownerId
        const storesRef = collection(db, "stores");
        const q = query(storesRef, where("ownerId", "==", user.uid));
        const storeSnapshot = await getDocs(q);
        
        if (!storeSnapshot.empty) {
          const storeDoc = storeSnapshot.docs[0];
          setStoreId(storeDoc.id);
          const loadedStoreData = { id: storeDoc.id, ...storeDoc.data() };
          setStoreData(loadedStoreData);
          initialStoreData.current = JSON.stringify(loadedStoreData);
        } else {
          // No store found - redirect to create
          router.push("/store/create");
          return;
        }

      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  // Save settings
  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveMessage("");

      const user = auth.currentUser;
      if (!user) return;

      // Keep the saved coordinates in sync with the store address.
      if (storeData && storeId) {
        if (
          !storeData.address?.trim() ||
          !storeData.city?.trim() ||
          !storeData.state?.trim() ||
          !storeData.zip?.trim()
        ) {
          setSaveMessage(
            "Enter the complete store address (street, city, state, and ZIP code) so we can verify its location."
          );
          return;
        }

        const fullAddress = [
          storeData.address,
          storeData.city,
          storeData.state,
          storeData.zip,
        ]
          .join(", ");

        const location = await geocodeAddress(fullAddress);

        if (!location) {
          setSaveMessage(
            "We couldn't verify that store address. Check the street, city, state, and ZIP code, then try again."
          );
          return;
        }

        const confirmed = await confirm({
          title: "Save store changes?",
          message: "Your updated store details and location will be saved.",
          confirmLabel: "Save changes",
          cancelLabel: "Keep editing",
        });

        if (!confirmed) return;

        const updatedStoreData = {
          ...storeData,
          address: storeData.address.trim().toUpperCase(),
          city: storeData.city.trim().toUpperCase(),
          state: storeData.state.trim().toUpperCase(),
          zip: storeData.zip.trim().toUpperCase(),
          formattedAddress: (location.formattedAddress || fullAddress).toUpperCase(),
          latitude: location.latitude,
          longitude: location.longitude,
          updatedAt: new Date().toISOString(),
        };

        const {
          id: _id,
          logoUrl: _logoUrl,
          bannerUrl: _bannerUrl,
          logoImagePath: _logoImagePath,
          bannerImagePath: _bannerImagePath,
          ...storeFields
        } = updatedStoreData;

        // Image URLs are written by the background resize Function. Do not
        // overwrite a freshly processed URL with this page's older state.
        await updateDoc(doc(db, "stores", storeId), storeFields);

        setStoreData(updatedStoreData);
        initialStoreData.current = JSON.stringify(updatedStoreData);
      }

      // Update user
      if (userData) {
        const updatedUserData = {
          ...userData,
          updatedAt: new Date().toISOString(),
        };

        await updateDoc(doc(db, "users", user.uid), updatedUserData);
        setUserData(updatedUserData);
        initialUserData.current = JSON.stringify(updatedUserData);
      }

      setSaveMessage("Settings saved successfully! ✅");
      showSuccess("Store settings saved successfully.");
      setTimeout(() => setSaveMessage(""), 3000);

    } catch (error) {
      console.error("Error saving settings:", error);
      setSaveMessage("Failed to save settings ❌");
    } finally {
      setSaving(false);
    }
  };

  /* ==========================================
     LOADING STATE - WHITE BRANDED LOADER
  ========================================== */
  if (loading) {
    return (
      <BrandedLoader message="Loading Settings" />
    );
  }

  const sections = [
    { id: "profile", label: "Store Profile", icon: Store },
    { id: "business", label: "Business Info", icon: Building },
    { id: "schedule", label: "Store Schedule", icon: Clock }, // ✅ Added schedule section
    { id: "payment", label: "Payment & Payouts", icon: CreditCard },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security", icon: Shield },
    { id: "danger", label: "Danger Zone", icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
          <p className="text-gray-500 text-sm">Manage your store and account settings</p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg hover:from-orange-600 hover:to-orange-700 transition flex items-center gap-2 text-sm disabled:opacity-50"
          aria-label="Save all settings"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Save Message */}
      {saveMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-3 rounded-xl text-sm ${
            saveMessage.includes("✅") 
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {saveMessage}
        </motion.div>
      )}

      {/* Settings Layout */}
      <div className="grid lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 sticky top-20">
            <div className="space-y-1">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition text-sm ${
                      isActive
                        ? "bg-orange-50 text-orange-600 font-medium"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? "text-orange-600" : "text-gray-400"}`} />
                      <span>{section.label}</span>
                    </div>
                    <ChevronRight className={`w-4 h-4 ${isActive ? "text-orange-600" : "text-gray-300"}`} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3 space-y-4">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {activeSection === "profile" && (
              <ProfileSection 
                storeData={storeData}
                setStoreData={setStoreData}
                userData={userData}
                setUserData={setUserData}
              />
            )}
            {activeSection === "business" && (
              <BusinessSection 
                storeData={storeData}
                setStoreData={setStoreData}
              />
            )}
            {activeSection === "schedule" && ( // ✅ New schedule section
              <StoreSchedule 
                storeData={storeData}
                setStoreData={setStoreData}
                storeId={storeId}
              />
            )}
            {activeSection === "payment" && (
              <PaymentSection 
                storeData={storeData}
                setStoreData={setStoreData}
              />
            )}
            {activeSection === "notifications" && (
              <NotificationsSection 
                storeData={storeData}
                setStoreData={setStoreData}
              />
            )}
            {activeSection === "security" && (
              <SecuritySection 
                userData={userData}
                setUserData={setUserData}
              />
            )}
            {activeSection === "danger" && (
              <DangerSection />
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
