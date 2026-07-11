"use client";

/*
  Store owner orders page.
  Displays all orders with filtering and status management.
  Location: /store/store-orders
*/

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
} from "firebase/firestore";

// Components - relative imports
import {OrderStats} from "./components/OrderStats";
import {OrderFilters} from "./components/OrderFilters";
import {OrderCard} from "./components/OrderCard";
import {EmptyOrders} from "./components/EmptyOrders";

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  total: number;
  status: string;
  items: any[];
  createdAt: string;
}

export default function StoreOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState("");

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");

  // Fetch orders
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          router.push("/login");
          return;
        }

        // Get store ID from user document
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        
        let storeId = userDoc.data()?.storeId;

        // If no storeId in user doc, query stores by ownerId
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

        // Fetch orders for this store
        const ordersRef = collection(db, "orders");
        const q = query(
          ordersRef,
          where("storeId", "==", storeId),
          orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);

        const ordersData: Order[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          ordersData.push({
            id: doc.id,
            customerName: data.customerName || "Customer",
            customerPhone: data.customerPhone || "",
            customerAddress: data.customerAddress || "",
            total: data.total || 0,
            status: data.status || "pending",
            items: data.items || [],
            createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          });
        });

        setOrders(ordersData);
        setFilteredOrders(ordersData);
      } catch (error) {
        console.error("Error fetching orders:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [router]);

  // Filter orders
  useEffect(() => {
    let filtered = orders;

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(order => order.status === statusFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.customerName.toLowerCase().includes(query) ||
        order.id.toLowerCase().includes(query)
      );
    }

    setFilteredOrders(filtered);
  }, [statusFilter, searchQuery, orders]);

  // Calculate stats
  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === "pending").length,
    completed: orders.filter(o => o.status === "delivered").length,
    cancelled: orders.filter(o => o.status === "cancelled").length,
  };

  // Clear filters
  const handleClearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
  };

  const hasFilters = searchQuery !== "" || statusFilter !== "all";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
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