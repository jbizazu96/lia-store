"use client";

/*
  Store Info Page
  Displays store details including map, address, schedule, and contact info.
  ✅ Back button to return to store
  ✅ Map placeholder with store location
  ✅ Address with navigation link
  ✅ Store schedule
  ✅ Phone number with call link
*/

import type { CustomerStore } from "@/types/view-models/customerStore";
import { storeService } from "@/services/store/storeService";
import { storeMapper } from "@/mappers/storeMapper";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Clock,
  ChevronRight,
  Navigation,
  Store,
  Star,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface ScheduleDay {
  day: string;
  open: string;
  close: string;
  isClosed: boolean;
}


interface StoreInfoPageProps {params: Promise<{storeId: string;}>;}export default function StoreInfoPage({params,}: StoreInfoPageProps) {
  const router = useRouter();
  const { storeId } = use(params);
  const [store, setStore] = useState<CustomerStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStore = async () => {
           try {
            setLoading(true);

          const domainStore = await storeService.getStore(storeId);

          if (!domainStore) {
            setError("Store not found");
            return;
          }

            const customerStore = storeMapper.toCustomerStore(domainStore);

            setStore(customerStore);
          } catch (error) {
            console.error("Error fetching store:", error);
           setError("Failed to load store information");
         } finally {
           setLoading(false);
        }
    };

