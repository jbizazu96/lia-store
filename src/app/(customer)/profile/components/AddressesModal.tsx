"use client";

/*
  React hooks.
*/
import {useState, useEffect} from "react";
import {motion} from "framer-motion";
import {X, Plus, Home, Briefcase, User, MapPin, Trash2, Edit2} from "lucide-react";
import {collection, getDocs, addDoc, updateDoc, deleteDoc, doc} from "firebase/firestore";
import {db} from "@/lib/firebase";
import {geocodeAddress} from "@/services/geocode";

interface AddressesModalProps {
  userId: string;
  onClose: () => void;
}

interface Address {
  id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
}

export function AddressesModal({userId, onClose}: AddressesModalProps) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    label: "Home",
    street: "",
    city: "",
    state: "",
    zip: "",
  });

  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAddresses();
  }, [userId]);

  async function fetchAddresses() {
    try {
      setLoading(true);
      const addressesRef = collection(db, "users", userId, "addresses");
      const snapshot = await getDocs(addressesRef);
      
      const addressesData: Address[] = [];
      snapshot.forEach((doc) => {
        addressesData.push({
          id: doc.id,
          ...doc.data(),
        } as Address);
      });
      
      setAddresses(addressesData);
    } catch (error) {
      console.error("Error fetching addresses:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!formData.street.trim() || !formData.city.trim() || 
        !formData.state.trim() || !formData.zip.trim()) {
      setFormError("Please fill in all fields");
      return;
    }

    try {
      setSubmitting(true);
      setFormError("");

      const fullAddress = `${formData.street}, ${formData.city}, ${formData.state} ${formData.zip}`;
      const location = await geocodeAddress(fullAddress);

      const addressData = {
        ...formData,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
        formattedAddress: location?.formattedAddress || fullAddress,
      };

      if (editingId) {
        await updateDoc(doc(db, "users", userId, "addresses", editingId), addressData);
      } else {
        await addDoc(collection(db, "users", userId, "addresses"), addressData);
      }

      setFormData({label: "Home", street: "", city: "", state: "", zip: ""});
      setShowAddForm(false);
      setEditingId(null);
      await fetchAddresses();

    } catch (error) {
      console.error("Error saving address:", error);
      setFormError("Failed to save address. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(addressId: string) {
    if (!confirm("Are you sure you want to delete this address?")) return;
    
    try {
      await deleteDoc(doc(db, "users", userId, "addresses", addressId));
      await fetchAddresses();
    } catch (error) {
      console.error("Error deleting address:", error);
    }
  }

  function handleEdit(address: Address) {
    setEditingId(address.id);
    setFormData({
      label: address.label,
      street: address.street,
      city: address.city,
      state: address.state,
      zip: address.zip,
    });
    setShowAddForm(true);
  }

  function getLabelIcon(label: string) {
    switch (label.toLowerCase()) {
      case "home": return Home;
      case "work": return Briefcase;
      case "friend": return User;
      default: return MapPin;
    }
  }

  function getLabelColor(label: string) {
    switch (label.toLowerCase()) {
      case "home": return "text-green-600 bg-green-50";
      case "work": return "text-blue-600 bg-blue-50";
      case "friend": return "text-purple-600 bg-purple-50";
      default: return "text-gray-600 bg-gray-50";
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
          <h2 className="text-xl font-bold text-gray-800">My Addresses</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition"
            aria-label="Close addresses"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {addresses.map((address) => {
                const Icon = getLabelIcon(address.label);
                const colorClass = getLabelColor(address.label);
                
                return (
                  <div key={address.id} className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colorClass}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">
                            {address.label}
                            {address.isDefault && (
                              <span className="ml-2 text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">
                                Default
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-gray-500">
                            {address.street}, {address.city}, {address.state} {address.zip}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEdit(address)}
                          className="p-1.5 hover:bg-gray-200 rounded-lg transition"
                          aria-label={`Edit ${address.label} address`}
                        >
                          <Edit2 className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => handleDelete(address.id)}
                          className="p-1.5 hover:bg-red-100 rounded-lg transition"
                          aria-label={`Delete ${address.label} address`}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {addresses.length === 0 && (
                <div className="text-center py-8">
                  <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No addresses saved</p>
                  <p className="text-sm text-gray-400">Add your first delivery address</p>
                </div>
              )}

              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full mt-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 font-medium hover:border-orange-400 hover:text-orange-600 transition flex items-center justify-center gap-2"
                  aria-label="Add new address"
                >
                  <Plus className="w-5 h-5" />
                  Add New Address
                </button>
              )}

              {showAddForm && (
                <form onSubmit={handleSubmit} className="mt-4 bg-gray-50 rounded-xl p-4 space-y-3">
                  <h3 className="font-semibold text-gray-800">
                    {editingId ? "Edit Address" : "Add New Address"}
                  </h3>

                  {formError && (
                    <div className="bg-red-50 text-red-600 p-2 rounded-lg text-sm">
                      {formError}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Label
                    </label>
                    <select
                      value={formData.label}
                      onChange={(e) => setFormData({...formData, label: e.target.value})}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="Home">Home</option>
                      <option value="Work">Work</option>
                      <option value="Friend">Friend</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Street Address
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
                        City
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
                        State
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
                      ZIP Code
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
                      onClick={() => {
                        setShowAddForm(false);
                        setEditingId(null);
                        setFormData({label: "Home", street: "", city: "", state: "", zip: ""});
                        setFormError("");
                      }}
                      className="flex-1 py-2 border border-gray-200 rounded-lg text-gray-600 font-medium hover:bg-gray-50 transition"
                      aria-label="Cancel adding address"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 transition disabled:opacity-50"
                      aria-label={editingId ? "Update address" : "Save address"}
                    >
                      {submitting ? "Saving..." : editingId ? "Update" : "Save"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}