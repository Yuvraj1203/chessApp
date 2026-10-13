import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE = "koc_token";

/**
 * Coarse, edge-level route protection: no session cookie => /login.
 * This only checks the cookie's presence; the API verifies the JWT and the
 * role on every request, and the (app) layout re-checks via GET /me.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(AUTH_COOKIE);

  if (pathname === "/login") {
    return hasSession
      ? NextResponse.redirect(new URL("/tournaments", request.url))
      : NextResponse.next();
  }
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/tournaments", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
