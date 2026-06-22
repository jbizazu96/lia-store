"use client";

/*
  Payment & payout settings section.
*/

import {CreditCard, DollarSign, Banknote, AlertCircle, CheckCircle} from "lucide-react";
import Link from "next/link";

interface PaymentSectionProps {
  storeData: any;
  setStoreData: (data: any) => void;
}

export function PaymentSection({storeData, setStoreData}: PaymentSectionProps) {
  // Define status types
  type StatusType = "active" | "pending" | "inactive";
  
  const statusColors = {
    active: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    inactive: "bg-red-100 text-red-700",
  } as const;

  const statusIcons = {
    active: <CheckCircle className="w-4 h-4 text-green-600" />,
    pending: <AlertCircle className="w-4 h-4 text-yellow-600" />,
    inactive: <AlertCircle className="w-4 h-4 text-red-600" />,
  } as const;

  // Helper function to safely get status
  const getStatus = (status: string | undefined): keyof typeof statusColors => {
    if (status === "active" || status === "pending" || status === "inactive") {
      return status;
    }
    return "pending";
  };

  const status = getStatus(storeData?.stripeAccountStatus);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-4">Stripe Connect</h3>
        
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Banknote className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="font-semibold text-blue-800">Secure Payment Processing</h4>
              <p className="text-blue-600 text-sm">
                Your earnings are processed through Stripe Connect. Payouts are sent weekly.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Stripe Account Status
            </label>
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${statusColors[status]}`}>
              {statusIcons[status]}
              <span className="font-medium capitalize">
                {status}
              </span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account ID
            </label>
            <div className="px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 text-sm font-mono text-gray-600">
              {storeData?.stripeAccountId || "Not connected"}
            </div>
          </div>
        </div>

        <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Ready to receive payments?</p>
              <p className="text-xs text-gray-400">Connect your Stripe account to start earning</p>
            </div>
            <Link
              href="/store/settings/payment/connect"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition"
            >
              Connect Stripe
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-4">Payout Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payout Schedule
            </label>
            <select
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
              defaultValue="weekly"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimum Payout Threshold
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                min="0"
                step="0.01"
                defaultValue="50"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}