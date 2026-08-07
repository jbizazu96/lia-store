/*
|--------------------------------------------------------------------------
| Admin Notification Types
|--------------------------------------------------------------------------
*/

export interface AdminNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  createdAt: string;
  deepLink: string | null;
  subject: {
    type: string | null;
    id: string | null;
  };
}
