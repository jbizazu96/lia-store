import {NextResponse} from "next/server";

export const dynamic = "force-dynamic";

function safeOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 500);
  } catch {
    return value.slice(0, 500);
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 16_384) {
    return NextResponse.json({error: "Report too large"}, {status: 413});
  }

  try {
    const payload = await request.json() as Record<string, unknown>;
    const report = (payload["csp-report"] ?? payload.body ?? payload) as Record<string, unknown>;
    console.warn("CSP report-only violation", {
      document: safeOrigin(report["document-uri"] ?? report.documentURL),
      blocked: safeOrigin(report["blocked-uri"] ?? report.blockedURL),
      directive: report["effective-directive"] ?? report.effectiveDirective,
      disposition: report.disposition,
    });
  } catch {
    return NextResponse.json({error: "Invalid CSP report"}, {status: 400});
  }

  return new NextResponse(null, {status: 204});
}
