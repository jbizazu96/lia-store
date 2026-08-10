"use client";

/*
 * One small customer-owned order listener shared by the customer workspace.
 * It only tracks active orders for the navigation badge. Full order history is
 * intentionally loaded by the Orders page, where it can be paginated.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  db,
} from "@/lib/firebase";
import {
  useAuth,
} from "@/context/AuthContext";
interface CustomerOrdersContextValue {
  openOrderCount: number;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

const CustomerOrdersContext = createContext<CustomerOrdersContextValue>({
  openOrderCount: 0,
  loading: true,
  error: null,
  isAuthenticated: false,
});

export function CustomerOrdersProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const [openOrderCount, setOpenOrderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      return;
    }

    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });

    const ordersQuery = query(
      collection(db, "orders"),
      where("customer.uid", "==", user.uid),
      where("checkoutStatus", "==", "confirmed"),
      where("payment.status", "==", "paid"),
      where("status", "in", [
        "pending",
        "accepted",
        "preparing",
        "ready_for_pickup",
        "out_for_delivery",
      ]),
      orderBy("createdAt", "desc"),
    );

    return onSnapshot(
      ordersQuery,
      (snapshot) => {
        setOpenOrderCount(snapshot.size);
        setError(null);
        setLoading(false);
      },
      (listenerError) => {
        console.error("Unable to listen to customer orders:", listenerError);
        setOpenOrderCount(0);
        setError("Failed to load orders.");
        setLoading(false);
      },
    );
  }, [authLoading, user?.uid]);

  return (
    <CustomerOrdersContext.Provider
      value={{
        openOrderCount: user ? openOrderCount : 0,
        loading: authLoading || (Boolean(user) && loading),
        error: user ? error : "You must sign in.",
        isAuthenticated: Boolean(user),
      }}
    >
      {children}
    </CustomerOrdersContext.Provider>
  );
}

export function useCustomerOrdersContext(): CustomerOrdersContextValue {
  return useContext(CustomerOrdersContext);
}
