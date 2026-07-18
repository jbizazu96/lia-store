"use client";

import {memo} from "react";
import {motion} from "framer-motion";
import {Mail, Phone, CreditCard, Banknote} from "lucide-react";

interface Step3StripeProps {
  stripeEmail: string;
  setStripeEmail: (value: string) => void;
  stripePhone: string;
  setStripePhone: (value: string) => void;
  stripeBusinessType: string;
  setStripeBusinessType: (value: string) => void;
  stripeAccountType: string;
  setStripeAccountType: (value: string) => void;
  formatPhone: (value: string) => string;
}

export const Step3Stripe = memo(({
  stripeEmail,
  setStripeEmail,
  stripePhone,
  setStripePhone,
  stripeBusinessType,
  setStripeBusinessType,
  stripeAccountType,
  setStripeAccountType,
  formatPhone,
}: Step3StripeProps) => (
  <motion.div
    initial={{opacity: 0, x: 20}}
    animate={{opacity: 1, x: 0}}
    exit={{opacity: 0, x: -20}}
    className="space-y-4"
  >
    <h2 className="text-xl font-bold text-gray-800">Payment Setup</h2>
    <p className="text-gray-500 text-sm">Set up your payment account to receive earnings</p>

    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <CreditCard className="w-5 h-5 text-blue-600 mt-0.5" />
        <div>
          <p className="text-blue-700 font-medium">Secure payment processing</p>
          <p className="text-blue-600 text-sm">
            Your earnings will be deposited directly to your bank account via Stripe.
            All information is encrypted and secure.
          </p>
        </div>
      </div>
    </div>

    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Email for Payments *</label>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="email"
          value={stripeEmail}
          onChange={(e) => setStripeEmail(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
          placeholder="payments@email.com"
        />
      </div>
    </div>

    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Phone for Payments *</label>
      <div className="relative">
        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="tel"
          value={stripePhone}
          onChange={(e) => setStripePhone(formatPhone(e.target.value))}
          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
          placeholder="(123) 456 - 7890"
          maxLength={18}
        />
      </div>
    </div>

    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Business Type for Payments *</label>
      <select
        value={stripeBusinessType}
        onChange={(e) => setStripeBusinessType(e.target.value)}
        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
      >
        <option value="">Select business type</option>
        <option value="retail">Retail</option>
        <option value="food">Food & Beverage</option>
        <option value="grocery">Grocery</option>
        <option value="restaurant">Restaurant</option>
        <option value="other">Other</option>
      </select>
    </div>

    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Account Type *</label>
      <select
        value={stripeAccountType}
        onChange={(e) => setStripeAccountType(e.target.value)}
        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
      >
        <option value="individual">Individual / Sole Proprietor</option>
        <option value="company">Company / LLC</option>
        <option value="non_profit">Non-Profit</option>
      </select>
    </div>

    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <Banknote className="w-5 h-5 text-orange-600 mt-0.5" />
        <div>
          <p className="text-orange-700 font-medium">You'll be redirected to Stripe</p>
          <p className="text-orange-600 text-sm">
            After creating your store, you'll complete the Stripe onboarding
            to start receiving payments.
          </p>
        </div>
      </div>
    </div>
  </motion.div>
));

Step3Stripe.displayName = "Step3Stripe";