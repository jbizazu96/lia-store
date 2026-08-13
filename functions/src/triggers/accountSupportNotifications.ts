import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {notifyActiveAdministrators} from "../admin/adminNotificationService";
import {queueAdminActionEmail} from "../email/emailEventService";

type Data = Record<string, unknown>;
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";

export const accountSupportRequestCreated = onDocumentCreated({document: "accountSupportRequests/{requestId}", region: "us-central1", database: "default"}, async (event) => {
  const data = (event.data?.data() ?? {}) as Data; const requestId = event.params.requestId;
  const ownerType = text(data.ownerType) || "account"; const ownerName = text(data.ownerName) || "A user"; const reason = text(data.reason).replace(/_/g, " ") || "support";
  await Promise.all([
    notifyActiveAdministrators({title: `New ${ownerType} support request`, body: `${ownerName} requested help with ${reason}.`, type: "account", deepLink: `/admin/support?request=${encodeURIComponent(requestId)}`, subject: {type: "account-support", id: requestId}, dedupeKey: `account-support-${requestId}`}),
    queueAdminActionEmail({dedupeKey: `admin-account-support:${requestId}`, category: "admin_support", title: `New ${ownerType} support request`, summary: `${ownerName} requested help with ${reason}.`, path: `/admin/support?request=${encodeURIComponent(requestId)}`}),
  ]);
});
