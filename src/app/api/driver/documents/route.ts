import { NextResponse } from "next/server";
import { isFirebaseAuthenticationError, requireFirebaseUser } from "@/lib/auth/requireFirebaseUser";
import { serverDriverWorkspaceService } from "@/services/driver/serverDriverWorkspaceService";

const accepted = ["drivers-license-front", "drivers-license-back", "vehicle-insurance", "vehicle-registration"] as const;
type DocumentField = (typeof accepted)[number];
function valid(value: unknown): value is DocumentField { return typeof value === "string" && accepted.includes(value as DocumentField); }

export async function PATCH(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    const body = await request.json().catch(() => null) as { field?: unknown; expirationDate?: unknown; issuingState?: unknown; provider?: unknown } | null;
    if (!valid(body?.field)) return NextResponse.json({ error: "A valid document type is required." }, { status: 400 });
    await serverDriverWorkspaceService.submitDocumentReplacement(user.uid, {
      field: body.field,
      expirationDate: typeof body.expirationDate === "string" ? body.expirationDate : "",
      issuingState: typeof body.issuingState === "string" ? body.issuingState : undefined,
      provider: typeof body.provider === "string" ? body.provider : undefined,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const unauthorized = isFirebaseAuthenticationError(error) || error instanceof Error && error.message === "DRIVER_FORBIDDEN";
    const invalid = error instanceof Error && error.message === "INVALID_DOCUMENT";
    return NextResponse.json({ error: invalid ? "Enter a valid future expiration date and license issuing state." : unauthorized ? "You do not have access to these documents." : "Unable to submit the replacement document." }, { status: invalid ? 400 : unauthorized ? 403 : 500 });
  }
}
