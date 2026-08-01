/*
  Deprecated Store Stripe Account Route.

  Store Stripe Connect now uses authenticated Firebase callable Functions so
  Vercel never loads Firebase Admin or the Stripe secret for this operation.
*/
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Store Stripe Connect now uses Firebase callable Functions.", code: "ROUTE_RETIRED" },
    { status: 410 },
  );
}
