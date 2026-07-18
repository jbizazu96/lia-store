"use client";

/*
  Store status modal.

  Shows different messages based on store status:
  - Active: Redirect to premium dashboard
  - Pending: Show pending review message
  - None: Show welcome message with create button
*/

import {motion} from "framer-motion";
import {X, Store, Clock, CheckCircle, ArrowRight, Sparkles} from "lucide-react";

interface StoreStatusModalProps {
  isOpen: boolean;
  status: "active" | "pending" | "none";
  storeName?: string;
  onClose: () => void;
  onCreateStore: () => void;
  onGoHome: () => void;
  onGoToDashboard: () => void;
}

export function StoreStatusModal({
  isOpen,
  status,
  storeName = "Your Store",
  onClose,
  onCreateStore,
  onGoHome,
  onGoToDashboard,
}: StoreStatusModalProps) {
  if (!isOpen) return null;

  const renderContent = () => {
    // No store exists - welcome message
    if (status === "none") {
      return (
        <>
          <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Store className="w-10 h-10 text-white" />
          </div>

          <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">
            Welcome to LIA! 🎉
          </h2>
          <p className="text-center text-gray-600 mb-2">
            You're all set to start selling on LIA Marketplace.
          </p>
          <p className="text-center text-gray-500 text-sm mb-6">
            Set up your store and start reaching thousands of customers in your area.
          </p>

          <button
            onClick={onCreateStore}
            className="w-full py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg transition flex items-center justify-center gap-2"
          >
            Create Your Store <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={onGoHome}
            className="w-full mt-3 py-3 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition"
          >
            Browse as Customer
          </button>
        </>
      );
    }

    // Store is pending review
    if (status === "pending") {
      return (
        <>
          <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-10 h-10 text-yellow-600" />
          </div>

          <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">
            Store Under Review
          </h2>
          <p className="text-center text-gray-600 mb-2">
            Hello <span className="font-semibold">{storeName}</span> 👋
          </p>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <p className="text-yellow-800 text-sm text-center">
              Your store is currently being reviewed by the LIA team.
              We'll notify you via email once your store is approved and active.
            </p>
            <p className="text-yellow-600 text-xs text-center mt-2">
              This usually takes 24-48 hours.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-full py-3 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition"
          >
            Got it, Thanks!
          </button>
        </>
      );
    }

    // Store is active - go to premium dashboard
    return (
      <>
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>

        <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">
          Store is Active! 🚀
        </h2>
        <p className="text-center text-gray-600 mb-6">
          Your store <span className="font-semibold">{storeName}</span> is live on LIA!
        </p>

        <button
          onClick={onGoToDashboard}
          className="w-full py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold hover:shadow-lg transition"
        >
          Go to Dashboard
        </button>
      </>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{opacity: 0, scale: 0.9}}
        animate={{opacity: 1, scale: 1}}
        exit={{opacity: 0, scale: 0.9}}
        className="bg-white rounded-3xl max-w-sm w-full p-6 relative"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>

        {renderContent()}
      </motion.div>
    </div>
  );
}