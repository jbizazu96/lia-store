"use client";

/*
  Checkout page with complete order data for Firestore.
  All fields needed for future Shipday integration.
*/

import type { Store } from "@/types/store";
import { storeService } from "@/services/store/storeService";
import {
  calculateDistance,
  getEstimatedTimeNumber,
} from "@/services/delivery/distance";
import { orderService } from "@/services/order/orderService";
import { createOrder } from "@/mappers/orderMapper";
import {useState, useEffect} from "react";
import {useRouter} from "next/navigation";
import {AnimatePresence} from "framer-motion";
import {CreditCard, AlertCircle} from "lucide-react";
import {auth, db} from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import {useCart} from "@/context/CartContext";
import { PRICING_CONFIG } from "@/config/pricing";
import { calculateDeliveryFee } from "@/services/delivery/deliveryPricing";

// Components
import {CheckoutHeader} from "@/components/checkout/CheckoutHeader";
import {DeliveryAddressSection} from "@/components/checkout/DeliveryAddressSection";
import {OrderSummary} from "@/components/checkout/OrderSummary";
import {OrderSuccess} from "@/components/checkout/OrderSuccess";
import {AddressModal} from "@/components/checkout/AddressModal";
import {TipSelector} from "@/components/checkout/TipSelector";
import {DeliveryInstructions} from "@/components/checkout/DeliveryInstructions";

// Types
import type {
  CheckoutAddress,
  CheckoutItem,
  CheckoutTotals,
} from "./types";

