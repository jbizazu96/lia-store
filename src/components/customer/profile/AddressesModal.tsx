"use client";

/*
  Simplified Addresses modal - Single address only.
  Shows existing address with Edit/Delete options.
  If no address, shows Add form.
*/

import {useState, useEffect} from "react";
import {motion} from "framer-motion";
import {X, MapPin, Trash2, Edit2, Check, AlertCircle, Plus} from "lucide-react";
import {doc, getDoc, setDoc, deleteDoc, collection, getDocs} from "firebase/firestore";
import {db} from "@/lib/firebase";
import {geocodeAddress} from "@/services/delivery/geocode";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { useConfirmation } from "@/context/ConfirmationContext";

interface AddressesModalProps {
  userId: string;
  onClose: () => void;
}

interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
}

export function AddressesModal({userId, onClose}: AddressesModalProps) {
  const [address, setAddress] = useState<Address | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    street: "",
    city: "",
    state: "",
    zip: "",
  });

  const savedFormData = {
    street: address?.street || "",
    city: address?.city || "",
    state: address?.state || "",
    zip: address?.zip || "",
  };

  const hasUnsavedChanges =
    isEditing &&
    JSON.stringify(formData) !== JSON.stringify(savedFormData);

  useUnsavedChanges(hasUnsavedChanges);
  const { confirm } = useConfirmation();

  async function handleClose() {
    const confirmed = !hasUnsavedChanges || await confirm({
      title: "Discard address changes?",
      message: "Your delivery address edits have not been saved.",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    onClose();
  }

  // Fetch address on mount
  useEffect(() => {
    if (userId) {
      fetchAddress();
    }
  }, [userId]);

  async function fetchAddress() {
    try {
      setLoading(true);
      console.log("🔍 Fetching address for user:", userId);
      
      // Try to get the address from the user's document first
      const userRef = doc(db, "users", userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log("📄 User data:", userData);
        
        // Check if address is stored directly in user document
        if (userData.defaultAddress) {
          console.log("📍 Found address in user document:", userData.defaultAddress);
          const addr = userData.defaultAddress;
          setAddress({
            street: addr.street || "",
            city: addr.city || "",
            state: addr.state || "",
            zip: addr.zip || "",
            latitude: addr.latitude,
            longitude: addr.longitude,
            formattedAddress: addr.formattedAddress,
          });
          setFormData({
            street: addr.street || "",
            city: addr.city || "",
            state: addr.state || "",
            zip: addr.zip || "",
          });
          setLoading(false);
          return;
        }
      }
      
      // If not in user document, check the addresses subcollection
      console.log("🔍 Checking addresses subcollection...");
      const addressesRef = collection(db, "users", userId, "addresses");
      const snapshot = await getDocs(addressesRef);
      
      if (!snapshot.empty) {
        // Get the first address (or the one marked as default)
        let foundAddress: any = null;
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.isDefault) {
            foundAddress = { id: doc.id, ...data };
          }
        });
        
        // If no default, use the first one
        if (!foundAddress) {
          const firstDoc = snapshot.docs[0];
          foundAddress = { id: firstDoc.id, ...firstDoc.data() };
        }
        
        console.log("📍 Found address in subcollection:", foundAddress);
        
        // ✅ Fix: Check if foundAddress has the properties before accessing them
        if (foundAddress && typeof foundAddress === 'object') {
          setAddress({
            street: foundAddress.street || "",
            city: foundAddress.city || "",
            state: foundAddress.state || "",
            zip: foundAddress.zip || "",
            latitude: foundAddress.latitude,
            longitude: foundAddress.longitude,
            formattedAddress: foundAddress.formattedAddress,
          });
          setFormData({
            street: foundAddress.street || "",
            city: foundAddress.city || "",
            state: foundAddress.state || "",
            zip: foundAddress.zip || "",
          });
        }
      } else {
        console.log("❌ No address found");
        setAddress(null);
      }
    } catch (error) {
      console.error("Error fetching address:", error);
      setError("Failed to load address");
    } finally {
      setLoading(false);
    }
  }

  // Handle submit (add or update)
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!formData.street.trim() || !formData.city.trim() || 
        !formData.state.trim() || !formData.zip.trim()) {
      setError("Please fill in all fields");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setSuccess("");

      // Geocode address
      const fullAddress = `${formData.street}, ${formData.city}, ${formData.state} ${formData.zip}`;
      const location = await geocodeAddress(fullAddress);

      if (!location) {
        setError(
          "We couldn't verify this delivery address. Check the street, city, state, and ZIP code, then try again."
        );
        return;
      }

      const confirmed = await confirm({
        title: address ? "Update delivery address?" : "Save delivery address?",
        message: "This verified address will be used for future deliveries.",
        confirmLabel: address ? "Update address" : "Save address",
        cancelLabel: "Keep editing",
      });

      if (!confirmed) return;

      const addressData: Address = {
        street: formData.street.trim().toUpperCase(),
        city: formData.city.trim().toUpperCase(),
        state: formData.state.trim().toUpperCase(),
        zip: formData.zip.trim().toUpperCase(),
        latitude: location.latitude,
        longitude: location.longitude,
        formattedAddress: location.formattedAddress.toUpperCase(),
      };

      // Save to both places for redundancy
      // 1. Save to user document
      await setDoc(doc(db, "users", userId), {
        defaultAddress: addressData,
      }, { merge: true });

      // 2. Save to addresses subcollection with ID "default"
      await setDoc(doc(db, "users", userId, "addresses", "default"), {
        ...addressData,
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setAddress(addressData);
      setSuccess(address ? "Address updated successfully!" : "Address added successfully!");
      setIsEditing(false);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(""), 3000);

    } catch (error) {
      console.error("Error saving address:", error);
      setError("Failed to save address. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Delete address
  async function handleDelete() {
    const confirmed = await confirm({
      title: "Delete delivery address?",
      message: "This saved delivery address will be permanently removed.",
      confirmLabel: "Delete address",
      cancelLabel: "Keep address",
      destructive: true,
    });

    if (!confirmed) return;
    
    try {
      // Remove from user document
      await setDoc(doc(db, "users", userId), {
        defaultAddress: null,
      }, { merge: true });

      // Remove from addresses subcollection
      await deleteDoc(doc(db, "users", userId, "addresses", "default"));
      
      setAddress(null);
      setSuccess("Address deleted successfully!");
      
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      console.error("Error deleting address:", error);
      setError("Failed to delete address");
    }
  }

  // Start editing
  function startEditing() {
    setIsEditing(true);
    setError("");
    setSuccess("");
  }

  // Cancel editing
  function cancelEditing() {
    setIsEditing(false);
    setError("");
    setSuccess("");
    if (address) {
      setFormData({
        street: address.street || "",
        city: address.city || "",
        state: address.state || "",
        zip: address.zip || "",
      });
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{opacity: 0, scale: 0.95}}
        animate={{opacity: 1, scale: 1}}
        exit={{opacity: 0, scale: 0.95}}
        className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Delivery Address</h2>
            <p className="text-sm text-gray-500">
              {loading ? "Loading..." : address ? "Your saved delivery address" : "Add your delivery address"}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition"
            aria-label="Close addresses"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              <p className="text-green-600 text-sm">{success}</p>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Address exists - Show it with Edit/Delete */}
              {address && !isEditing ? (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800">Your Delivery Address</p>
                      <p className="text-sm text-gray-600">
                        {address.street}, {address.city}, {address.state} {address.zip}
                      </p>
                      {address.formattedAddress && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          📍 {address.formattedAddress}
                        </p>
                      )}
                      <p className="text-xs text-green-600 mt-1 font-medium">
                        ✓ This address will be used for delivery
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200">
                    <button
                      onClick={startEditing}
                      className="flex-1 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition flex items-center justify-center gap-2"
                      aria-label="Edit address"
                    >
                      <Edit2 className="w-4 h-4" />
                      Update Address
                    </button>
                    <button
                      onClick={handleDelete}
                      className="px-4 py-2 border border-red-200 text-red-600 rounded-lg font-medium hover:bg-red-50 transition flex items-center gap-2"
                      aria-label="Delete address"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : address && isEditing ? (
                // Edit form
                <form onSubmit={handleSubmit} className="bg-orange-50 rounded-xl p-4 space-y-3 border border-orange-200">
                  <h3 className="font-semibold text-gray-800">Update Your Address</h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Street Address *
                    </label>
                    <input
                      type="text"
                      value={formData.street}
                      onChange={(e) => setFormData({...formData, street: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                      placeholder="123 Main St"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        City *
                      </label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData({...formData, city: e.target.value})}
                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                        placeholder="Los Angeles"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        State *
                      </label>
                      <input
                        type="text"
                        value={formData.state}
                        onChange={(e) => setFormData({...formData, state: e.target.value})}
                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                        placeholder="CA"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ZIP Code *
                    </label>
                    <input
                      type="text"
                      value={formData.zip}
                      onChange={(e) => setFormData({...formData, zip: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                      placeholder="90210"
                      required
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="flex-1 py-2 border border-gray-200 rounded-lg text-gray-600 font-medium hover:bg-gray-50 transition"
                      aria-label="Cancel editing"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-2 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition disabled:opacity-50"
                      aria-label="Update address"
                    >
                      {submitting ? "Saving..." : "Update Address"}
                    </button>
                  </div>
                </form>
              ) : (
                // No address - Add form
                <form onSubmit={handleSubmit} className="bg-orange-50 rounded-xl p-4 space-y-3 border border-orange-200">
                  <div className="text-center mb-2">
                    <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <h3 className="font-semibold text-gray-800">Add Your Delivery Address</h3>
                    <p className="text-sm text-gray-500">
                      This helps us calculate delivery distances and fees
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Street Address *
                    </label>
                    <input
                      type="text"
                      value={formData.street}
                      onChange={(e) => setFormData({...formData, street: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                      placeholder="123 Main St"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        City *
                      </label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData({...formData, city: e.target.value})}
                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                        placeholder="Los Angeles"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        State *
                      </label>
                      <input
                        type="text"
                        value={formData.state}
                        onChange={(e) => setFormData({...formData, state: e.target.value})}
                        className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                        placeholder="CA"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ZIP Code *
                    </label>
                    <input
                      type="text"
                      value={formData.zip}
                      onChange={(e) => setFormData({...formData, zip: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                      placeholder="90210"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    aria-label="Save address"
                  >
                    <Plus className="w-4 h-4" />
                    {submitting ? "Saving..." : "Save Address"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
