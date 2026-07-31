import { NextResponse } from "next/server";
import { isFirebaseAuthenticationError, requireFirebaseUser } from "@/lib/auth/requireFirebaseUser";
import { serverDriverWorkspaceService } from "@/services/driver/serverDriverWorkspaceService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    return NextResponse.json(await serverDriverWorkspaceService.getEntry(user.uid), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    /*
     * Keep implementation details off the browser, but retain the original
     * error in Vercel logs so a deployment-only failure can be diagnosed.
     */
    console.error("Driver entry request failed:", error);
    const unauthorized = isFirebaseAuthenticationError(error) || error instanceof Error && error.message === "DRIVER_FORBIDDEN";
    return NextResponse.json({ error: unauthorized ? "You do not have access to the driver app." : "Unable to open the driver app." }, { status: unauthorized ? 403 : 500 });
  }
}
