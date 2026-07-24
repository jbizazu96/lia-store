"use client";

/*
  React hooks.
*/
import {useState, useEffect} from "react";
import {useRouter} from "next/navigation";
import {motion, AnimatePresence} from "framer-motion";
import {onAuthStateChanged} from "firebase/auth";
import {doc, getDoc} from "firebase/firestore";
import {auth, db} from "@/lib/firebase";
import {ArrowLeft, User, MapPin, Globe, FileText, Shield, LogOut, Trash2} from "lucide-react";

/*
  Components.
*/
import {ProfileHeader} from "@/components/customer/profile/ProfileHeader";
import {ProfileMenuItem} from "@/components/customer/profile/ProfileMenuItem";
import {EditProfileModal} from "@/components/customer/profile/EditProfileModal";
import {AddressesModal} from "@/components/customer/profile/AddressesModal";
import {LanguageModal} from "@/components/customer/profile/LanguageModal";
import {SecurityModal} from "@/components/customer/profile/SecurityModal";
import {LogoutModal} from "@/components/customer/profile/LogoutModal";
import {DeleteAccountModal} from "@/components/customer/profile/DeleteAccountModal";
import { BrandedLoader } from "@/components/ui/BrandedLoader";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  /*
    Modal states.
  */
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showAddresses, setShowAddresses] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

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
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

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
      description: "English, French, Swahili",
      onClick: () => setShowLanguage(true),
    },
    {
      icon: FileText,
      label: "Legal",
      description: "Policies and legal documents",
      onClick: () => router.push("/legal"),
    },
    {
      icon: Shield,
      label: "Security",
      description: "Change your password",
      onClick: () => setShowSecurity(true),
    },
  ];

  if (loading) {
    return <BrandedLoader message="Loading Profile" />;
  }

  const profileData = {
    ...userData,
    displayName:
      userData?.displayName ||
      user?.displayName ||
      user?.email?.split("@")[0] ||
      "User",
    email: userData?.email || user?.email || "",
    phone: userData?.phone || user?.phoneNumber || "",
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header with Back Button */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="flex items-center gap-3 px-4 py-4 max-w-lg mx-auto">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-full transition"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Profile</h1>
        </div>
      </div>

      {/* Profile Content */}
      <div className="max-w-lg mx-auto">
        <ProfileHeader 
          displayName={profileData.displayName}
          email={profileData.email}
        />

        {/* Menu Items */}
        <div className="px-4 space-y-1 pb-8">
          {menuItems.map((item, index) => (
            <ProfileMenuItem
              key={index}
              icon={item.icon}
              label={item.label}
              description={item.description}
              onClick={item.onClick}
            />
          ))}

          {/* Divider */}
          <div className="h-px bg-gray-200 my-2" />

          {/* Logout */}
          <ProfileMenuItem
            icon={LogOut}
            label="Logout"
            description="Sign out of your account"
            onClick={() => setShowLogout(true)}
            variant="danger"
          />

          {/* Delete Account */}
          <ProfileMenuItem
            icon={Trash2}
            label="Delete account"
            description="Permanently delete your account"
            onClick={() => setShowDeleteAccount(true)}
            variant="danger"
          />
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showEditProfile && (
          <EditProfileModal
            userData={profileData}
            onClose={() => setShowEditProfile(false)}
            onUpdate={(data) => setUserData({...userData, ...data})}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddresses && (
          <AddressesModal
            userId={user?.uid}
            onClose={() => setShowAddresses(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLanguage && (
          <LanguageModal
            currentLanguage={profileData.language || "English"}
            onClose={() => setShowLanguage(false)}
            onSelect={(lang) => {
              setUserData({...userData, language: lang});
            }}
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
    </main>
  );
}
