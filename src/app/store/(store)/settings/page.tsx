"use client";

/*
  Store Settings Page.
  Complete store management with modern UI.
*/

import {useState, useEffect} from "react";
import {useRouter} from "next/navigation";
import {motion} from "framer-motion";
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
} from "lucide-react";
import {auth, db} from "@/lib/firebase";
import {doc, getDoc, updateDoc} from "firebase/firestore";

// Components
import {ProfileSection} from "./components/ProfileSection";
import {SecuritySection} from "./components/SecuritySection";
import {NotificationsSection} from "./components/NotificationsSection";
import {PaymentSection} from "./components/PaymentSection";
import {DeliverySection} from "./components/DeliverySection";
import {BusinessSection} from "./components/BusinessSection";
import {DangerSection} from "./components/DangerSection";

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [storeData, setStoreData] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [activeSection, setActiveSection] = useState("profile");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

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
          setUserData(userDoc.data());
        }

        // Get store data
        const storesRef = doc(db, "stores", user.uid);
        const storeDoc = await getDoc(storesRef);
        if (storeDoc.exists()) {
          setStoreData({id: storeDoc.id, ...storeDoc.data()});
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

      // Update store
      if (storeData) {
        await updateDoc(doc(db, "stores", storeData.id), {
          ...storeData,
          updatedAt: new Date().toISOString(),
        });
      }

      // Update user
      if (userData) {
        await updateDoc(doc(db, "users", user.uid), {
          ...userData,
          updatedAt: new Date().toISOString(),
        });
      }

      setSaveMessage("Settings saved successfully! ✅");
      setTimeout(() => setSaveMessage(""), 3000);

    } catch (error) {
      console.error("Error saving settings:", error);
      setSaveMessage("Failed to save settings ❌");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const sections = [
    {id: "profile", label: "Store Profile", icon: Store},
    {id: "business", label: "Business Info", icon: Building},
    {id: "delivery", label: "Delivery Settings", icon: Truck},
    {id: "payment", label: "Payment & Payouts", icon: CreditCard},
    {id: "notifications", label: "Notifications", icon: Bell},
    {id: "security", label: "Security", icon: Shield},
    {id: "danger", label: "Danger Zone", icon: AlertTriangle},
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
          type="button"  // ✅ Add type="button"
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
          initial={{opacity: 0, y: -10}}
          animate={{opacity: 1, y: 0}}
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
            initial={{opacity: 0, y: 10}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.3}}
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
            {activeSection === "delivery" && (
              <DeliverySection 
                storeData={storeData}
                setStoreData={setStoreData}
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