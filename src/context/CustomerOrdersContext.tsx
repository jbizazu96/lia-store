"use client";

/*
 * One customer-owned order listener shared by the customer workspace.
 * Navigation can show its open-order badge without opening a second identical
 * Firestore listener on the Orders screen.
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
import {
  mapFirestoreOrder,
} from "@/mappers/orderMapper";
import {
  isPaidConfirmedOrder,
} from "@/utils/orderPaymentVisibility";
import type {
  Order,
} from "@/types/order";

interface CustomerOrdersContextValue {
  orders: Order[];
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

const CustomerOrdersContext = createContext<CustomerOrdersContextValue>({
  orders: [],
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setOrders([]);
      setError("You must sign in.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const ordersQuery = query(
      collection(db, "orders"),
      where("customer.uid", "==", user.uid),
      where("checkoutStatus", "==", "confirmed"),
      where("payment.status", "==", "paid"),
      orderBy("createdAt", "desc"),
    );

    return onSnapshot(
      ordersQuery,
      (snapshot) => {
        try {
          setOrders(
            snapshot.docs
              .filter((document) => isPaidConfirmedOrder(document.data()))
              .map(mapFirestoreOrder),
          );
          setError(null);
        } catch (mappingError) {
          console.error("Unable to map customer orders:", mappingError);
          setOrders([]);
          setError("Failed to read orders.");
        } finally {
          setLoading(false);
        }
      },
      (listenerError) => {
        console.error("Unable to listen to customer orders:", listenerError);
        setOrders([]);
        setError("Failed to load orders.");
        setLoading(false);
      },
    );
  }, [authLoading, user]);

  return (
    <CustomerOrdersContext.Provider
      value={{
        orders,
        loading,
        error,
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
