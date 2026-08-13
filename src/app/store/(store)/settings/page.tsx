"use client";

/*
  Store Settings Page.
  Complete store management with modern UI.
  ✅ Fetches store data by ownerId instead of document ID.
*/

import { PageContentSkeleton } from "@/components/ui/PageContentSkeleton";
import { useState, useEffect } from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import { motion } from "framer-motion";
import {
  Store,
  Shield,
  Bell,
  CreditCard,
  Building,
  AlertTriangle,
  ChevronRight,
  Save,
  Clock,
  History,
  Headphones,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import {
  storeWorkspaceClientService,
  type StoreWorkspaceStore,
  type StoreWorkspaceUser,
} from "@/services/store/storeWorkspaceClientService";

// Components
import { ProfileSection } from "@/components/store/settings/ProfileSection";
import { SecuritySection } from "@/components/store/settings/SecuritySection";
import { NotificationsSection } from "@/components/store/settings/NotificationsSection";
import { PaymentSection } from "@/components/store/settings/PaymentSection";
import { BusinessSection } from "@/components/store/settings/BusinessSection";
import { DangerSection } from "@/components/store/settings/DangerSection";
import { StoreSchedule } from "@/components/store/settings/StoreSchedule";
import {SettingsActivitySection} from "@/components/store/settings/SettingsActivitySection";
import {AccountSupportForm} from "@/components/support/AccountSupportForm";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { useConfirmation } from "@/context/ConfirmationContext";
import { useSuccessToast } from "@/context/SuccessToastContext";

/*
  Settings sections supported by this page.

  Keeping these values in one union prevents an arbitrary URL value
  from becoming the active settings section.
*/
type SettingsSection =
  | "profile"
  | "business"
  | "schedule"
  | "payment"
  | "notifications"
  | "security"
  | "activity"
  | "support"
  | "danger";


/*
  Validate a section value read from the URL.

  Example:

  ?section=payment
      → accepted

  ?section=unknown
      → rejected
*/
function isSettingsSection(
  value: string | null
): value is SettingsSection {
  return (
    value === "profile" ||
    value === "business" ||
    value === "schedule" ||
    value === "payment" ||
    value === "notifications" ||
    value === "security" ||
    value === "activity" ||
    value === "support" ||
    value === "danger"
  );
}

/*
  The payment section refreshes Stripe-owned status fields in local state so
  the screen reflects the current account. Those server-owned fields must
  never make the page look dirty. Only compare fields this settings UI can
  actually edit and save through saveStoreWorkspaceSettings().
*/
type SavableSettingsSection = "profile" | "business" | "notifications";

function sectionFingerprint(
  section: SavableSettingsSection,
  store: StoreWorkspaceStore | null,
  user: StoreWorkspaceUser | null,
): string {
  if (!store) return "";
  if (section === "profile") return JSON.stringify({
    name: store.name, email: store.email, phone: store.phone,
    description: store.description, address: store.address, city: store.city,
    state: store.state, zip: store.zip,
    displayName: user?.displayName ?? "", userPhone: user?.phone ?? "",
    language: user?.language ?? "",
  });
  if (section === "business") return JSON.stringify({
    businessType: store.businessType, registeredName: store.registeredName,
    ein: store.ein, businessStructure: store.businessStructure,
  });
  return JSON.stringify({
    orderNotifications: store.orderNotifications,
    paymentNotifications: store.paymentNotifications,
    productStockNotifications: store.productStockNotifications,
    emailNotifications: store.emailNotifications,
    pushNotifications: store.pushNotifications,
  });
}

function mergeSavedSection(
  current: StoreWorkspaceStore,
  saved: StoreWorkspaceStore,
  section: SavableSettingsSection,
): StoreWorkspaceStore {
  const fields: Record<SavableSettingsSection, Array<keyof StoreWorkspaceStore>> = {
    profile: ["name", "email", "phone", "description", "address", "city", "state", "zip", "country", "formattedAddress", "latitude", "longitude", "placeId"],
    business: ["businessType", "registeredName", "ein", "businessStructure"],
    notifications: ["orderNotifications", "paymentNotifications", "productStockNotifications", "emailNotifications", "pushNotifications"],
  };
  const next = {...current};
  for (const field of fields[section]) Object.assign(next, {[field]: saved[field]});
  return next;
}

export default function SettingsPage() {
  const { showSuccess } = useSuccessToast();
  const router = useRouter();

  /*
    Read settings navigation information from the URL.

    Stripe onboarding returns the store owner to a URL such as:

    /store/settings?section=payment&stripe=return

    The "section" parameter tells this page which settings panel should
    be displayed after the redirect.
  */
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [storeData, setStoreData] = useState<StoreWorkspaceStore | null>(null);
  const [storeId, setStoreId] = useState<string>("");
  const [userData, setUserData] = useState<StoreWorkspaceUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeSection, setActiveSection] = useState<SettingsSection>(() => {
    const requested = searchParams.get("section");
    return isSettingsSection(requested) ? requested : "profile";
  });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [savedFingerprints, setSavedFingerprints] = useState<Record<SavableSettingsSection, string> | null>(null);
  const savableSection = activeSection === "profile" || activeSection === "business" || activeSection === "notifications" ? activeSection : null;
  const activeSectionIsDirty = Boolean(savableSection && savedFingerprints && sectionFingerprint(savableSection, storeData, userData) !== savedFingerprints[savableSection]);
  const hasUnsavedChanges = Boolean(savedFingerprints && storeData && (["profile", "business", "notifications"] as const).some((section) => sectionFingerprint(section, storeData, userData) !== savedFingerprints[section]));

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

        /* The callable verifies the signed-in owner before returning data. */
        const workspace =
          await storeWorkspaceClientService
            .getSettings(
              searchParams.get("stripe") === "return"
            );

        setStoreId(workspace.store.id);
        setStoreData(workspace.store);
        setUserData(workspace.user);
        setLoadError(null);
        setSavedFingerprints({
          profile: sectionFingerprint("profile", workspace.store, workspace.user),
          business: sectionFingerprint("business", workspace.store, workspace.user),
          notifications: sectionFingerprint("notifications", workspace.store, workspace.user),
        });

      } catch (error) {
        console.error("Error fetching settings:", error);
        setLoadError("Store settings could not be loaded. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [reloadKey, router, searchParams]);

  // Save settings
  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveMessage("");

      if (!auth.currentUser || !storeData) return;
      if (activeSection !== "profile" && activeSection !== "business" && activeSection !== "notifications") return;

      const confirmed = await confirm({
          title: "Save store changes?",
          message: activeSection === "profile" ? "Your updated store profile and location will be saved." : activeSection === "business" ? "Your updated business information will be saved." : "Your notification preferences will be saved.",
          confirmLabel: "Save changes",
          cancelLabel: "Keep editing",
        });

      if (!confirmed) return;

      /* Server verifies and geocodes the address before persisting it. */
      const workspace =
        await storeWorkspaceClientService
          .saveSettings(storeData, userData ?? {}, activeSection);

      setStoreId(workspace.store.id);
      setStoreData((current) => current ? mergeSavedSection(current, workspace.store, activeSection) : workspace.store);
      if (activeSection === "profile") setUserData(workspace.user);
      setSavedFingerprints((current) => current ? {
        ...current,
        [activeSection]: sectionFingerprint(activeSection, workspace.store, workspace.user),
      } : current);

      setSaveMessage("Settings saved successfully! ✅");
      showSuccess("Store settings saved successfully.");
      setTimeout(() => setSaveMessage(""), 3000);

    } catch (error) {
      console.error("Error saving settings:", error);
      setSaveMessage(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  /* ==========================================
     LOADING STATE - WHITE BRANDED LOADER
  ========================================== */
  if (loading) {
    return (
      <PageContentSkeleton cards={2} rows={4} />
    );
  }

  if (loadError || !storeData || !userData) {
    return <div className="rounded-xl border border-red-100 bg-white p-8 text-center"><p className="text-sm text-red-700">{loadError ?? "Store settings are unavailable."}</p><button type="button" onClick={() => {setLoading(true); setReloadKey((key) => key + 1);}} className="mt-4 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white">Try again</button></div>;
  }

  /*
  `  Strongly type every sidebar section ID.

    Without this annotation, TypeScript widens values such as "profile"
    and "payment" into the general string type.

    activeSection only accepts SettingsSection values, so the array must
    preserve that same type.
  */
  const sections: Array<{
    id: SettingsSection;
    label: string;
    icon: typeof Store;
  }> = [
    { id: "profile", label: "Store Profile", icon: Store },
    { id: "business", label: "Business Info", icon: Building },
    { id: "schedule", label: "Store Schedule", icon: Clock },
    { id: "payment", label: "Payment & Payouts", icon: CreditCard },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security", icon: Shield },
    { id: "support", label: "LIA Support", icon: Headphones },
    { id: "activity", label: "Settings Activity", icon: History },
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
        {(activeSection === "profile" || activeSection === "business" || activeSection === "notifications") && <button
          type="button"
          onClick={handleSave}
          disabled={saving || !activeSectionIsDirty}
          className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg hover:from-orange-600 hover:to-orange-700 transition flex items-center gap-2 text-sm disabled:opacity-50"
          aria-label="Save all settings"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save Changes"}
        </button>}
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
          <div className="sticky top-20 overflow-x-auto rounded-2xl border border-gray-100 bg-white p-3 shadow-sm lg:overflow-visible lg:p-4">
            <div className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={async () => {
                      if (section.id === activeSection) return;
                      if (activeSectionIsDirty) {
                        const leave = await confirm({
                          title: "Leave without saving?",
                          message: "Changes in this settings section have not been saved.",
                          confirmLabel: "Discard changes",
                          cancelLabel: "Keep editing",
                          destructive: true,
                        });
                        if (!leave) return;
                        const workspace = await storeWorkspaceClientService.getSettings(true);
                        setStoreData((current) => current && savableSection ? mergeSavedSection(current, workspace.store, savableSection) : workspace.store);
                        if (savableSection === "profile") setUserData(workspace.user);
                        if (savableSection) setSavedFingerprints((current) => current ? {...current, [savableSection]: sectionFingerprint(savableSection, workspace.store, workspace.user)} : current);
                      }
                      setActiveSection(section.id);
                    }}
                    className={`flex shrink-0 items-center justify-between rounded-xl px-3 py-2.5 text-sm transition lg:w-full ${
                      isActive
                        ? "bg-orange-50 text-orange-600 font-medium"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? "text-orange-600" : "text-gray-400"}`} />
                      <span>{section.label}</span>
                    </div>
                    <ChevronRight className={`hidden h-4 w-4 lg:block ${isActive ? "text-orange-600" : "text-gray-300"}`} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3 space-y-4">
          <div key={activeSection}>
            {activeSection === "profile" && (
              <ProfileSection 
                storeData={storeData}
                setStoreData={setStoreData}
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
              <SecuritySection />
            )}
            {activeSection === "activity" && <SettingsActivitySection />}
            {activeSection === "support" && <AccountSupportForm accountLabel="store" />}
            {activeSection === "danger" && (
              <DangerSection />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
