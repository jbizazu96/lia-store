"use client";

/*
  Notification preferences section.
*/

import {Bell, Mail, ShoppingBag, Megaphone, Smartphone} from "lucide-react";

interface NotificationsSectionProps {
  storeData: any;
  setStoreData: (data: any) => void;
}

export function NotificationsSection({storeData, setStoreData}: NotificationsSectionProps) {
  const toggleSetting = (key: string) => {
    setStoreData({
      ...storeData,
      [key]: !storeData?.[key],
    });
  };

  const notifications = [
    {
      id: "orderNotifications",
      label: "Order Notifications",
      description: "Get notified when new orders come in",
      icon: ShoppingBag,
    },
    {
      id: "emailNotifications",
      label: "Email Notifications",
      description: "Receive updates via email",
      icon: Mail,
    },
    {
      id: "marketingEmails",
      label: "Marketing Emails",
      description: "Receive promotional offers and updates",
      icon: Megaphone,
    },
    {
      id: "pushNotifications",
      label: "Push Notifications",
      description: "Get real-time alerts on your device",
      icon: Smartphone,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-5 h-5 text-gray-400" />
          <h3 className="font-bold text-gray-800">Notification Preferences</h3>
        </div>

        <div className="space-y-3">
          {notifications.map((item) => {
            const Icon = item.icon;
            const isEnabled = storeData?.[item.id] !== false;
            
            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                    <Icon className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleSetting(item.id)}
                  className={`relative w-12 h-6 rounded-full transition ${
                    isEnabled ? "bg-orange-500" : "bg-gray-300"
                  }`}
                  aria-label={`Toggle ${item.label}`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition ${
                      isEnabled ? "right-0.5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}