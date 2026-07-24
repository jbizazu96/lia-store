"use client";

/*
  React hooks.
*/
import {useState} from "react";
import {motion} from "framer-motion";
import {X, User, Mail, Phone, Save} from "lucide-react";
import {setDoc, doc} from "firebase/firestore";
import {updateProfile} from "firebase/auth";
import {auth, db} from "@/lib/firebase";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { useConfirmation } from "@/context/ConfirmationContext";
import {formatPhoneNumber} from "@/utils/phone";
import {useSuccessToast} from "@/context/SuccessToastContext";

interface EditProfileModalProps {
  userData: any;
  onClose: () => void;
  onUpdate: (data: any) => void;
}

export function EditProfileModal({userData, onClose, onUpdate}: EditProfileModalProps) {
  const {showSuccess} = useSuccessToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    displayName: userData?.displayName || "",
    email: userData?.email || "",
    phone: userData?.phone || "",
  });

  const [isEditing, setIsEditing] = useState({
    name: false,
    email: false,
    phone: false,
  });

  const hasUnsavedChanges =
    formData.displayName !== (userData?.displayName || "") ||
    formData.email !== (userData?.email || "") ||
    formData.phone !== (userData?.phone || "");

  useUnsavedChanges(hasUnsavedChanges);
  const { confirm } = useConfirmation();

  async function handleClose() {
    const confirmed = !hasUnsavedChanges || await confirm({
      title: "Discard profile changes?",
      message: "Your profile edits have not been saved.",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const confirmed = await confirm({
      title: "Save profile changes?",
      message: "Your updated profile information will be saved.",
      confirmLabel: "Save changes",
      cancelLabel: "Keep editing",
    });

    if (!confirmed) return;
    
    try {
      setLoading(true);
      setError("");

      const user = auth.currentUser;
      if (!user) throw new Error("No user logged in");

      const displayName = formData.displayName.trim();
      const phone = formatPhoneNumber(formData.phone);

      // Update Firebase Auth profile
      if (displayName !== userData?.displayName) {
        await updateProfile(user, {
          displayName,
        });
      }

      // Update Firestore
      const updateData: any = {
        // Migrates legacy profiles that were created without a UID field.
        uid: user.uid,
      };
      if (displayName !== userData?.displayName) {
        updateData.displayName = displayName;
      }
      if (phone !== userData?.phone) {
        updateData.phone = phone;
      }

      if (Object.keys(updateData).length > 0) {
        await setDoc(
          doc(db, "users", user.uid),
          updateData,
          {merge: true}
        );
      }

      onUpdate({
        ...formData,
        displayName,
        phone,
      });
      showSuccess("Profile updated successfully.");
      onClose();

    } catch (error: any) {
      console.error(error);
      setError(error.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  }

  function toggleEdit(field: keyof typeof isEditing) {
    setIsEditing(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{opacity: 0, scale: 0.95}}
        animate={{opacity: 1, scale: 1}}
        exit={{opacity: 0, scale: 0.95}}
        className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">Edit Profile</h2>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Display Name
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  placeholder="Your name"
                  disabled={!isEditing.name}
                />
              </div>
              <button
                type="button"
                onClick={() => toggleEdit("name")}
                className="px-3 py-2 text-sm text-orange-600 font-medium hover:bg-orange-50 rounded-lg transition"
                aria-label={isEditing.name ? "Done editing name" : "Edit name"}
              >
                {isEditing.name ? "Done" : "Edit"}
              </button>
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  placeholder="your@email.com"
                  disabled={!isEditing.email}
                />
              </div>
              <button
                type="button"
                onClick={() => toggleEdit("email")}
                className="px-3 py-2 text-sm text-orange-600 font-medium hover:bg-orange-50 rounded-lg transition"
                aria-label={isEditing.email ? "Done editing email" : "Edit email"}
              >
                {isEditing.email ? "Done" : "Edit"}
              </button>
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: formatPhoneNumber(e.target.value)})}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  placeholder="(123) 456 - 7890"
                  disabled={!isEditing.phone}
                />
              </div>
              <button
                type="button"
                onClick={() => toggleEdit("phone")}
                className="px-3 py-2 text-sm text-orange-600 font-medium hover:bg-orange-50 rounded-lg transition"
                aria-label={isEditing.phone ? "Done editing phone" : "Edit phone"}
              >
                {isEditing.phone ? "Done" : "Edit"}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition"
              aria-label="Cancel editing"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
              aria-label="Save profile changes"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
