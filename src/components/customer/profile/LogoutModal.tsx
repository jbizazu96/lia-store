"use client";

import {useState} from "react";
import {motion} from "framer-motion";
import {LogOut} from "lucide-react";
import {useRouter} from "next/navigation";
import {customerLogoutService} from "@/services/auth/customerLogoutService";

interface LogoutModalProps {
  onClose: () => void;
}

export function LogoutModal({onClose}: LogoutModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    try {
      setLoading(true);
      await customerLogoutService.logout();
      router.push("/login");
    } catch (error) {
      console.error("Error logging out:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{opacity: 0, scale: 0.95}}
        animate={{opacity: 1, scale: 1}}
        exit={{opacity: 0, scale: 0.95}}
        className="bg-white rounded-3xl max-w-sm w-full p-6"
      >
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <LogOut className="w-8 h-8 text-red-600" />
          </div>
          
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            Logout?
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            Are you sure you want to sign out of your account?
          </p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-full border border-gray-200 py-3 font-medium text-gray-600 transition hover:bg-gray-50"
              disabled={loading}
              aria-label="Cancel logout"
            >
              Cancel
            </button>
            <button
              onClick={handleLogout}
              disabled={loading}
              className="flex-1 rounded-full bg-red-600 py-3 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              aria-label="Confirm logout"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
              ) : (
                "Logout"
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
