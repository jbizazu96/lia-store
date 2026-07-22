"use client";

/*
  Store profile management section.
  ✅ Displays existing store data.
*/

import {useState, useRef, useEffect} from "react";
import Image from "next/image";
import {motion} from "framer-motion";
import {
  Store,
  User,
  Mail,
  Phone,
  MapPin,
  Camera,
  Upload,
  X,
} from "lucide-react";
import { storeImageService } from "@/services/store/storeImageService";

interface ProfileSectionProps {
  storeData: any;
  setStoreData: (data: any) => void;
  userData: any;
  setUserData: (data: any) => void;
}

export function ProfileSection({
  storeData,
  setStoreData,
  userData,
  setUserData,
}: ProfileSectionProps) {
  const [logoPreview, setLogoPreview] = useState(storeData?.logoUrl || "");
  const [bannerPreview, setBannerPreview] = useState(storeData?.bannerUrl || "");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // ✅ Update previews when storeData changes
  useEffect(() => {
    setLogoPreview(storeData?.logoUrl || "");
    setBannerPreview(storeData?.bannerUrl || "");
  }, [storeData?.logoUrl, storeData?.bannerUrl]);

  // Handle logo upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    await storeImageService.uploadOriginalImage({
      storeId: storeData.id,
      field: "logo",
      file,
    });
  };

  // Handle banner upload
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setBannerPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    await storeImageService.uploadOriginalImage({
      storeId: storeData.id,
      field: "banner",
      file,
    });
  };

  // If no storeData, show a message
  if (!storeData) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <p className="text-gray-500 text-center">No store data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Store Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-4">Store Cover</h3>
        <div className="relative h-48 rounded-xl overflow-hidden bg-gray-100">
          {bannerPreview ? (
            <Image
              src={bannerPreview}
              alt="Store banner"
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Camera className="w-12 h-12 text-gray-300" />
            </div>
          )}
          <button
            type="button"
            onClick={() => bannerInputRef.current?.click()}
            className="absolute bottom-4 right-4 px-4 py-2 bg-white text-black text-sm font-medium rounded-xl hover:bg-black/80 transition flex items-center gap-2"
            aria-label="Change store cover image"
          >
            <Upload className="w-4 h-4" />
            Change Cover
          </button>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleBannerUpload}
          />
        </div>
      </div>

      {/* Store Info */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-start gap-6">
          {/* Logo */}
          <div className="relative w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0 bg-gray-100 border-2 border-gray-200">
            {logoPreview ? (
              <Image
                src={logoPreview}
                alt="Store logo"
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Store className="w-10 h-10 text-gray-300" />
              </div>
            )}
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition flex items-center justify-center"
              aria-label="Change store logo"
            >
              <Camera className="w-6 h-6 text-white" />
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
          </div>

          {/* Form Fields */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Store Name *
              </label>
              <div className="relative">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={storeData?.name || ""}
                  onChange={(e) => setStoreData({...storeData, name: e.target.value})}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  placeholder="Store name"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={storeData?.email || ""}
                  onChange={(e) => setStoreData({...storeData, email: e.target.value})}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  placeholder="store@email.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="tel"
                  value={storeData?.phone || ""}
                  onChange={(e) => setStoreData({...storeData, phone: e.target.value})}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  placeholder="(123) 456 - 7890"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Store Description
              </label>
              <textarea
                value={storeData?.description || ""}
                onChange={(e) => setStoreData({...storeData, description: e.target.value})}
                rows={1}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                placeholder="Describe your store..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Address */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-4">Store Address</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Street Address *
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={storeData?.address || ""}
                onChange={(e) => setStoreData({...storeData, address: e.target.value})}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                placeholder="123 Main St"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City
            </label>
            <input
              type="text"
              value={storeData?.city || ""}
              onChange={(e) => setStoreData({...storeData, city: e.target.value})}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
              placeholder="Los Angeles"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              State
            </label>
            <input
              type="text"
              value={storeData?.state || ""}
              onChange={(e) => setStoreData({...storeData, state: e.target.value})}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
              placeholder="CA"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ZIP Code
            </label>
            <input
              type="text"
              value={storeData?.zip || ""}
              onChange={(e) => setStoreData({...storeData, zip: e.target.value})}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
              placeholder="90210"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
