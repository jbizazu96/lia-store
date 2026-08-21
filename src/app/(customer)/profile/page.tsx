"use client";

/*
  React hooks.
*/
import {useState, useEffect} from "react";
import {useRouter} from "next/navigation";
import dynamic from "next/dynamic";
import {AnimatePresence} from "framer-motion";
import {onAuthStateChanged, type User as FirebaseUser} from "firebase/auth";
import {auth} from "@/lib/firebase";
import {User, MapPin, MapPinned, Globe, FileText, Shield, LogOut, Trash2, Bell} from "lucide-react";
import {
  customerProfileClientService,
  updateCustomerNotificationPreferences,
  type CustomerProfile,
} from "@/services/user/customerProfileClientService";

/*
  Components.
*/
import {ProfileHeader} from "@/components/customer/profile/ProfileHeader";
import {ProfileMenuItem} from "@/components/customer/profile/ProfileMenuItem";
import { CustomerPageState } from "@/components/customer/ui/CustomerPageState";
import { CustomerPageSkeleton } from "@/components/customer/ui/CustomerPageSkeleton";
import { CustomerBottomNavigation } from "@/components/customer/navigation/CustomerBottomNavigation";
import {
  firebaseMessaging,
  NATIVE_NOTIFICATION_STATE_EVENT,
  type NativeNotificationPreference,
  type NotificationDeviceStatus,
  type NotificationPermissionState,
} from "@/services/notification/firebaseMessaging";

