"use client";

/*
  Store owner orders page.
  ✅ Real-time updates using Firestore onSnapshot
  Displays all orders with filtering and status management.
*/

import type { Order } from "@/types/order";
import {BrandedLoader} from "@/components/ui/BrandedLoader";
import {useState, useEffect} from "react";
import {useRouter, useSearchParams} from "next/navigation";
import {motion, AnimatePresence} from "framer-motion";
import {auth, db} from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  getDoc,
  onSnapshot,  // ✅ Import onSnapshot
} from "firebase/firestore";

// Components
import {OrderStats} from "./components/OrderStats";
import {OrderFilters} from "./components/OrderFilters";
import {OrderCard} from "./components/OrderCard";
import {EmptyOrders} from "./components/EmptyOrders";
import { mapFirestoreOrder } from "@/mappers/orderMapper";
import {
  getFunctions,
  httpsCallable,
} from "firebase/functions";

export default function StoreOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState("");
  const functions = getFunctions();
  const syncStoreOrders = httpsCallable(
  functions,
  "syncStoreOrders"
  );
  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");

  // Fetch orders with real-time listener
  useEffect(() => {
    const fetchStoreAndSetupListener = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          router.push("/login");
          return;
        }

        // Get store ID
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        
        let storeId = userDoc.data()?.storeId;

        if (!storeId) {
          const storesRef = collection(db, "stores");
          const q = query(storesRef, where("ownerId", "==", user.uid));
          const storeSnapshot = await getDocs(q);
          
          if (!storeSnapshot.empty) {
            storeId = storeSnapshot.docs[0].id;
          }
        }

        if (!storeId) {
          console.error("No store found for user:", user.uid);
          router.push("/store/create");
          return;
        }

        setStoreId(storeId);

        // ----------------------------------------------------
        // Synchronize this store's active deliveries.
        // ----------------------------------------------------
        try {

          await syncStoreOrders();

          console.log(
            "Store orders synchronized."
          );

        } catch (error) {

          console.error(
            "Store synchronization failed:",
            error
          );

        }
        // ✅ Set up real-time listener for orders
        const ordersRef = collection(db, "orders");
        const q = query(
          ordersRef,
          where("store.id", "==", storeId),
          orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
          
          const ordersData =
            snapshot.docs.map(mapFirestoreOrder);

          setOrders(ordersData);
          setFilteredOrders(ordersData);
          setLoading(false);
        });

        // ✅ Cleanup listener on unmount
        return () => unsubscribe();

      } catch (error) {
        console.error("Error fetching orders:", error);
        setLoading(false);
      }
    };

    fetchStoreAndSetupListener();
  }, [router]);

  // Filter orders (runs whenever orders or filter states change)
  useEffect(() => {
    let filtered = orders;

    if (statusFilter !== "all") {
      filtered = filtered.filter(order => order.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.customer.name.toLowerCase().includes(query) ||
        order.id.toLowerCase().includes(query)
      );
    }

    setFilteredOrders(filtered);
  }, [statusFilter, searchQuery, orders]);

  // Calculate stats
  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === "pending").length,
    completed: orders.filter(o => o.status === "completed").length,
    cancelled: orders.filter(o => o.status === "cancelled").length,
  };

  // Clear filters
  const handleClearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
  };

  const hasFilters = searchQuery !== "" || statusFilter !== "all";

  /* ==========================================
     LOADING STATE - WHITE BRANDED LOADER
  ========================================== */
  if (loading) {
    return (
      <BrandedLoader message="Loading orders" />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Store Orders</h1>
          <p className="text-gray-500 text-sm">Manage all your store orders</p>
        </div>
      </div>

      {/* Stats */}
      <OrderStats {...stats} />

      {/* Filters */}
      <OrderFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        onClearFilters={handleClearFilters}
        hasFilters={hasFilters}
      />

      {/* Orders List */}
      {orders.length === 0 ? (
        <EmptyOrders />
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
          <p className="text-gray-500 text-lg">No orders found</p>
          <p className="text-gray-400 text-sm">
            {hasFilters ? "Try adjusting your filters" : "Orders will appear here"}
          </p>
          {hasFilters && (
            <button
              onClick={handleClearFilters}
              className="mt-4 text-sm text-orange-600 hover:text-orange-700 font-medium"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Showing {filteredOrders.length} of {orders.length} orders
          </p>
          <AnimatePresence mode="popLayout">
            {filteredOrders.map((order, index) => (
              <OrderCard key={order.id} order={order} index={index} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}