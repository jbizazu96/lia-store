import { NextResponse } from "next/server";
import { isFirebaseAuthenticationError, requireFirebaseUser } from "@/lib/auth/requireFirebaseUser";
import { serverDriverWorkspaceService } from "@/services/driver/serverDriverWorkspaceService";

export const runtime = "nodejs";

function failed(error: unknown) {
  const unauthorized = isFirebaseAuthenticationError(error) || error instanceof Error && error.message === "DRIVER_FORBIDDEN";
  return NextResponse.json({ error: unauthorized ? "You do not have access to driver notifications." : "Unable to manage driver notifications." }, { status: unauthorized ? 403 : 500 });
}

export async function GET(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    return NextResponse.json({ notifications: await serverDriverWorkspaceService.getNotifications(user.uid) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failed(error); }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    const body = await request.json().catch(() => null) as { notificationId?: unknown } | null;
    const notificationId = typeof body?.notificationId === "string" ? body.notificationId.trim() : "";
    if (!notificationId) return NextResponse.json({ error: "A notification is required." }, { status: 400 });
    await serverDriverWorkspaceService.markNotificationRead(user.uid, notificationId);
    return NextResponse.json({ success: true });
  } catch (error) { return failed(error); }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    await serverDriverWorkspaceService.clearNotifications(user.uid);
    return NextResponse.json({ success: true });
  } catch (error) { return failed(error); }
}

