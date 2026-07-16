"use client";

import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export default function TestNotificationPage() {

  const sendNotification = async () => {

    try {

      const sendTestNotification =
        httpsCallable(
          functions,
          "sendTestNotification"
        );

      await sendTestNotification();

      alert("Notification sent!");

    } catch (error) {

      console.error(error);

      alert("Failed to send notification.");

    }

  };

  return (

    <main className="min-h-screen flex items-center justify-center">

      <button
        onClick={sendNotification}
        className="bg-green-600 text-white px-6 py-3 rounded-xl"
      >
        Send Test Notification
      </button>

    </main>

  );

}