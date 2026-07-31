import { NextResponse } from "next/server";
import { isFirebaseAuthenticationError, requireFirebaseUser } from "@/lib/auth/requireFirebaseUser";
import { serverDriverWorkspaceService } from "@/services/driver/serverDriverWorkspaceService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    return NextResponse.json(await serverDriverWorkspaceService.getSummary(user.uid), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    /*
     * This is server-only diagnostic output. The client receives a safe,
     * non-sensitive error message below.
     */
    console.error("Driver workspace request failed:", error);
    const unauthorized = isFirebaseAuthenticationError(error) || error instanceof Error && error.message === "DRIVER_FORBIDDEN";
    return NextResponse.json({ error: unauthorized ? "You do not have access to the driver workspace." : "Unable to load the driver workspace." }, { status: unauthorized ? 403 : 500 });
  }
}
