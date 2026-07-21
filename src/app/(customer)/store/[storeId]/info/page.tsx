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

import {
  buildStoreAddress,
  getStoreMapsUrl,
  getStorePhoneUrl,
  getStoreStaticMapUrl,
} from "@/utils/storeLinks";
import { useStoreInfo } from "@/hooks/useStoreInfo";
import {
  formatStoreTime,
  getStoreStatus,
} from "@/services/store/storeSchedule";
import { use } from "react";
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
import { BrandedLoader } from "@/components/ui/BrandedLoader";


interface StoreInfoPageProps {params: Promise<{storeId: string;}>;}export default function StoreInfoPage({params,}: StoreInfoPageProps) {
  const router = useRouter();
  const { storeId } = use(params);

  const {store,loading,error,} = useStoreInfo({
        storeId,
      });
     


  if (loading) {
    return <BrandedLoader message="Loading Store Information" />;
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

          const storeStatus = getStoreStatus(
          store.schedule,
          store.isOpen
        );

        const fullSchedule = [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ];

        const todayName = new Intl.DateTimeFormat(
          "en-US",
          {
            weekday: "long",
          }
        ).format(new Date());

        const formattedSchedule =
          fullSchedule.map((dayName) => {
            const scheduleDay =
              store.schedule?.find(
                (day) =>
                  day.day === dayName
              );

            return {
              day: dayName.substring(0, 3),

              fullDay: dayName,

              open:
                scheduleDay?.open ?? "",

              close:
                scheduleDay?.close ?? "",

              isClosed:
                scheduleDay?.isClosed ??
                true,
            };
          });

      const fullAddress = buildStoreAddress(store);
      const mapsUrl = getStoreMapsUrl(store);
      const staticMapUrl = getStoreStaticMapUrl(
        store,
        process.env
          .NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      );

const phoneUrl =
  getStorePhoneUrl(store.phone);
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
              src={staticMapUrl}
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
              <div className={`w-2 h-2 rounded-full ${storeStatus.statusColor}`}/>
              <span className={`text-sm font-medium ${storeStatus.textColor}`}>
                {storeStatus.statusText}
              </span>
              <span className="text-xs text-gray-400">
                • {storeStatus.message}
              </span>
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
                href={mapsUrl}
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
                href={phoneUrl}
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
              {formattedSchedule.map((day) => {
                const today =
                  day.fullDay === todayName;

                const isClosed =
                  day.isClosed ||
                  !day.open ||
                  !day.close;

                return (
                  <div
                    key={day.fullDay}
                    className={`flex items-center justify-between text-sm ${
                      today
                        ? "font-semibold text-gray-800"
                        : "text-gray-600"
                    }`}
                  >
                    <span>
                      {day.day}
                      {today && " (Today)"}
                    </span>

                    <span
                      className={
                        isClosed
                          ? "text-gray-400"
                          : ""
                      }
                    >
                      {isClosed
                        ? "Closed"
                        : `${formatStoreTime(
                            day.open
                          )} - ${formatStoreTime(
                            day.close
                          )}`}
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
