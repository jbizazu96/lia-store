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
    <div className="border-b border-gray-100 bg-white px-4 py-7">
      <motion.div 
        initial={{opacity: 0, y: -20}}
        animate={{opacity: 1, y: 0}}
        className="max-w-lg mx-auto"
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-orange-200 bg-orange-50 shadow-sm">
              {profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt="Your profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-9 w-9 text-orange-600" />
              )}
            </div>
            <button
              type="button"
              onClick={() => imageInputReference.current?.click()}
              disabled={isUploadingImage}
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-orange-600 text-white shadow-sm transition hover:bg-orange-700 disabled:opacity-60"
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
          
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">
              My account
            </p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">
              {displayName}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {email}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
