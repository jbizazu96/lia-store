"use client";

import {useState, useEffect} from "react";
import {useRouter, useSearchParams} from "next/navigation";
import {motion} from "framer-motion";
import {
  Search,
  Filter,
  ChevronDown,
  Eye,
  CheckCircle,
  XCircle,
  Truck,
  Clock,
  Package,
  MapPin,
  Phone,
  User,
  Printer,
  Download,
  ArrowLeft
} from "lucide-react";
import {auth, db} from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  getDoc,
  updateDoc
} from "firebase/firestore";
import Link from "next/link";

const statusOptions = [
  {value: "pending", label: "Pending", color: "bg-yellow-100 text-yellow-800"},
  {value: "accepted", label: "Accepted", color: "bg-blue-100 text-blue-800"},
  {value: "preparing", label: "Preparing", color: "bg-purple-100 text-purple-800"},
  {value: "ready", label: "Ready", color: "bg-indigo-100 text-indigo-800"},
  {value: "out_for_delivery", label: "Out for Delivery", color: "bg-orange-100 text-orange-800"},
  {value: "delivered", label: "Delivered", color: "bg-green-100 text-green-800"},
  {value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-800"},
];

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  total: number;
  status: string;
  items: any[];
  createdAt: string;
  deliveryFee: number;
  subtotal: number;
}

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        const userDoc = await getDoc(doc(db, "users", user.uid));
        const storeId = userDoc.data()?.storeId;
        setStoreId(storeId);

        if (!storeId) return;

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
            deliveryFee: data.deliveryFee || 0,
            subtotal: data.subtotal || 0,
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
  }, []);

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

  const getStatusColor = (status: string) => {
    return statusOptions.find(s => s.value === status)?.color || "bg-gray-100 text-gray-800";
  };

  const getStatusLabel = (status: string) => {
    return statusOptions.find(s => s.value === status)?.label || status;
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, "orders", orderId), {
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });

      // Update local state
      setOrders(orders.map(order =>
        order.id === orderId ? {...order, status: newStatus} : order
      ));

      // Show success message
      alert(`Order status updated to ${getStatusLabel(newStatus)}`);
    } catch (error) {
      console.error("Error updating order:", error);
      alert("Failed to update order status");
    }
  };

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
          <h1 className="text-2xl font-bold text-gray-800">Orders</h1>
          <p className="text-gray-500 text-sm">Manage all your store orders</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-2">
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Statuses</option>
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-100 transition"
            >
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No orders found</p>
            <p className="text-gray-400 text-sm">
              {searchQuery ? "Try adjusting your search" : "Orders will appear here"}
            </p>
          </div>
        ) : (
          filteredOrders.map((order, index) => (
            <motion.div
              key={order.id}
              initial={{opacity: 0, y: 20}}
              animate={{opacity: 1, y: 0}}
              transition={{delay: index * 0.03}}
              className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Order Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-sm font-bold text-gray-600">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                      {getStatusLabel(order.status)}
                    </span>
                    <span className="text-sm text-gray-400">
                      {new Date(order.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <User className="w-4 h-4" />
                      {order.customerName}
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <Package className="w-4 h-4" />
                      {order.items.length} items
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <MapPin className="w-4 h-4" />
                      {order.customerAddress || "Address not set"}
                    </div>
                  </div>
                </div>

                {/* Total & Actions */}
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-800">
                      ${order.total.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {order.items.length} items • ${order.deliveryFee.toFixed(2)} delivery
                    </p>
                  </div>

                  {/* Status Actions */}
                  <div className="flex gap-2">
                    {order.status === "pending" && (
                      <button
                        onClick={() => handleStatusUpdate(order.id, "accepted")}
                        className="px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-xl hover:bg-green-600 transition"
                      >
                        Accept
                      </button>
                    )}
                    {order.status === "accepted" && (
                      <button
                        onClick={() => handleStatusUpdate(order.id, "preparing")}
                        className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition"
                      >
                        Start Preparing
                      </button>
                    )}
                    {order.status === "preparing" && (
                      <button
                        onClick={() => handleStatusUpdate(order.id, "ready")}
                        className="px-4 py-2 bg-purple-500 text-white text-sm font-medium rounded-xl hover:bg-purple-600 transition"
                      >
                        Mark Ready
                      </button>
                    )}
                    {order.status === "ready" && (
                      <button
                        onClick={() => handleStatusUpdate(order.id, "out_for_delivery")}
                        className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-xl hover:bg-orange-600 transition"
                      >
                        Assign Driver
                      </button>
                    )}
                    <Link
                      href={`/store/orders/${order.id}`}
                      className="p-2 hover:bg-gray-100 rounded-xl transition"
                    >
                      <Eye className="w-5 h-5 text-gray-500" />
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statusOptions.map(option => {
          const count = orders.filter(o => o.status === option.value).length;
          return (
            <div key={option.value} className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <p className={`text-sm font-medium ${option.color.split(" ")[0]}`}>
                {option.label}
              </p>
              <p className="text-2xl font-bold text-gray-800">{count}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}