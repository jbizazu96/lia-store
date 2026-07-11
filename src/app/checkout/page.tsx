"use client";

/*
  Checkout page with clean component structure.
*/

import {useState, useEffect} from "react";
import {useRouter} from "next/navigation";
import {AnimatePresence} from "framer-motion";
import {CreditCard, AlertCircle} from "lucide-react";
import {auth, db} from "@/lib/firebase";
import {doc, getDoc, setDoc, addDoc, serverTimestamp} from "firebase/firestore";
import {useCart} from "@/context/CartContext";
import {collection} from "firebase/firestore";

// Components
import {CheckoutHeader} from "./components/CheckoutHeader";
import {DeliveryAddressSection} from "./components/DeliveryAddressSection";
import {OrderSummary} from "./components/OrderSummary";
import {OrderSuccess} from "./components/OrderSuccess";
import {AddressModal} from "./components/AddressModal";

// Types
import {Address, CheckoutItem, OrderTotals} from "./types";

export default function CheckoutPage() {
  const router = useRouter();
  const {items, totalPrice, clearCart} = useCart();
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState<Address | null>(null);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");

  // Address form state
  const [formData, setFormData] = useState({
    street: "",
    city: "",
    state: "",
    zip: "",
  });

  // Get user address
  useEffect(() => {
    const fetchAddress = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          router.push("/login");
          return;
        }

        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.defaultAddress) {
            setAddress(data.defaultAddress);
            setFormData({
              street: data.defaultAddress.street || "",
              city: data.defaultAddress.city || "",
              state: data.defaultAddress.state || "",
              zip: data.defaultAddress.zip || "",
            });
          }
        }
      } catch (error) {
        console.error("Error fetching address:", error);
      }
    };
    fetchAddress();
  }, [router]);

  // If cart is empty, redirect to home
  if (items.length === 0 && !orderPlaced) {
    router.push("/home");
    return null;
  }

  // Calculate order totals
  const subtotal = totalPrice;
  const deliveryFee = subtotal > 30 ? 0 : 5.99;
  const tax = subtotal * 0.08;
  const total = subtotal + deliveryFee + tax;

  const totals: OrderTotals = {
    subtotal,
    deliveryFee,
    tax,
    total,
  };

  // Get store name from first item
  const storeName = items[0]?.storeName || "";

  // Place order
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

      // Create order in Firestore
      const orderData = {
        userId: user.uid,
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          imageUrl: item.imageUrl || "",
          size: item.size || null,
        })),
        storeId: items[0]?.storeId || "",
        storeName: items[0]?.storeName || "",
        subtotal: subtotal,
        deliveryFee: deliveryFee,
        tax: tax,
        total: total,
        deliveryAddress: {
          street: address.street || "",
          city: address.city || "",
          state: address.state || "",
          zip: address.zip || "",
          formattedAddress: address.formattedAddress || "",
        },
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "orders"), orderData);
      setOrderId(docRef.id);

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

  // Save address
  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.street.trim() || !formData.city.trim() || 
        !formData.state.trim() || !formData.zip.trim()) {
      setError("Please fill in all address fields");
      return;
    }

    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) return;

      const fullAddress = `${formData.street}, ${formData.city}, ${formData.state} ${formData.zip}`;
      
      let location = null;
      try {
        const {geocodeAddress} = await import("@/services/geocode");
        location = await geocodeAddress(fullAddress);
      } catch (geoError) {
        console.warn("Geocoding failed:", geoError);
      }

      const addressData: Address = {
        street: formData.street,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        latitude: location?.latitude ?? undefined,
        longitude: location?.longitude ?? undefined,
        formattedAddress: location?.formattedAddress || fullAddress,
      };

      await setDoc(doc(db, "users", user.uid), {
        defaultAddress: addressData,
      }, { merge: true });

      setAddress(addressData);
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

        {/* Delivery Address */}
        <DeliveryAddressSection
          address={address}
          onEdit={() => setShowAddressModal(true)}
        />

        {/* Order Summary */}
        <OrderSummary
          items={items as CheckoutItem[]}
          totals={totals}
          storeName={storeName}
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
              Place Order
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
            title={address ? "Update Address" : "Add Address"}
          />
        )}
      </AnimatePresence>
    </main>
  );
}