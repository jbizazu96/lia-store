"use client";

import {motion} from "framer-motion";
import {ChevronRight} from "lucide-react";
import {LucideIcon} from "lucide-react";

interface ProfileMenuItemProps {
  icon: LucideIcon;
  label: string;
  description: string;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}

export function ProfileMenuItem({
  icon: Icon,
  label,
  description,
  onClick,
  variant = "default",
  disabled = false,
}: ProfileMenuItemProps) {
  const textColor = variant === "danger" ? "text-red-600" : "text-gray-800";
  const descColor = variant === "danger" ? "text-red-400" : "text-gray-500";

  return (
    <motion.button
      whileTap={{scale: 0.98}}
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-left shadow-[0_4px_12px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-orange-200 hover:bg-white disabled:cursor-default disabled:opacity-70"
    >
      {/* Icon */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
        variant === "danger" ? "bg-red-50" : "bg-orange-50"
      }`}>
        <Icon className={`w-5 h-5 ${
          variant === "danger" ? "text-red-600" : "text-orange-600"
        }`} />
      </div>

      {/* Label & Description */}
      <div className="flex-1 text-left">
        <p className={`text-sm font-medium ${textColor}`}>{label}</p>
        <p className={`text-xs ${descColor}`}>{description}</p>
      </div>

      {/* Chevron */}
      <ChevronRight className={`w-5 h-5 ${
        variant === "danger" ? "text-red-400" : "text-gray-400"
      }`} />
    </motion.button>
  );
}
