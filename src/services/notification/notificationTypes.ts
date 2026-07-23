/*
|--------------------------------------------------------------------------
| Notification Domain Model
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Defines the Notification model used throughout LIA.
|
| This is OUR business model.
|
| It is NOT:
|   • Firebase Cloud Messaging
|   • Firestore document
|   • Apple Push Notification
|   • Android Notification
|
*/

/**
 * Notification categories.
 */
export type NotificationType =
  | "order"
  | "delivery"
  | "inventory"
  | "promotion"
  | "system";

/**
 * Notification model.
 */
export interface Notification {

  /**
   * Firestore document ID.
   */
  id: string;

  /**
   * User that owns this notification.
   */
  uid: string;

  /**
   * Notification title.
   */
  title: string;

  /**
   * Notification body.
   */
  body: string;

  /**
   * Notification category.
   */
  type: NotificationType;

  /**
   * Icon displayed in the notification list.
   *
   * Examples:
   * truck
   * shopping-bag
   * check-circle
   * bell
   */
  icon: string;

  /**
   * Tailwind color used by the icon.
   *
   * Example:
   * blue
   * green
   * orange
   * red
   */
  color: string;

  /**
   * Opens a page when tapped.
   *
   * Example:
   * /orders/abc123
   */
  deepLink?: string;

  /**
   * Related order.
   */
  orderId?: string;

  /**
   * Has the notification been opened?
   */
  read: boolean;

  /**
   * Creation date.
   */
  createdAt: Date;

}
