"use client";

/*
  Store profile management section.
  ✅ Displays existing store data.
*/

import {useState, useRef, useEffect, type Dispatch, type SetStateAction} from "react";
import Image from "next/image";
import {
  Store,
  Mail,
  Phone,
  MapPin,
  Camera,
  Upload,
  LoaderCircle,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { storeImageService } from "@/services/store/storeImageService";
import {formatPhoneNumber} from "@/utils/phone";
import {UsStateSelect} from "@/components/ui/UsStateSelect";
import {
  storeWorkspaceClientService,
  type StoreWorkspaceStore,
} from "@/services/store/storeWorkspaceClientService";

interface ProfileSectionProps {
  storeData: StoreWorkspaceStore;
  setStoreData: Dispatch<SetStateAction<StoreWorkspaceStore | null>>;
}

type UploadState = {status: "idle" | "uploading" | "processing" | "failed" | "ready"; progress: number; error?: string; file?: File};
const IDLE_UPLOAD: UploadState = {status: "idle", progress: 0};

export function ProfileSection({
  storeData,
  setStoreData,
}: ProfileSectionProps) {
  const [logoPreview, setLogoPreview] = useState(storeData?.logoUrl || "");
  const [bannerPreview, setBannerPreview] = useState(storeData?.bannerUrl || "");
  const [logoUpload, setLogoUpload] = useState<UploadState>(IDLE_UPLOAD);
  const [bannerUpload, setBannerUpload] = useState<UploadState>(IDLE_UPLOAD);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // ✅ Update previews when storeData changes
  useEffect(() => {
    queueMicrotask(() => {
      setLogoPreview(storeData?.logoUrl || "");
      setBannerPreview(storeData?.bannerUrl || "");
    });
  }, [storeData?.logoUrl, storeData?.bannerUrl]);

  const uploadImage = async (field: "logo" | "banner", file: File) => {
    const setUpload = field === "logo" ? setLogoUpload : setBannerUpload;
    const setPreview = field === "logo" ? setLogoPreview : setBannerPreview;
    const savedUrl = field === "logo" ? storeData.logoUrl : storeData.bannerUrl;
    const temporaryUrl = URL.createObjectURL(file);
    setPreview(temporaryUrl);
    setUpload({status: "uploading", progress: 0, file});

    try {
      const {imageId} = await storeImageService.uploadOriginalImage({
        storeId: storeData.id,
        field,
        file,
        onProgress: (progress) => setUpload({status: "uploading", progress, file}),
      });
      setUpload({status: "processing", progress: 100, file});

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const delayMs = Math.min(1_000 * Math.pow(1.5, attempt), 5_000);
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        const workspace = await storeWorkspaceClientService.getSettings(true);
        const status = field === "logo" ? workspace.store.logoImageStatus : workspace.store.bannerImageStatus;
        const currentImageId = field === "logo" ? workspace.store.logoImageId : workspace.store.bannerImageId;
        if (currentImageId !== imageId) continue;
        if (status === "failed") throw new Error("LIA could not process this image. Please try another image.");
        if (status === "ready") {
          setStoreData(workspace.store);
          setPreview(field === "logo" ? workspace.store.logoUrl : workspace.store.bannerUrl);
          setUpload({status: "ready", progress: 100});
          window.setTimeout(() => setUpload(IDLE_UPLOAD), 3_000);
          return;
        }
      }
      throw new Error("Image processing is taking longer than expected. Retry to check again.");
    } catch (error) {
      setPreview(savedUrl);
      setUpload({status: "failed", progress: 0, file, error: error instanceof Error ? error.message : "Image upload failed."});
    } finally {
      URL.revokeObjectURL(temporaryUrl);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void uploadImage("logo", file);
  };

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void uploadImage("banner", file);
  };

  const uploadStatus = (state: UploadState, field: "logo" | "banner") => state.status === "idle" ? null : (
    <div className={`mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-xs ${state.status === "failed" ? "bg-red-50 text-red-700" : state.status === "ready" ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-800"}`}>
      <span className="flex items-center gap-2">
        {state.status === "failed" ? <AlertCircle className="h-4 w-4" /> : state.status === "ready" ? <CheckCircle2 className="h-4 w-4" /> : <LoaderCircle className="h-4 w-4 animate-spin" />}
        {state.status === "uploading" ? `Uploading ${state.progress}%` : state.status === "processing" ? "Creating optimized image sizes…" : state.status === "ready" ? "Image saved and ready." : state.error}
      </span>
      {state.status === "failed" && state.file && <button type="button" onClick={() => void uploadImage(field, state.file!)} className="ml-3 flex items-center gap-1 font-bold"><RotateCcw className="h-3.5 w-3.5" />Retry</button>}
    </div>
  );

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
              sizes="(max-width: 768px) 100vw, 768px"
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
            disabled={bannerUpload.status === "uploading" || bannerUpload.status === "processing"}
            className="absolute bottom-4 right-4 px-4 py-2 bg-white text-black text-sm font-medium rounded-xl hover:bg-black/80 transition flex items-center gap-2"
            aria-label="Change store cover image"
          >
            <Upload className="w-4 h-4" />
            Change Cover
          </button>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
            className="hidden"
            onChange={handleBannerUpload}
          />
        </div>
        {uploadStatus(bannerUpload, "banner")}
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
                sizes="96px"
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
              disabled={logoUpload.status === "uploading" || logoUpload.status === "processing"}
              className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition flex items-center justify-center"
              aria-label="Change store logo"
            >
              <Camera className="w-6 h-6 text-white" />
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
              className="hidden"
              onChange={handleLogoUpload}
            />
          </div>
          <div className="min-w-0 flex-1">
            {uploadStatus(logoUpload, "logo")}

          {/* Form Fields */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Store Name *
              </label>
              <div className="relative">
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  maxLength={120}
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
                  maxLength={254}
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
                  maxLength={30}
                  value={storeData?.phone || ""}
                  onChange={(e) => setStoreData({...storeData, phone: formatPhoneNumber(e.target.value)})}
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
                maxLength={1500}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                placeholder="Describe your store..."
              />
            </div>
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
                maxLength={200}
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
              maxLength={100}
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
            <UsStateSelect
              value={storeData?.state || ""}
              onChange={(state) => setStoreData({...storeData, state})}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ZIP Code
            </label>
            <input
              type="text"
              maxLength={10}
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