export default function CheckoutPage() {
  const router = useRouter();
  const {items, totalPrice, clearCart} = useCart();
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState<CheckoutAddress | null>(null);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");

  // User info
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");

  // Delivery info
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [tip, setTip] = useState(0);

  // Store info (will be fetched from Firestore)
  const [storeData, setStoreData] = useState<Store | null>(null);

  // Address form state with name and phone
  const [formData, setFormData] = useState({
    street: "",
    city: "",
    state: "",
    zip: "",
    name: "",
    phone: "",
  });

  // ✅ Check if cart is empty and redirect in useEffect
  useEffect(() => {
    if (items.length === 0 && !orderPlaced) {
      router.push("/home");
    }
  }, [items.length, orderPlaced, router]);

  // Get user data and address
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          router.push("/login");
          return;
        }

        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const name = data.displayName || user.email?.split("@")[0] || "Customer";
          const phone = data.phone || "";

          setUserName(name);
          setUserPhone(phone);

          if (data.defaultAddress) {
            setAddress(data.defaultAddress);
            setFormData({
              street: data.defaultAddress.street || "",
              city: data.defaultAddress.city || "",
              state: data.defaultAddress.state || "",
              zip: data.defaultAddress.zip || "",
              name: name,
              phone: phone,
            });
          } else {
            setFormData({
              street: "",
              city: "",
              state: "",
              zip: "",
              name: name,
              phone: phone,
            });
          }
        }

        // Fetch store data if we have a storeId
        const storeId = items[0]?.storeId;

        if (storeId) {
          const store = await storeService.getStore(storeId);

          setStoreData(store);
        }
              } catch (error) {
                console.error("Error fetching user data:", error);
              }
            };
            fetchUserData();
          }, [items, router]);

        // If cart is empty, return null (redirect handled by useEffect)
        if (items.length === 0 && !orderPlaced) {
          return null;
        }

        // Calculate order totals with tip
        // Calculate the distance between the store and customer.
        //
        // We calculate it here so the Checkout summary and the saved Order
        // use the exact same distance.
        const distanceMiles =
          storeData &&
          address?.latitude !== undefined &&
          address?.longitude !== undefined
            ? calculateDistance(
                storeData.latitude,
                storeData.longitude,
                address.latitude,
                address.longitude
              )
            : 0;

        // Calculate order totals using centralized pricing rules.
        const subtotal = totalPrice;

        const deliveryPricing = calculateDeliveryFee(
          distanceMiles,
          subtotal
        );

        const deliveryFee =
          deliveryPricing.deliveryFee;

        const tax = Math.round(subtotal * PRICING_CONFIG.SALES_TAX_RATE * 100) / 100;

        const total =
          subtotal +
          deliveryFee +
          tax +
          tip;

        const totals: CheckoutTotals = {
          subtotal,
          deliveryFee,
          tax,
          total,
          tip,
        };

        // Get store info from cart
        const storeId = items[0]?.storeId || "";
        const storeName = items[0]?.storeName || "";

        // Place order with all user info
        const handlePlaceOrder = async () => {
          if (!address) {
            setError("Please add a delivery address");
            setShowAddressModal(true);
            return;
          }

          try {
            setLoading(true);
            setError("");

            const user = auth.currentUser;
            if (!user) {
              router.push("/login");
              return;
            }

            const order = createOrder({
        userId: user.uid,

        customerName:
          formData.name || userName,

        customerPhone:
          formData.phone || userPhone,

        customerEmail:
          user.email || "",

        storeId,
        storeOwnerId:
          storeData?.ownerId || "",

        storeName,

        storeAddress:
          storeData?.address || "",

        storePhone:
          storeData?.phone || "",

        storeLatitude:
          storeData?.latitude || 0,

        storeLongitude:
          storeData?.longitude || 0,

        deliveryAddress: {
          street: address.street || "",
          city: address.city || "",
          state: address.state || "",
          zip: address.zip || "",
          latitude: address.latitude,
          longitude: address.longitude,
          formattedAddress:
            address.formattedAddress || "",
        },

        customerLatitude:
          address.latitude || 0,

        customerLongitude:
          address.longitude || 0,

        deliveryInstructions,

        deliveryDistanceMiles:
          distanceMiles,

        estimatedDeliveryMinutes:
          getEstimatedTimeNumber(distanceMiles),

        items: items.map((item) => ({
          id: item.id,
          storeId: item.storeId,
          storeName: item.storeName,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          imageUrl: item.imageUrl,
          size: item.size ?? null,
        })),

        totals: {
          subtotal,
          deliveryFee,
          tax,
          tip,
          total,
        },
      });
      
      console.log(order);
      const orderId = await orderService.createOrder(order);
      setOrderId(orderId);

      // Clear cart
      clearCart();

      // Show success
      setOrderPlaced(true);

      // Redirect to orders page after 3 seconds
      setTimeout(() => {
        router.push("/orders");
      }, 3000);

    } catch (error) {
      console.error("Error placing order:", error);
      setError("Failed to place order. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Go back to cart
  const handleBack = () => {
    router.back();
  };

  // Save address with name and phone
  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.street.trim() || !formData.city.trim() || 
        !formData.state.trim() || !formData.zip.trim() ||
        !formData.name.trim() || !formData.phone.trim()) {
      setError("Please fill in all fields");
      return;
    }

    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) return;

      const fullAddress = `${formData.street}, ${formData.city}, ${formData.state} ${formData.zip}`;
      
      let location = null;
      try {
        const {geocodeAddress} = await import("@/services/delivery/geocode");
        location = await geocodeAddress(fullAddress);
      } catch (geoError) {
        console.warn("Geocoding failed:", geoError);
      }

      const addressData: CheckoutAddress = {
        street: formData.street,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        latitude: location?.latitude ?? undefined,
        longitude: location?.longitude ?? undefined,
        formattedAddress: location?.formattedAddress || fullAddress,
      };

      // Update user profile with address, name, and phone
      await setDoc(doc(db, "users", user.uid), {
        defaultAddress: addressData,
        displayName: formData.name,
        phone: formData.phone,
      }, { merge: true });

      setAddress(addressData);
      setUserName(formData.name);
      setUserPhone(formData.phone);
      setShowAddressModal(false);
      setError("");
    } catch (error) {
      console.error("Error saving address:", error);
      setError("Failed to save address. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Success view
  if (orderPlaced) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <OrderSuccess
          orderId={orderId}
          onViewOrders={() => router.push("/orders")}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <CheckoutHeader onBack={handleBack} />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Delivery Address with User Info */}
        <DeliveryAddressSection
          address={address}
          userName={userName}
          userPhone={userPhone}
          onEdit={() => setShowAddressModal(true)}
        />

        {/* Delivery Instructions */}
        <DeliveryInstructions
          value={deliveryInstructions}
          onChange={setDeliveryInstructions}
        />

        {/* Driver Tip */}
        <TipSelector
          selectedTip={tip}
          onTipChange={setTip}
          subtotal={subtotal}
        />

        {/* Order Summary */}
        <OrderSummary
          items={items as CheckoutItem[]}
          totals={totals}
          storeName={storeName}
          storeAddress={storeData?.address ? `${storeData.address}` : ""}
        />

        {/* Place Order Button */}
        <button
          onClick={handlePlaceOrder}
          disabled={loading}
          className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg hover:from-orange-600 hover:to-orange-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              Pay ${total.toFixed(2)}
            </>
          )}
        </button>

        <p className="text-center text-xs text-gray-400">
          By placing your order, you agree to our Terms of Service
        </p>
      </div>

      {/* Address Modal */}
      <AnimatePresence>
        {showAddressModal && (
          <AddressModal
            isOpen={showAddressModal}
            onClose={() => setShowAddressModal(false)}
            onSubmit={handleSaveAddress}
            formData={formData}
            setFormData={setFormData}
            loading={loading}
            error={error}
            title="Delivery Information"
          />
        )}
      </AnimatePresence>
    </main>
  );
}
