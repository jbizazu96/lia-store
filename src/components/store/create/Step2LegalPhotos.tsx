"use client";

import {memo, useRef} from "react";
import {motion} from "framer-motion";
import {
  Upload, Building, FileText, Camera,
  Store as StoreIcon, User
} from "lucide-react";

interface Step2LegalPhotosProps {
  businessType: string;
  setBusinessType: (value: string) => void;
  registeredName: string;
  setRegisteredName: (value: string) => void;
  ein: string;
  setEin: (value: string) => void;
  businessStructure: string;
  setBusinessStructure: (value: string) => void;
  logoPreview: string;
  handleLogoUpload: (file: File | null) => void;
  photoIdPreview: string;
  handlePhotoIdUpload: (file: File | null) => void;
  storeFrontPreview: string;
  handleStoreFrontUpload: (file: File | null) => void;
  storeInsidePreview: string;
  handleStoreInsideUpload: (file: File | null) => void;
}

export const Step2LegalPhotos = memo(({
  businessType,
  setBusinessType,
  registeredName,
  setRegisteredName,
  ein,
  setEin,
  businessStructure,
  setBusinessStructure,
  logoPreview,
  handleLogoUpload,
  photoIdPreview,
  handlePhotoIdUpload,
  storeFrontPreview,
  handleStoreFrontUpload,
  storeInsidePreview,
  handleStoreInsideUpload,
}: Step2LegalPhotosProps) => {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const photoIdInputRef = useRef<HTMLInputElement>(null);
  const storeFrontInputRef = useRef<HTMLInputElement>(null);
  const storeInsideInputRef = useRef<HTMLInputElement>(null);

  return (
    <motion.div
      initial={{opacity: 0, x: 20}}
      animate={{opacity: 1, x: 0}}
      exit={{opacity: 0, x: -20}}
      className="space-y-4"
    >
      <h2 className="text-xl font-bold text-gray-800">Legal & Photos</h2>
      <p className="text-gray-500 text-sm">Complete your store profile with legal info and photos</p>

      {/* Business Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Business Type *</label>
        <select
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
        >
          <option value="">Select business type</option>
          <option value="african_grocery">African Grocery Store</option>
          <option value="african_restaurant">African Restaurant</option>
          <option value="home_based">Home-Based Business</option>
          <option value="african_market">African Market</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Registered Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Registered Business Name *</label>
        <div className="relative">
          <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={registeredName}
            onChange={(e) => setRegisteredName(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
            placeholder="Your official business name"
          />
        </div>
      </div>

      {/* EIN & Structure */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">EIN (Optional)</label>
          <div className="relative">
            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={ein}
              onChange={(e) => setEin(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
              placeholder="12-3456789"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Business Structure *</label>
          <select
            value={businessStructure}
            onChange={(e) => setBusinessStructure(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
          >
            <option value="">Select structure</option>
            <option value="llc">LLC</option>
            <option value="sole_proprietorship">Sole Proprietorship</option>
            <option value="corporation">Corporation</option>
            <option value="partnership">Partnership</option>
            <option value="dba">DBA</option>
          </select>
        </div>
      </div>

      {/* Logo Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Store Logo *</label>
        <div
          onClick={() => logoInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-orange-400 transition"
        >
          {logoPreview ? (
            <div className="relative w-32 h-32 mx-auto">
              <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="py-8">
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Click to upload logo</p>
              <p className="text-gray-400 text-sm">PNG, JPG up to 5MB</p>
            </div>
          )}
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              handleLogoUpload(file);
            }}
          />
        </div>
      </div>

      {/* Photo ID Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Owner Photo ID *</label>
        <div
          onClick={() => photoIdInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-orange-400 transition"
        >
          {photoIdPreview ? (
            <div className="relative w-32 h-32 mx-auto">
              <img src={photoIdPreview} alt="Photo ID" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="py-8">
              <User className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Click to upload photo ID</p>
              <p className="text-gray-400 text-sm">PNG, JPG up to 5MB</p>
            </div>
          )}
          <input
            ref={photoIdInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              handlePhotoIdUpload(file);
            }}
          />
        </div>
      </div>

      {/* Store Front Photo */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Store Front Photo *</label>
        <div
          onClick={() => storeFrontInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-orange-400 transition"
        >
          {storeFrontPreview ? (
            <div className="relative w-full h-40">
              <img src={storeFrontPreview} alt="Store Front" className="w-full h-full object-cover rounded-lg" />
            </div>
          ) : (
            <div className="py-8">
              <Camera className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Click to upload store front</p>
              <p className="text-gray-400 text-sm">Show the exterior of your store</p>
            </div>
          )}
          <input
            ref={storeFrontInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              handleStoreFrontUpload(file);
            }}
          />
        </div>
      </div>

      {/* Store Inside Photo */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Inside Store Photo *</label>
        <div
          onClick={() => storeInsideInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-orange-400 transition"
        >
          {storeInsidePreview ? (
            <div className="relative w-full h-40">
              <img src={storeInsidePreview} alt="Store Inside" className="w-full h-full object-cover rounded-lg" />
            </div>
          ) : (
            <div className="py-8">
              <StoreIcon className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Click to upload inside store</p>
              <p className="text-gray-400 text-sm">Show the interior of your store</p>
            </div>
          )}
          <input
            ref={storeInsideInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              handleStoreInsideUpload(file);
            }}
          />
        </div>
      </div>
    </motion.div>
  );
});

Step2LegalPhotos.displayName = "Step2LegalPhotos";