    fetchStore();
    }, [storeId]);

  // Format time for display
  const formatTime = (time: string) => {
    if (!time || time === "00:00") return "Closed";
    const [hours, minutes] = time.split(":").map(Number);
    const ampm = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 || 12;
    return `${h12}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  };

  // Format schedule for display
  const formatSchedule = (schedule: ScheduleDay[]) => {
    if (!schedule || schedule.length === 0) {
      return [
        { day: "Mon", open: "", close: "", isClosed: true },
        { day: "Tue", open: "", close: "", isClosed: true },
        { day: "Wed", open: "", close: "", isClosed: true },
        { day: "Thu", open: "", close: "", isClosed: true },
        { day: "Fri", open: "", close: "", isClosed: true },
        { day: "Sat", open: "", close: "", isClosed: true },
        { day: "Sun", open: "", close: "", isClosed: true },
      ];
    }

    const dayMap: { [key: string]: string } = {
      Monday: "Mon",
      Tuesday: "Tue",
      Wednesday: "Wed",
      Thursday: "Thu",
      Friday: "Fri",
      Saturday: "Sat",
      Sunday: "Sun",
    };

    return schedule.map(day => ({
      ...day,
      day: dayMap[day.day] || day.day.substring(0, 3),
    }));
  };

  // Check if today
  const isToday = (day: string) => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const today = days[new Date().getDay()];
    return day === today;
  };

  // Get today's schedule
  const getTodaySchedule = (schedule: ScheduleDay[]) => {
    if (!schedule || schedule.length === 0) return null;
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const today = days[new Date().getDay()];
    return schedule.find(s => s.day === today);
  };

  // Get current day status
  const getCurrentStatus = (schedule: ScheduleDay[]) => {
    const today = getTodaySchedule(schedule);
    if (!today) {
      return { isOpen: false, message: "No schedule set" };
    }

    if (today.isClosed) {
      return { isOpen: false, message: "Closed today" };
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const [openHours, openMinutes] = today.open.split(":").map(Number);
    const [closeHours, closeMinutes] = today.close.split(":").map(Number);
    const openTime = openHours * 60 + openMinutes;
    const closeTime = closeHours * 60 + closeMinutes;

    const isCurrentlyOpen = currentTime >= openTime && currentTime < closeTime;

    return {
      isOpen: isCurrentlyOpen,
      message: isCurrentlyOpen
        ? `Open until ${formatTime(today.close)}`
        : `Opens at ${formatTime(today.open)}`,
    };
  };

  // Build Google Maps URL for navigation
  const getMapsUrl = () => {
    if (!store) return "#";
    const address = `${store.address}, ${store.city}, ${store.state} ${store.zip}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  };

  // Build Google Maps URL for the map image (static map)
  const getStaticMapUrl = () => {
    if (!store) return "";
    const address = `${store.address}, ${store.city}, ${store.state} ${store.zip}`;
    return `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=15&size=600x300&markers=color:red%7C${encodeURIComponent(address)}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
  };

  // Build phone link
  const getPhoneLink = () => {
    if (!store || !store.phone) return "#";
    return `tel:${store.phone.replace(/\s/g, "")}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Store className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Store Not Found</h2>
          <p className="text-gray-500 text-sm mb-4">{error || "This store doesn't exist"}</p>
          <button
            onClick={() => router.back()}
            className="px-6 py-2.5 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const formattedSchedule = formatSchedule(store.schedule ?? []);
  const todayStatus = getCurrentStatus(store.schedule ?? []);
  const fullAddress = `${store.address}, ${store.city}, ${store.state} ${store.zip}`;

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      {/* Header with Back Button */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-full transition"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-800 truncate">{store.name}</h1>
        </div>
      </div>

      {/* Map Section */}
      <div className="relative w-full h-64 bg-gray-200">
        {store.address ? (
          <>
            {/* Static Map Image */}
            <img
              src={getStaticMapUrl()}
              alt={`${store.name} location`}
              className="w-full h-full object-cover"
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = "/images/store-map-placeholder.png";
              }}
            />
            {/* Map attribution */}
            <div className="absolute bottom-2 right-2 bg-white/80 backdrop-blur-sm px-2 py-1 rounded text-xs text-gray-500">
              Google Maps
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Location not available</p>
            </div>
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-6 relative z-10">
        {/* Store Info Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100"
        >
          {/* Store Name */}
          <div className="flex items-center gap-3 mb-4">
            {store.logoUrl && (
              <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                <Image
                  src={store.logoUrl}
                  alt={store.name}
                  fill
                  className="object-cover"
                />
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-gray-800">{store.name}</h2>
              {(store.rating ?? 0) > 0 && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-medium text-gray-700">{store.rating ?? 0}</span>
                  <span className="text-xs text-gray-400">({store.reviewCount} reviews)</span>
                </div>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 mb-4">
            <div className={`w-2 h-2 rounded-full ${todayStatus.isOpen ? "bg-green-500" : "bg-red-500"}`} />
            <span className={`text-sm font-medium ${todayStatus.isOpen ? "text-green-600" : "text-red-600"}`}>
              {todayStatus.isOpen ? "Open" : "Closed"}
            </span>
            {todayStatus.message && (
              <span className="text-xs text-gray-400">• {todayStatus.message}</span>
            )}
          </div>

          {/* Address */}
          {store.address && (
            <div className="flex items-center justify-between py-3 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <MapPin className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{store.address}</p>
                  <p className="text-xs text-gray-400">{store.city}, {store.state} {store.zip}</p>
                </div>
              </div>
              <a
                href={getMapsUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-gray-100 rounded-full transition"
                aria-label="Open in maps"
              >
                <Navigation className="w-5 h-5 text-orange-500" />
              </a>
            </div>
          )}

          {/* Phone */}
          {store.phone && (
            <div className="flex items-center justify-between py-3 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-50 rounded-lg">
                  <Phone className="w-4 h-4 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{store.phone}</p>
                  <p className="text-xs text-gray-400">Call store</p>
                </div>
              </div>
              <a
                href={getPhoneLink()}
                className="p-2 hover:bg-gray-100 rounded-full transition"
                aria-label="Call store"
              >
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </a>
            </div>
          )}

          {/* Schedule */}
          <div className="py-3 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 bg-orange-50 rounded-lg">
                <Clock className="w-4 h-4 text-orange-500" />
              </div>
              <p className="text-sm font-medium text-gray-800">Store Hours</p>
            </div>

            <div className="space-y-1.5">
              {formattedSchedule.map((day, index) => {
                const today = isToday(
                  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][index]
                );
                const isClosed = day.isClosed || !day.open || !day.close;

                return (
                  <div
                    key={day.day}
                    className={`flex items-center justify-between text-sm ${
                      today ? "font-semibold text-gray-800" : "text-gray-600"
                    }`}
                  >
                    <span className={today ? "font-semibold" : ""}>
                      {day.day}
                      {today && " (Today)"}
                    </span>
                    <span className={isClosed ? "text-gray-400" : ""}>
                      {isClosed ? "Closed" : `${formatTime(day.open)} - ${formatTime(day.close)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
