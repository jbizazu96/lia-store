/* Store Stripe status is now synchronized by Firebase callable Functions. */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Store Stripe Connect now uses Firebase callable Functions.", code: "ROUTE_RETIRED" },
    { status: 410 },
  );
}
