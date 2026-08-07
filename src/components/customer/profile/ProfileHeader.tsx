"use client";

import {motion} from "framer-motion";
import {
  Camera,
  User,
} from "lucide-react";
import {
  useRef,
} from "react";

interface ProfileHeaderProps {
  displayName: string;
  email: string;
  profileImageUrl?: string;
  isUploadingImage?: boolean;
  onSelectProfileImage: (file: File) => void;
}

export function ProfileHeader({
  displayName,
  email,
  profileImageUrl,
  isUploadingImage = false,
  onSelectProfileImage,
}: ProfileHeaderProps) {
  const imageInputReference = useRef<HTMLInputElement>(null);

  return (
    <div className="px-4 pb-5 pt-3">
      <motion.div 
        initial={{opacity: 0, y: -20}}
        animate={{opacity: 1, y: 0}}
        className="relative mx-auto max-w-lg overflow-hidden rounded-[28px] border border-orange-200/70 bg-gradient-to-br from-orange-100 via-amber-50 to-emerald-50 p-5 shadow-[0_18px_45px_rgba(249,115,22,0.12)]"
      >
        <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-orange-300/25 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-16 h-36 w-36 rounded-full bg-emerald-300/20 blur-2xl" />

        <div className="relative flex items-center gap-4">
          <div className="relative">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[30px] border-4 border-white/90 bg-orange-50 shadow-lg">
              {profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt="Your profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-10 w-10 text-orange-600" />
              )}
            </div>
            <button
              type="button"
              onClick={() => imageInputReference.current?.click()}
              disabled={isUploadingImage}
              className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-orange-600 text-white shadow-md transition hover:bg-orange-700 disabled:opacity-60"
              aria-label="Change profile picture"
            >
              {isUploadingImage ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </button>
            <input
              ref={imageInputReference}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) onSelectProfileImage(file);

                event.currentTarget.value = "";
              }}
            />
          </div>
          
          <div className="min-w-0 flex-1">
            <span className="inline-flex rounded-full border border-orange-200 bg-white/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">
              LIA customer
            </span>
            <h1 className="mt-2 truncate text-2xl font-extrabold tracking-tight text-gray-900">
              {displayName}
            </h1>
            <p className="mt-1 truncate text-sm font-medium text-gray-600">
              {email}
            </p>
            <p className="mt-3 text-xs font-semibold text-emerald-700">
              Your account is ready for shopping.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