const EditProfileModal = dynamic(() => import("@/components/customer/profile/EditProfileModal").then((m) => m.EditProfileModal), {ssr: false});
const AddressesModal = dynamic(() => import("@/components/customer/profile/AddressesModal").then((m) => m.AddressesModal), {ssr: false});
const LanguageModal = dynamic(() => import("@/components/customer/profile/LanguageModal").then((m) => m.LanguageModal), {ssr: false});
const SecurityModal = dynamic(() => import("@/components/customer/profile/SecurityModal").then((m) => m.SecurityModal), {ssr: false});
const LogoutModal = dynamic(() => import("@/components/customer/profile/LogoutModal").then((m) => m.LogoutModal), {ssr: false});
const DeleteAccountModal = dynamic(() => import("@/components/customer/profile/DeleteAccountModal").then((m) => m.DeleteAccountModal), {ssr: false});
const NotificationSettingsModal = dynamic(() => import("@/components/customer/profile/NotificationSettingsModal").then((m) => m.NotificationSettingsModal), {ssr: false});

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);
  const [profileImagePreview, setProfileImagePreview] = useState("");

  /*
    Modal states.
  */
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showAddresses, setShowAddresses] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>("prompt");
  const [nativeNotificationPreference, setNativeNotificationPreference] =
    useState<NativeNotificationPreference>(null);
  const [notificationDeviceStatus, setNotificationDeviceStatus] =
    useState<NotificationDeviceStatus | null>(null);
  const [notificationStatusLoading, setNotificationStatusLoading] = useState(false);

  /*
    Get current user and profile data.
  */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.push("/login");
        return;
      }

      setUser(currentUser);
      
      try {
        setUserData(await customerProfileClientService.getProfile());
      } catch (error) {
        console.error("Error fetching user data:", error);
        setProfileError("We couldn’t load your profile. Please try again.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    const refresh = async () => {
      setNativeNotificationPreference(firebaseMessaging.getNativePreference());
      setNotificationStatusLoading(true);
      try {
        const [permission, status] = await Promise.all([
          firebaseMessaging.getPermissionStatus(),
          firebaseMessaging.getDeviceStatus(),
        ]);
        setNotificationPermission(permission);
        setNotificationDeviceStatus(status);
      } catch {
        setNotificationPermission(await firebaseMessaging.getPermissionStatus()
          .catch(() => "unsupported" as const));
        setNotificationDeviceStatus(null);
      } finally {
        setNotificationStatusLoading(false);
      }
    };
    void refresh();
    const handleRefresh = () => void refresh();
    window.addEventListener(NATIVE_NOTIFICATION_STATE_EVENT, handleRefresh);
    return () => window.removeEventListener(NATIVE_NOTIFICATION_STATE_EVENT, handleRefresh);
  }, [user]);

  async function enableNotifications() {
    await firebaseMessaging.enableNativeNotifications();
    setNativeNotificationPreference(firebaseMessaging.getNativePreference());
    setNotificationPermission(
      await firebaseMessaging.getPermissionStatus(),
    );
    setNotificationDeviceStatus(await firebaseMessaging.getDeviceStatus());
  }

  async function declineNotifications() {
    await firebaseMessaging.declineNativeNotifications();
    setNativeNotificationPreference(firebaseMessaging.getNativePreference());
    setNotificationPermission(await firebaseMessaging.getPermissionStatus());
    setNotificationDeviceStatus(await firebaseMessaging.getDeviceStatus());
  }

  async function sendTestNotification() {
    try {
      await firebaseMessaging.sendTestNotification();
    } finally {
      setNotificationDeviceStatus(await firebaseMessaging.getDeviceStatus());
    }
  }

  async function handleProfileImageUpload(file: File) {
    const previewUrl = URL.createObjectURL(file);

    try {
      setUploadingProfileImage(true);
      setProfileImagePreview(previewUrl);
      await customerProfileClientService.uploadProfileImage(file);

      /* The Function writes the optimized URL asynchronously after resize. */
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const updatedProfile = await customerProfileClientService.getProfile(true);

        if (updatedProfile.profileImageStatus === "ready") {
          setUserData(updatedProfile);
          setProfileImagePreview("");
          return;
        }
      }
    } catch (error) {
      console.error("Unable to upload profile image:", error);
      setProfileImagePreview("");
    } finally {
      setUploadingProfileImage(false);
    }
  }

  /*
    Menu items configuration.
  */
  const menuItems = [
    {
      icon: User,
      label: "Personal",
      description: "Name, email, phone number",
      onClick: () => setShowEditProfile(true),
    },
    {
      icon: MapPin,
      label: "Addresses",
      description: "Manage your delivery addresses",
      onClick: () => setShowAddresses(true),
    },
    {
      icon: Globe,
      label: "Language",
      description: "English · More languages coming soon",
      onClick: () => setShowLanguage(true),
    },
    {
      icon: FileText,
      label: "Legal",
      description: "Policies and legal documents",
      onClick: () => router.push("/legal?returnTo=%2Fprofile"),
    },
    {
      icon: Shield,
      label: "Security",
      description: "Change your password",
      onClick: () => setShowSecurity(true),
    },
  ];

  if (loading) {
    return <CustomerPageSkeleton variant="profile" />;
  }

  if (profileError && !userData) {
    return (
      <main className="min-h-screen bg-white">
        <CustomerPageState
          kind="error"
          title="We couldn’t load your profile"
          description={profileError}
          action={{
            label: "Try again",
            onClick: () => window.location.reload(),
          }}
        />
      </main>
    );
  }

  const profileData: CustomerProfile = {
    displayName:
      userData?.displayName ||
      user?.displayName ||
      user?.email?.split("@")[0] ||
      "User",
    email: userData?.email || user?.email || "",
    phone: userData?.phone || user?.phoneNumber || "",
    language: userData?.language || "English",
    profileImageUrl: userData?.profileImageUrl || "",
    profileImageStatus: userData?.profileImageStatus || "idle",
    defaultAddress: userData?.defaultAddress || null,
    recentSearches: userData?.recentSearches || [],
    notificationPreferences: userData?.notificationPreferences || {
      orderUpdates: true,
      promotions: true,
      storeUpdates: true,
      productUpdates: true,
      marketing: true,
    },
    deliveryZones: userData?.deliveryZones || {homeZone: null, orderZones: []},
  };

  const personalItems = menuItems.slice(0, 3);
  const accountItems = menuItems.slice(3);
  const deliveryAddressLabel = profileData.defaultAddress
    ? [
        profileData.defaultAddress.street,
        profileData.defaultAddress.city,
      ].filter(Boolean).join(", ")
    : "Add a delivery address";

  return (
    <main className="min-h-screen bg-white pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg justify-center px-4 py-4">
          <h1 className="text-xl font-extrabold tracking-tight text-gray-900">Profile</h1>
        </div>
      </div>

      {/* Profile Content */}
      <div className="max-w-lg mx-auto">
        <ProfileHeader 
          displayName={profileData.displayName}
          email={profileData.email}
          profileImageUrl={profileImagePreview || profileData.profileImageUrl}
          isUploadingImage={uploadingProfileImage}
          onSelectProfileImage={handleProfileImageUpload}
        />

        <div className="space-y-6 px-4 pb-8">
          <button
            type="button"
            onClick={() => setShowAddresses(true)}
            className="flex w-full items-center gap-3 rounded-2xl border border-orange-100 bg-gradient-to-r from-white/85 to-orange-50/70 p-4 text-left shadow-sm transition hover:border-orange-200"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
              <MapPin className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold uppercase tracking-wide text-orange-700">Delivering to</span>
              <span className="mt-1 block truncate text-sm font-bold text-gray-800">{deliveryAddressLabel}</span>
            </span>
            <span className="text-xs font-bold text-orange-600">Change</span>
          </button>

          <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600"><MapPinned className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-extrabold text-gray-900">Your delivery zones</h2>
                <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-500">Home delivery zone</p>
                <p className="mt-1 text-sm font-semibold text-gray-800">{profileData.deliveryZones.homeZone?.name || "Default distance-based pricing"}</p>
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">Approved Order Zones</p>
                {profileData.deliveryZones.orderZones.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">{profileData.deliveryZones.orderZones.map((zone) => <span key={zone.id} className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">{zone.name}</span>)}</div>
                ) : <p className="mt-1 text-sm text-gray-600">You do not have additional Order Zones.</p>}
                <p className="mt-3 text-xs leading-5 text-gray-500">Zone assignments are managed by LIA and cannot be edited from your account. Need to shop in another area?</p>
                <button type="button" onClick={() => router.push("/help?request=order-zone")} className="mt-2 text-sm font-extrabold text-orange-600 hover:text-orange-700">Contact LIA Support</button>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between px-1">
              <div>
                <h2 className="text-base font-extrabold text-gray-900">Personal details</h2>
                <p className="mt-0.5 text-xs text-gray-500">Your account and delivery preferences</p>
              </div>
            </div>
            <div className="space-y-2">
              {personalItems.map((item, index) => (
                <ProfileMenuItem
                  key={index}
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                  onClick={item.onClick}
                />
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 px-1">
              <h2 className="text-base font-extrabold text-gray-900">Updates & account</h2>
              <p className="mt-0.5 text-xs text-gray-500">Control alerts, security, and legal settings</p>
            </div>
            <div className="space-y-2">
              {accountItems.map((item, index) => (
                <ProfileMenuItem
                  key={index}
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                  onClick={item.onClick}
                />
              ))}

              <ProfileMenuItem
                icon={Bell}
                label="Notification settings"
                description={
                  notificationPermission === "granted" &&
                  notificationDeviceStatus?.registered === true &&
                  notificationDeviceStatus.active === true
                    ? "Choose order, store, product, promotion, and marketing updates"
                    : notificationPermission === "granted"
                      ? "Notification registration needs attention"
                    : notificationPermission === "denied"
                      ? "Manage notification types and device permission"
                      : notificationPermission === "unsupported"
                        ? "Manage notification types"
                        : "Choose updates and enable device notifications"
                }
                onClick={() => setShowNotificationSettings(true)}
              />
            </div>
          </section>

          <section>
            <div className="mb-3 px-1">
              <h2 className="text-base font-extrabold text-gray-900">Account access</h2>
              <p className="mt-0.5 text-xs text-gray-500">Sign out or request account deletion</p>
            </div>
            <div className="space-y-2">
              <ProfileMenuItem
                icon={LogOut}
                label="Logout"
                description="Sign out of your account"
                onClick={() => setShowLogout(true)}
                variant="danger"
              />
              <ProfileMenuItem
                icon={Trash2}
                label="Delete account"
                description="Request account deletion for admin approval"
                onClick={() => setShowDeleteAccount(true)}
                variant="danger"
              />
            </div>
          </section>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showEditProfile && (
          <EditProfileModal
            userData={profileData}
            onClose={() => setShowEditProfile(false)}
            onUpdate={setUserData}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddresses && (
          <AddressesModal
            onClose={() => setShowAddresses(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLanguage && (
          <LanguageModal
            onClose={() => setShowLanguage(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSecurity && (
          <SecurityModal
            onClose={() => setShowSecurity(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLogout && (
          <LogoutModal
            onClose={() => setShowLogout(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteAccount && (
          <DeleteAccountModal
            onClose={() => setShowDeleteAccount(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNotificationSettings && (
          <NotificationSettingsModal
            preferences={profileData.notificationPreferences}
            permission={notificationPermission}
            devicePreference={nativeNotificationPreference}
            deviceStatus={notificationDeviceStatus}
            statusLoading={notificationStatusLoading}
            onClose={() => setShowNotificationSettings(false)}
            onEnableDeviceNotifications={enableNotifications}
            onDeclineDeviceNotifications={declineNotifications}
            onSendTestNotification={sendTestNotification}
            onSave={async (preferences) => {
              const saved = await updateCustomerNotificationPreferences(
                preferences,
              );

              setUserData((current) => current
                ? {...current, notificationPreferences: saved}
                : current);

              return saved;
            }}
          />
        )}
      </AnimatePresence>

      <CustomerBottomNavigation />
    </main>
  );
}
