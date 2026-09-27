import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "cspm_session";
const PUBLIC_ROUTES = new Set(["/login", "/signup"]);
const PUBLIC_PREFIXES = ["/v1/kb"];

function isStaticAsset(pathname: string) {
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/robots.txt")) return true;
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isStaticAsset(pathname)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const isPublic = PUBLIC_ROUTES.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (isPublic) {
    if (hasSession && PUBLIC_ROUTES.has(pathname)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"]
};
