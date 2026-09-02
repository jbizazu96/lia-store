import {NextResponse} from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const fingerprints = (process.env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS ??
    process.env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINT ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  if (!fingerprints.length || fingerprints.some(
    (fingerprint) => !/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fingerprint),
  )) {
    return NextResponse.json(
      {error: "Android App Links are not configured."},
      {status: 503, headers: {"Cache-Control": "no-store"}},
    );
  }

  return NextResponse.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.liamarketplace.customer",
      sha256_cert_fingerprints: fingerprints,
    },
  }], {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Content-Type": "application/json",
    },
  });
}
