"use client";

import {memo} from "react";
import {motion} from "framer-motion";
import {Store, MapPin, Phone, Mail} from "lucide-react";

interface Step1StoreInfoProps {
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  address: string;
  setAddress: (value: string) => void;
  city: string;
  setCity: (value: string) => void;
  state: string;
  setState: (value: string) => void;
  zip: string;
  setZip: (value: string) => void;
  formatPhone: (value: string) => string;
}

export const Step1StoreInfo = memo(({
  name,
  setName,
  description,
  setDescription,
  phone,
  setPhone,
  email,
  setEmail,
  address,
  setAddress,
  city,
  setCity,
  state,
  setState,
  zip,
  setZip,
  formatPhone,
}: Step1StoreInfoProps) => (
  <motion.div
    initial={{opacity: 0, x: 20}}
    animate={{opacity: 1, x: 0}}
    exit={{opacity: 0, x: -20}}
    className="space-y-4"
  >
    <h2 className="text-xl font-bold text-gray-800">Store Information</h2>
    <p className="text-gray-500 text-sm">Tell us about your African grocery store</p>

    {/* Store Name */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Store Name *</label>
      <div className="relative">
        <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
          placeholder="African Grocery Store"
        />
      </div>
    </div>

    {/* Description */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Store Description *</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
        placeholder="What makes your store special?"
      />
    </div>

    {/* Phone & Email */}
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
            placeholder="(123) 456 - 7890"
            maxLength={18}
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
            placeholder="store@email.com"
          />
        </div>
      </div>
    </div>

    {/* Address */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
          placeholder="123 Main St"
        />
      </div>
    </div>

    {/* City, State, ZIP */}
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
          placeholder="Los Angeles"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
        <input
          type="text"
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
          placeholder="CA"
        />
      </div>
    </div>

    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code *</label>
      <input
        type="text"
        value={zip}
        onChange={(e) => setZip(e.target.value)}
        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
        placeholder="90210"
      />
    </div>
  </motion.div>
));

Step1StoreInfo.displayName = "Step1StoreInfo";