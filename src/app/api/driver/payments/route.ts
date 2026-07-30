import { NextResponse } from "next/server";
import { isFirebaseAuthenticationError, requireFirebaseUser } from "@/lib/auth/requireFirebaseUser";
import { serverDriverWorkspaceService } from "@/services/driver/serverDriverWorkspaceService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    return NextResponse.json(await serverDriverWorkspaceService.getPayments(user.uid), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const unauthorized = isFirebaseAuthenticationError(error) || error instanceof Error && error.message === "DRIVER_FORBIDDEN";
    return NextResponse.json({ error: unauthorized ? "You do not have access to driver payments." : "Unable to load driver payments." }, { status: unauthorized ? 403 : 500 });
  }
}

