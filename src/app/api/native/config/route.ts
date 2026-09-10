import {NextResponse} from "next/server";

export const dynamic = "force-dynamic";

function value(name: string): string | null {
  const result = process.env[name]?.trim();
  return result || null;
}

export async function GET() {
  return NextResponse.json({
    handshakeVersion: 1,
    platforms: {
      ios: {
        minimumVersion: value("NATIVE_IOS_MINIMUM_VERSION"),
        latestVersion: value("NATIVE_IOS_LATEST_VERSION"),
        storeUrl: value("NATIVE_IOS_STORE_URL"),
      },
      android: {
        minimumVersion: value("NATIVE_ANDROID_MINIMUM_VERSION"),
        latestVersion: value("NATIVE_ANDROID_LATEST_VERSION"),
        storeUrl: value("NATIVE_ANDROID_STORE_URL"),
      },
    },
  }, {headers: {"Cache-Control": "no-store"}});
}
