"use client";

/*
  Address collection modal for customers.
*/

import {motion} from "framer-motion";

interface AddressModalProps {
  isOpen: boolean;
  addressData: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  setAddressData: (data: any) => void;
  addressLoading: boolean;
  addressError: string;
  addressGeocoding: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function AddressModal({
  isOpen,
  addressData,
  setAddressData,
  addressLoading,
  addressError,
  addressGeocoding,
  onSubmit,
  onClose,
}: AddressModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{opacity: 0, scale: 0.95}}
        animate={{opacity: 1, scale: 1}}
        exit={{opacity: 0, scale: 0.95}}
        className="bg-white rounded-3xl max-w-md w-full p-8 relative max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Enter Your Delivery Address
        </h2>
        <p className="text-gray-500 mb-6 text-sm">
          Please provide your delivery address. This helps us calculate accurate
          delivery distances and prices between you and our stores.
        </p>

        {addressError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <p className="text-red-600 text-sm">{addressError}</p>
          </div>
        )}

        {addressGeocoding && (
          <div className="flex items-center gap-3 text-sm text-green-600 bg-green-50 p-3 rounded-xl mb-4">
            <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            <span>Verifying your address location...</span>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Street Address *
            </label>
            <input
              type="text"
              value={addressData.street}
              onChange={(e) => setAddressData({...addressData, street: e.target.value})}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
              placeholder="123 Main St"
              required
              disabled={addressGeocoding}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City *
            </label>
            <input
              type="text"
              value={addressData.city}
              onChange={(e) => setAddressData({...addressData, city: e.target.value})}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
              placeholder="Los Angeles"
              required
              disabled={addressGeocoding}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                State *
              </label>
              <input
                type="text"
                value={addressData.state}
                onChange={(e) => setAddressData({...addressData, state: e.target.value})}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                placeholder="CA"
                required
                disabled={addressGeocoding}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ZIP Code *
              </label>
              <input
                type="text"
                value={addressData.zip}
                onChange={(e) => setAddressData({...addressData, zip: e.target.value})}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                placeholder="90210"
                required
                disabled={addressGeocoding}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Country
            </label>
            <select
              value={addressData.country}
              onChange={(e) => setAddressData({...addressData, country: e.target.value})}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
              disabled={addressGeocoding}
            >
              <option value="US">United States</option>
              <option value="CA">Canada</option>
              <option value="UK">United Kingdom</option>
            </select>
          </div>

          <motion.button
            whileTap={{scale: 0.97}}
            type="submit"
            disabled={addressLoading || addressGeocoding}
            className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-3 rounded-xl font-semibold hover:shadow-lg hover:from-green-700 hover:to-green-800 transition disabled:opacity-50"
          >
            {addressLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
            ) : (
              "Save Address & Continue"
            )}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}