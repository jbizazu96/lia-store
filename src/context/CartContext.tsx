"use client";

/*
  Cart context for managing cart state across the app.
  ✅ Persistent cart stored in Firestore with 48-hour expiry.
*/

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {auth} from "@/lib/firebase";
import {
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  saveCartToFirestore,
  loadCartFromFirestore,
  clearCartFromFirestore,
  repeatCompletedOrderInCart,
  type CartItem,
} from "@/services/cart/cartService";

interface CartContextType {
  items: CartItem[];
  itemCount: number;
  totalPrice: number;
  addItem: (
  item: Omit<CartItem, "quantity">
  ) => Promise<{
    added: boolean;
    existingStoreName?: string;
  }>;

  removeItem: (
    itemId: string
  ) => void;

  updateQuantity: (
    itemId: string,
    quantity: number
  ) => void;

  clearCart: () => Promise<void>;
  repeatCompletedOrder: (orderId: string) => Promise<{
    skippedProductNames: string[];
  }>;
  getStoreId: () => string | null;
  getItemQuantity: (itemId: string) => number;
  getStoreItems: (storeId: string) => CartItem[];
  getStoreItemCount: (storeId: string) => number;
  getStoreTotalPrice: (storeId: string) => number;
  isLoading: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({children}: {children: ReactNode}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isCustomerCartSession, setIsCustomerCartSession] =
    useState(false);
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const cartNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const showCartNotice = useCallback((message: string) => {
    if (cartNoticeTimeoutRef.current !== null) {
      clearTimeout(cartNoticeTimeoutRef.current);
    }

    setCartNotice(message);
    cartNoticeTimeoutRef.current = setTimeout(() => {
      setCartNotice(null);
      cartNoticeTimeoutRef.current = null;
    }, 5000);
  }, []);

  useEffect(() => () => {
    if (cartNoticeTimeoutRef.current !== null) {
      clearTimeout(cartNoticeTimeoutRef.current);
    }
  }, []);

  /*
   * Cart persistence belongs only to customer accounts. The protected
   * customer-cart callable remains the source of truth for that decision;
   * this check simply prevents the app-wide provider from retrying cart
   * operations after the callable has rejected a store, driver, or admin.
   */
  const isCustomerCartAuthorizationError = (
    error: unknown
  ): boolean =>
    error instanceof Error &&
    error.message ===
      "This account is not authorized to manage a customer cart.";

  // ✅ Load cart from Firestore on auth change
  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setIsCustomerCartSession(false);

      /*
       * Remove the previous account's items immediately. The async cart load
       * below is also guarded by `active`, so a prior account can never write
       * its cart into a newly signed-in customer's memory or Firestore cart.
       */
      setItems([]);

      if (user) {
        setIsLoading(true);
        try {
          const savedItems = await loadCartFromFirestore(user.uid);

          if (!active || auth.currentUser?.uid !== user.uid) {
            return;
          }

          if (savedItems) {
            setItems(savedItems);
          } else {
            setItems([]);
          }

          setIsCustomerCartSession(true);
        } catch (error) {
          if (!active || auth.currentUser?.uid !== user.uid) {
            return;
          }

          /*
           * The CartProvider wraps every role. A rejected customer-cart
           * request for a store, driver, or administrator is expected and
           * must not be shown as an application error during their login.
           */
          if (!isCustomerCartAuthorizationError(error)) {
            console.error("Error loading cart:", error);
          }

          setItems([]);
        } finally {
          if (active && auth.currentUser?.uid === user.uid) {
            setIsLoading(false);
          }
        }
     
        } else {
        /**
         * Remove the previous customer's cart from browser memory.
         *
         * We do not delete the Firestore document. The same customer
         * can recover it after logging back in within 48 hours.
         */
        setItems([]);
        setIsLoading(false);
      }
      
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

