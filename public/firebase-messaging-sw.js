/* eslint-disable no-undef */

/*
|--------------------------------------------------------------------------
| Firebase Messaging Service Worker
|--------------------------------------------------------------------------
|
| Handles background push notifications.
|
| This file runs independently from the React application.
|
*/

importScripts(
  "https://www.gstatic.com/firebasejs/12.2.1/firebase-app-compat.js"
);

importScripts(
  "https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "__API_KEY__",
  authDomain: "__AUTH_DOMAIN__",
  projectId: "__PROJECT_ID__",
  storageBucket: "__STORAGE_BUCKET__",
  messagingSenderId: "__MESSAGING_SENDER_ID__",
  appId: "__APP_ID__",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {

  console.log(
    "[firebase-messaging-sw] Background Message:",
    payload
  );

  const notificationTitle =
    payload.notification?.title ?? "LIA";

  const notificationOptions = {
    body: payload.notification?.body,
    icon: "/icon/icon-192.png",
    badge: "/icon/icon-192.png",
  };

  self.registration.showNotification(
    notificationTitle,
    notificationOptions
  );

});