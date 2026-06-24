"use client";

/*
  Cart context for managing cart state across the app.
  Provides cart count, items, add/remove functions.
*/

import {createContext, useContext, useState, useEffect, ReactNode} from "react";
import {auth} from "@/lib/firebase";

interface CartItem {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
  quantity: number;
  storeId: string;
  storeName: string;
  size?: {
    value: number;
    unit: string;
  };
}

interface CartContextType {
  items: CartItem[];
  itemCount: number;
  totalPrice: number;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  getStoreId: () => string | null;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({children}: {children: ReactNode}) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Load cart from localStorage on mount
  useEffect(() => {
    const loadCart = async () => {
      const user = auth.currentUser;
      if (user) {
        const savedCart = localStorage.getItem(`cart_${user.uid}`);
        if (savedCart) {
          try {
            setItems(JSON.parse(savedCart));
          } catch {
            setItems([]);
          }
        }
      }
    };
    loadCart();
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      localStorage.setItem(`cart_${user.uid}`, JSON.stringify(items));
    }
  }, [items]);

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
  };

  // Get store ID (all items should be from same store)
  const getStoreId = () => {
    if (items.length === 0) return null;
    return items[0].storeId;
  };

  // Calculate total items
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  // Calculate total price
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