    useEffect(() => {
      /**
       * Do not save while:
       *
       * • No customer is signed in
       * • The customer's saved cart is still loading
       *
       * Without this guard, an empty local cart could delete the saved
       * Firestore cart before loadCartFromFirestore() finishes.
       */
      if (!currentUser || isLoading || !isCustomerCartSession) {
        return;
      }

    // Debounce saves to avoid too many writes
    const timeoutId = setTimeout(() => {
      if (items.length > 0) {
        void saveCartToFirestore(
          currentUser.uid,
          items
        ).catch((error: unknown) => {
          console.error(
            "Unable to save cart:",
            error
          );
        });
      } else {
        // If cart is empty, clear it from Firestore
        void clearCartFromFirestore(
          currentUser.uid
        ).catch((error: unknown) => {
          console.error(
            "Unable to clear cart:",
            error
          );
        });
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [items, currentUser, isLoading, isCustomerCartSession]);
/**
 * Add a product to the cart.
 *
 * Business rule:
 * A cart may contain products from only one store.
 *
 * A product from another store is blocked. The customer must finish or
 * clear the current store's cart before beginning a separate order.
 */
const addItem = async (
  item: Omit<CartItem, "quantity">
): Promise<{
  added: boolean;
  existingStoreName?: string;
}> => {
  const existingStoreId =
    items[0]?.storeId ?? null;

  const isDifferentStore =
    existingStoreId !== null &&
    existingStoreId !== item.storeId;

  if (isDifferentStore) {
    const existingStoreName =
      items[0]?.storeName || "another store";

    showCartNotice(
      `Your cart already has items from ${existingStoreName}. Finish or clear that order before adding items from ${item.storeName}.`
    );

    return {
      added: false,
      existingStoreName,
    };
  }

  setItems((previousItems) => {
    const existingItem =
      previousItems.find(
        (cartItem) =>
          cartItem.id === item.id
      );

    if (existingItem) {
      return previousItems.map(
        (cartItem) =>
          cartItem.id === item.id
            ? {
                ...cartItem,
                quantity:
                  Math.min(
                    cartItem.quantity + 1,
                    typeof item.stock === "number"
                      ? item.stock
                      : typeof cartItem.stock === "number"
                        ? cartItem.stock
                        : Number.MAX_SAFE_INTEGER
                  ),
                ...(typeof item.stock === "number"
                  ? { stock: item.stock }
                  : {}),
              }
            : cartItem
      );
    }

    return [
      ...previousItems,
      {
        ...item,
        quantity: 1,
      },
    ];
  });

  return { added: true };
};

  // Remove item from cart
  const removeItem = (itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId));
  };

  // Update item quantity
  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(itemId);
      return;
    }
    setItems(prev =>
      prev.map(i =>
        i.id === itemId
          ? {
              ...i,
              quantity: Math.min(
                quantity,
                typeof i.stock === "number"
                  ? i.stock
                  : Number.MAX_SAFE_INTEGER
              ),
            }
          : i
      )
    );
  };

  // Clear cart
  const clearCart =
  async (): Promise<void> => {
    setItems([]);

    if (currentUser && isCustomerCartSession) {
      await clearCartFromFirestore(
        currentUser.uid
      );
    }
  };

  const repeatCompletedOrder = async (orderId: string) => {
    if (!currentUser || !isCustomerCartSession) {
      throw new Error("Sign in again before repeating an order.");
    }

    const result = await repeatCompletedOrderInCart(
      currentUser.uid,
      orderId,
    );

    setItems(result.items);
    return {
      skippedProductNames: result.skippedProductNames,
    };
  };

  // Get store ID (all items should be from same store)
  const getStoreId = () => {
    if (items.length === 0) return null;
    return items[0].storeId;
  };

  // Get quantity for a specific item
  const getItemQuantity = (itemId: string): number => {
    const item = items.find(i => i.id === itemId);
    return item?.quantity || 0;
  };

  // Get items for a specific store
  const getStoreItems = (storeId: string): CartItem[] => {
    return items.filter(item => item.storeId === storeId);
  };

  // Get item count for a specific store
  const getStoreItemCount = (storeId: string): number => {
    const storeItems = items.filter(item => item.storeId === storeId);
    return storeItems.reduce((sum, item) => sum + item.quantity, 0);
  };

  // Get total price for a specific store
  const getStoreTotalPrice = (storeId: string): number => {
    const storeItems = items.filter(item => item.storeId === storeId);
    return storeItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  // Calculate total items across all stores
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  // Calculate total price across all stores
  const totalPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <CartContext.Provider value={{
      items,
      itemCount,
      totalPrice,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      repeatCompletedOrder,
      getStoreId,
      getItemQuantity,
      getStoreItems,
      getStoreItemCount,
      getStoreTotalPrice,
      isLoading,
    }}>
      {children}

      {cartNotice && (
        <div
          className="fixed inset-x-4 top-4 z-[120] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-orange-950 shadow-xl"
          role="alert"
          aria-live="assertive"
        >
          <p className="flex-1 text-sm font-semibold leading-5">
            {cartNotice}
          </p>
          <button
            type="button"
            onClick={() => setCartNotice(null)}
            className="-mr-1 -mt-1 rounded-lg px-2 py-1 text-lg leading-none transition hover:bg-orange-100"
            aria-label="Dismiss cart message"
          >
            ×
          </button>
        </div>
      )}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
