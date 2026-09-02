import {NextResponse} from "next/server";

export const dynamic = "force-dynamic";

const CUSTOMER_LINK_PATHS = [
  "/checkout/payment-result",
  "/checkout/payment-result/*",
  "/orders/*",
  "/help/*",
  "/legal/*",
  "/product/*",
  "/store/*",
];

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const appId = "com.liamarketplace.customer";

  if (!teamId || !/^[A-Z0-9]{10}$/.test(teamId)) {
    return NextResponse.json(
      {error: "Apple Universal Links are not configured."},
      {status: 503, headers: {"Cache-Control": "no-store"}},
    );
  }

  return NextResponse.json({
    applinks: {
      apps: [],
      details: [{
        appID: `${teamId}.${appId}`,
        paths: CUSTOMER_LINK_PATHS,
      }],
    },
  }, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Content-Type": "application/json",
    },
  });
}
