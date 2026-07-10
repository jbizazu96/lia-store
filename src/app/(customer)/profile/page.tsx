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
import {ProfileHeader} from "@/app/(customer)/profile/components/ProfileHeader";
import {ProfileMenuItem} from "@/app/(customer)/profile/components/ProfileMenuItem";
import {EditProfileModal} from "@/app/(customer)/profile/components/EditProfileModal";
import {AddressesModal} from "@/app/(customer)/profile/components/AddressesModal";
import {LanguageModal} from "@/app/(customer)/profile/components/LanguageModal";
import {SecurityModal} from "@/app/(customer)/profile/components/SecurityModal";
import {LogoutModal} from "@/app/(customer)/profile/components/LogoutModal";
import {DeleteAccountModal} from "@/app/(customer)/profile/components/DeleteAccountModal";

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

  /* ==========================================
     BRANDED LOADING SCREEN - WHITE THEME
  ========================================== */
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-center items-center relative overflow-hidden">
        
        {/* Ambient Glows (Soft Yellow accents on white background) */}
        <div className="absolute top-0 right-0 h-[500px] w-[500px] rounded-full bg-yellow-400/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-blue-500/5 blur-[100px] pointer-events-none" />

        {/* Centered Loader */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center p-8 relative z-10"
        >
          
          {/* Logo Orbiting Container */}
          <div className="relative w-28 h-28 mb-8 flex items-center justify-center">
            
            {/* Dotted Orbit Ring */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-full border-2 border-dashed border-yellow-400/30"
            />
            
            {/* Inner Ring */}
            <motion.div 
              animate={{ rotate: -360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute inset-2 rounded-full border border-yellow-400/10"
            />
            
            {/* Rotating glowing dots */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.8)]" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400/40" />
              <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400/40" />
              <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400/40" />
            </motion.div>

            {/* Central Logo Image */}
            <div className="relative w-16 h-16 z-10 bg-white/80 backdrop-blur-md rounded-full border-2 border-yellow-400/50 shadow-[0_0_30px_rgba(234,179,8,0.15)] flex items-center justify-center overflow-hidden">
              <img 
                src="/icon/icon-192.png" 
                alt="LIA Logo" 
                className="w-12 h-12 object-contain" 
              />
            </div>
          </div>

          {/* Loading Text */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="text-center"
          >
            <h3 className="text-lg font-medium text-gray-600 mb-1 tracking-wide opacity-100">
              Loading profile
            </h3>
            <div className="flex items-center justify-center gap-1 mt-2">
              
              {/* Dot 1 */}
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0 }} 
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
              
              {/* Dot 2 */}
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }} 
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
              
              {/* Dot 3 */}
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }} 
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
            </div>
          </motion.div>
          
        </motion.div>
      </div>
    );
  }

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
          displayName={userData?.displayName || user?.email?.split("@")[0] || "User"}
          email={user?.email || ""}
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
            userData={userData}
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
            currentLanguage={userData?.language || "English"}
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