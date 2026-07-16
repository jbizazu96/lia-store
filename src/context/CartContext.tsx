"use client";

/*
  Cart context for managing cart state across the app.
  ✅ Persistent cart stored in Firestore with 48-hour expiry.
*/

import {createContext, useContext, useState, useEffect, ReactNode} from "react";
import {auth} from "@/lib/firebase";
import {onAuthStateChanged} from "firebase/auth";
import {
  CartItem,
  saveCartToFirestore,
  loadCartFromFirestore,
  clearCartFromFirestore,
} from "@/services/cart/cartService";

interface CartContextType {
  items: CartItem[];
  itemCount: number;
  totalPrice: number;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
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
  const [currentUser, setCurrentUser] = useState<any>(null);

  // ✅ Load cart from Firestore on auth change
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        setIsLoading(true);
        try {
          const savedItems = await loadCartFromFirestore(user.uid);
          if (savedItems) {
            setItems(savedItems);
          } else {
            setItems([]);
          }
        } catch (error) {
          console.error("Error loading cart:", error);
          setItems([]);
        } finally {
          setIsLoading(false);
        }
      } else {
        // User logged out - keep items in memory but don't clear
        // They will be saved again when user logs in
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // ✅ Save cart to Firestore whenever it changes (debounced)
  useEffect(() => {
    if (!currentUser) return;

    // Debounce saves to avoid too many writes
    const timeoutId = setTimeout(() => {
      if (items.length > 0) {
        saveCartToFirestore(currentUser.uid, items);
      } else {
        // If cart is empty, clear it from Firestore
        clearCartFromFirestore(currentUser.uid);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [items, currentUser]);

  // Add item to cart
  const addItem = (item: Omit<CartItem, "quantity">) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i =>
          i.id === item.id ? {...i, quantity: i.quantity + 1} : i
        );
      }
      return [...prev, {...item, quantity: 1}];
    });
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
        i.id === itemId ? {...i, quantity} : i
      )
    );
  };

  // Clear cart
  const clearCart = () => {
    setItems([]);
    if (currentUser) {
      clearCartFromFirestore(currentUser.uid);
    }
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
      getStoreId,
      getItemQuantity,
      getStoreItems,
      getStoreItemCount,
      getStoreTotalPrice,
      isLoading,
    }}>
      {children}
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