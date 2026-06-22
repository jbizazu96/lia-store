"use client";

import {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {auth, db} from "@/lib/firebase";
import {collection, query, where, getDocs, orderBy} from "firebase/firestore";
import {onAuthStateChanged} from "firebase/auth";
import {Package, Clock, CheckCircle, XCircle, Truck} from "lucide-react";

interface Order {
  id: string;
  storeName: string;
  total: number;
  status: string;
  createdAt: string;
  items: number;
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        const ordersRef = collection(db, "orders");
        const q = query(
          ordersRef,
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);
        
        const ordersData: Order[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          ordersData.push({
            id: doc.id,
            storeName: data.storeName || "Unknown Store",
            total: data.total || 0,
            status: data.status || "pending",
            createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            items: data.items?.length || 0,
          });
        });
        
        setOrders(ordersData);
      } catch (error) {
        console.error("Error fetching orders:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "delivered":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "cancelled":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "out_for_delivery":
        return <Truck className="w-5 h-5 text-blue-500" />;
      default:
        return <Clock className="w-5 h-5 text-orange-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "delivered": return "Delivered";
      case "cancelled": return "Cancelled";
      case "out_for_delivery": return "Out for Delivery";
      case "preparing": return "Preparing";
      default: return "Pending";
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">My Orders</h1>

        {orders.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No orders yet</p>
            <p className="text-gray-400 text-sm">Start shopping to see your orders here</p>
            <button
              onClick={() => router.push("/home")}
              className="mt-4 px-6 py-2 bg-orange-500 text-white rounded-full font-semibold hover:bg-orange-600 transition"
            >
              Browse Stores
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-800">{order.storeName}</h3>
                    <p className="text-sm text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString()} • {order.items} items
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(order.status)}
                    <span className="text-sm font-medium text-gray-600">
                      {getStatusText(order.status)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-sm text-gray-500">Total</span>
                  <span className="font-bold text-gray-800">${order.total.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}