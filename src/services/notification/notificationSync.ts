"use client";

export type NotificationWorkspace = "user" | "admin" | "driver";

export interface NotificationMutation {
  workspace: NotificationWorkspace;
  action: "read-one" | "read-all" | "clear-all";
  notificationId?: string;
}

const EVENT_NAME = "lia:notification-mutation";

export function publishNotificationMutation(detail: NotificationMutation): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<NotificationMutation>(EVENT_NAME, {detail}));
  }
}

export function listenForNotificationMutations(
  workspace: NotificationWorkspace,
  listener: (mutation: NotificationMutation) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handler = (event: Event) => {
    const mutation = (event as CustomEvent<NotificationMutation>).detail;
    if (mutation?.workspace === workspace) listener(mutation);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
