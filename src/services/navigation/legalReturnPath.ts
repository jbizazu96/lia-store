const allowedWorkspacePaths = [
  "/home", "/profile", "/orders", "/notifications", "/cart", "/checkout",
  "/store", "/driver", "/admin",
];

export function legalReturnPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  const pathname = value.split(/[?#]/, 1)[0];
  return allowedWorkspacePaths.some((allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`)) ? value : "/";
}

export function legalDocumentHref(path: string, returnTo: string): string {
  return returnTo === "/" ? path : `${path}?returnTo=${encodeURIComponent(returnTo)}`;
}
