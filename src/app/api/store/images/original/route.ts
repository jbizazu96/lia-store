/*
  Deprecated Store Image Upload Route.

  Store images now upload to the owner-protected Firebase Storage path and
  onboarding metadata is saved by callable Cloud Functions. Keeping this
  explicit response prevents an old client from using a Vercel Admin-SDK
  route while preserving a clear migration response during development.
*/
import {
  NextResponse,
} from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Store image uploads now use the secure Firebase Storage flow. Update the application and try again.",
    },
    { status: 410 },
  );
}
