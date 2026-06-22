"use client";

import {usePathname} from "next/navigation";
import {useState, useEffect} from "react";
import Link from "next/link";
import {Home, Package, User} from "lucide-react";
import {auth} from "@/lib/firebase";
import {onAuthStateChanged} from "firebase/auth";
import {doc, getDoc} from "firebase/firestore";
import {db} from "@/lib/firebase";

export function BottomNavigation() {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Check user role
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            setUserRole(userDoc.data().accountType || "customer");
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
        }
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Determine if bottom nav should be shown
  const shouldShowBottomNav = () => {
    // If still loading, don't show
    if (loading) return false;

    // Only show for customers
    if (userRole !== "customer") return false;

    // Hide on login/register
    if (pathname === "/login") return false;
    if (pathname === "/register") return false;

    // Hide on store routes
    if (pathname.startsWith("/store")) return false;

    // Hide on admin routes
    if (pathname.startsWith("/admin")) return false;

    // Show on customer routes
    return true;
  };

  // If we shouldn't show the bottom nav, return null
  if (!shouldShowBottomNav()) {
    return null;
  }

  const navItems = [
    {name: "Home", icon: Home, href: "/home"},
    {name: "Orders", icon: Package, href: "/orders"},
    {name: "Profile", icon: User, href: "/profile"},
  ];

  // Determine which tab is active based on current path
  const getActiveTab = () => {
    if (pathname === "/home" || pathname === "/") return "home";
    if (pathname.startsWith("/orders")) return "orders";
    if (pathname.startsWith("/profile")) return "profile";
    return "home";
  };

  const activeTab = getActiveTab();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom">
      <div className="flex items-center justify-around max-w-md mx-auto h-16 px-4">
        {navItems.map((item) => {
          const isActive = activeTab === item.name.toLowerCase();
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className="flex flex-col items-center gap-0.5 group relative"
              aria-label={`Navigate to ${item.name}`}
            >
              {/* Active indicator dot */}
              {isActive && (
                <div className="absolute -top-0.5 w-1 h-1 bg-orange-500 rounded-full" />
              )}
              
              <div className={`p-1.5 rounded-full transition ${
                isActive ? "text-orange-600" : "text-gray-500"
              }`}>
                <item.icon className={`w-6 h-6 transition ${
                  isActive ? "text-orange-600" : "text-gray-500"
                }`} />
              </div>
              
              <span className={`text-xs font-medium transition ${
                isActive ? "text-orange-600" : "text-gray-500"
              }`}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}